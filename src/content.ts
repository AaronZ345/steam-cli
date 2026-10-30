import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  lstatSync,
  createReadStream,
  chmodSync,
} from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { appid, assert, number, CliError } from "./core.js";
import { safePath } from "./local-data.js";
import { withClient } from "./network.js";

export async function hashFile(
  file: string,
  algorithm = "sha1",
): Promise<string> {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export function manifestPath(root: string, name: string): string {
  assert(
    typeof name === "string" &&
      !name.includes("\0") &&
      !path.posix.isAbsolute(name) &&
      !path.win32.isAbsolute(name),
    "INVALID_MANIFEST",
    "Depot 路径无效",
  );
  const normalized = name.replaceAll("\\", "/");
  assert(
    normalized.split("/").every((p) => p !== "." && p !== ".." && p !== ""),
    "INVALID_MANIFEST",
    "Depot 路径含目录穿越或空段",
  );
  return safePath(root, ...normalized.split("/"));
}
export function unified(
  user: any,
  method: string,
  params: any,
  write = false,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new CliError(
            write ? "WRITE_UNKNOWN" : "NETWORK_ERROR",
            `${method.split(".")[0]} 请求超时`,
          ),
        ),
      30000,
    );
    try {
      user._sendUnified(method, params, (body: any, header: any) => {
        clearTimeout(timer);
        const result = header?.proto?.eresult ?? body?.eresult ?? 1;
        if (result !== 1) {
          reject(
            new CliError(
              result === 5 || result === 63 || result === 65
                ? "AUTH_FAILED"
                : result === 15
                  ? "ACCESS_DENIED"
                  : "API_ERROR",
              `Steam EResult ${result}`,
            ),
          );
          return;
        }
        resolve(body);
      });
    } catch {
      clearTimeout(timer);
      reject(
        new CliError(
          write ? "WRITE_UNKNOWN" : "API_ERROR",
          "Steam 客户端协议请求失败",
        ),
      );
    }
  });
}
export interface ContentClient {
  getProductInfo: (
    apps: number[],
    packages: number[],
    tokens: boolean,
  ) => Promise<any>;
  getManifest: (
    app: number,
    depot: number,
    manifest: string,
    branch: string,
    password?: string,
  ) => Promise<any>;
  downloadFile: (
    app: number,
    depot: number,
    file: any,
    out: string,
  ) => Promise<any>;
}
export class Content {
  constructor(public user: ContentClient) {}
  async info(id: string): Promise<any> {
    const app = appid(id),
      raw = await this.user.getProductInfo([app], [], true),
      data = raw.apps?.[app]?.appinfo;
    assert(data, "NOT_FOUND", "没有取得 PICS 游戏信息");
    return { appid: app, data };
  }
  async depots(id: string): Promise<any> {
    const { appid: app, data } = await this.info(id);
    return {
      appid: app,
      items: Object.entries(data.depots ?? {})
        .filter(([k]) => /^\d+$/.test(k))
        .map(([depot, v]) => ({ depotid: Number(depot), ...(v as any) })),
      branches: data.depots?.branches ?? {},
      launch_options: data.config?.launch ?? {},
    };
  }
  async manifest(
    id: string,
    depot: number,
    manifest: string,
    branch = "public",
  ): Promise<any> {
    assert(
      /^\d{1,20}$/.test(manifest),
      "INVALID_ARGUMENT",
      "manifest ID 必须为 uint64 字符串",
    );
    return (
      await this.user.getManifest(appid(id), appid(depot), manifest, branch)
    ).manifest;
  }
  async download(
    id: string,
    p: {
      depot: number;
      manifest: string;
      out: string;
      branch?: string;
      limitBytes?: number;
      execute?: boolean;
      resume?: boolean;
    },
  ): Promise<any> {
    const app = appid(id),
      depot = appid(p.depot),
      out = path.resolve(p.out),
      manifest = await this.manifest(id, depot, p.manifest, p.branch),
      files = manifest.files ?? [];
    assert(Array.isArray(files), "PARSE_ERROR", "Depot 清单无效");
    let total = 0;
    const seen = new Set<string>();
    assert(files.length <= 100000, "INVALID_MANIFEST", "Depot 文件数超过上限");
    for (const f of files) {
      if (f.flags & 64) f.filename = f.filename.replace(/[\\/]+$/, "");
      assert(
        !f.filename
          .split(/[\\/]/)
          .some((part: string) => part.startsWith(".steam-cli")),
        "INVALID_MANIFEST",
        "Depot 文件与任务元信息冲突",
      );
      if (!(f.flags & 64))
        assert(
          /^[a-f0-9]{40}$/i.test(f.sha_content ?? ""),
          "INVALID_MANIFEST",
          "Depot 文件缺少有效 SHA1",
        );
      const target = manifestPath(out, f.filename),
        key = process.platform === "win32" ? target.toLowerCase() : target;
      assert(!seen.has(key), "INVALID_MANIFEST", "Depot 文件路径重复");
      seen.add(key);
      assert(
        !(f.flags & 512),
        "UNSUPPORTED_FILE",
        "Depot 含符号链接，拒绝自动创建",
      );
      total += number(f.size ?? 0, "file size");
    }
    assert(
      total <= number(p.limitBytes ?? 20 * 1024 ** 3, "limit-bytes", 1),
      "DOWNLOAD_TOO_LARGE",
      "下载大小超过设定上限",
    );
    const plan = {
      appid: app,
      depotid: depot,
      manifest: p.manifest,
      out,
      files: files.length,
      total_bytes: total,
    };
    if (!p.execute) return { dry_run: true, ...plan };
    const stateFile = safePath(out, ".steam-cli-depot.json");
    if (existsSync(out)) {
      assert(
        p.resume === true && existsSync(stateFile),
        "ALREADY_EXISTS",
        "下载目录存在；只有匹配的任务可 --resume yes",
      );
      const old = JSON.parse(readFileSync(stateFile, "utf8"));
      assert(
        old.appid === app &&
          old.depotid === depot &&
          old.manifest === p.manifest,
        "CONFLICT",
        "下载任务与目录现有清单不同",
      );
    } else mkdirSync(out, { recursive: true, mode: 0o700 });
    writeFileSync(stateFile, JSON.stringify(plan), { mode: 0o600 });
    const completed: any[] = [];
    let resumed = 0;
    for (const f of files) {
      const target = manifestPath(out, f.filename);
      if (f.flags & 64) {
        mkdirSync(target, { recursive: true });
        continue;
      }
      const expected = String(f.sha_content ?? "").toLowerCase();
      assert(
        /^[a-f0-9]{40}$/.test(expected),
        "INVALID_MANIFEST",
        "Depot 文件缺少有效 SHA1",
      );
      if (existsSync(target)) {
        assert(
          lstatSync(target).isFile(),
          "INVALID_MANIFEST",
          "目标不是普通文件",
        );
        if (
          lstatSync(target).size === Number(f.size) &&
          (await hashFile(target)) === expected
        ) {
          resumed++;
          completed.push({ name: f.filename, sha1: expected });
          continue;
        }
        assert(p.resume, "CONFLICT", "目标已存在且与清单不符");
      }
      mkdirSync(path.dirname(target), { recursive: true });
      const temp = `${target}.${randomBytes(8).toString("hex")}.part`;
      try {
        await this.user.downloadFile(app, depot, f, temp);
        assert(
          lstatSync(temp).size === Number(f.size) &&
            (await hashFile(temp)) === expected,
          "VERIFY_FAILED",
          "Depot 文件校验失败",
        );
        if (f.flags & 32) chmodSync(temp, 0o755);
        renameSync(temp, target);
        completed.push({ name: f.filename, sha1: expected });
      } finally {
        rmSync(temp, { force: true });
      }
    }
    writeFileSync(
      stateFile,
      JSON.stringify({ ...plan, complete: true, completed }, null, 2),
      { mode: 0o600 },
    );
    return {
      ...plan,
      verified: true,
      complete: true,
      resumed,
      downloaded: completed.length - resumed,
    };
  }
  async verify(
    id: string,
    p: { depot: number; manifest: string; out: string; branch?: string },
  ): Promise<any> {
    const manifest = await this.manifest(id, p.depot, p.manifest, p.branch),
      out = path.resolve(p.out),
      items = [];
    for (const file of manifest.files ?? []) {
      const target = manifestPath(
        out,
        file.flags & 64 ? file.filename.replace(/[\\/]+$/, "") : file.filename,
      );
      assert(!(file.flags & 512), "UNSUPPORTED_FILE", "清单含符号链接");
      if (file.flags & 64) continue;
      const exists = existsSync(target) && lstatSync(target).isFile(),
        actual = exists ? await hashFile(target) : null;
      items.push({
        name: file.filename,
        exists,
        valid:
          exists &&
          lstatSync(target).size === Number(file.size) &&
          actual === file.sha_content,
        expected_sha1: file.sha_content,
        actual_sha1: actual,
      });
    }
    return {
      appid: appid(id),
      depotid: p.depot,
      manifest: p.manifest,
      items,
      verified: items.every((f) => f.valid),
    };
  }
}
export async function contentOperation(
  action: "depots" | "manifest" | "download" | "verify",
  id: string,
  p: any,
): Promise<any> {
  return withClient(async (user) => {
    const content = new Content(user);
    if (action === "depots") return content.depots(id);
    if (action === "manifest") {
      const manifest = await content.manifest(
        id,
        p.depot,
        p.manifest,
        p.branch,
      );
      return {
        appid: appid(id),
        depotid: p.depot,
        manifest: p.manifest,
        items: (manifest.files ?? []).map((f: any) => ({
          name: f.filename,
          size: f.size,
          flags: f.flags,
          sha1: f.sha_content,
        })),
        filenames_encrypted: manifest.filenames_encrypted,
      };
    }
    return content[action](id, p);
  }, p.anonymous === true);
}
