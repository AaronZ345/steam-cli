import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  renameSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fetch, EnvHttpProxyAgent } from "undici";
import { appid, assert, number, CliError } from "./core.js";
import { safePath, replaceLocal } from "./local-data.js";
import { unified, hashFile, manifestPath } from "./content.js";
import { withClient } from "./network.js";

export interface CloudTransport {
  call: (method: string, params: any, write?: boolean) => Promise<any>;
  transfer: (
    url: string,
    options: {
      method?: string;
      headers: Record<string, string>;
      body?: Buffer;
    },
  ) => Promise<Buffer>;
}
export function cloudURL(host: string, urlPath: string): string {
  const u = new URL("https://" + host + urlPath);
  assert(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (/(?:^|\.)(steamusercontent\.com|steamcontent\.com|steamstatic\.com|steampowered\.com)$/.test(
        u.hostname,
      ) ||
        /^steamcloud[^.]*\.blob\.core\.windows\.net$/.test(u.hostname)),
    "INVALID_UPLOAD_URL",
    "Cloud 返回的传输地址不受支持",
  );
  return u.href;
}
function headers(rows: any[] = []): Record<string, string> {
  const h: Record<string, string> = {};
  for (const r of rows) {
    assert(
      typeof r.name === "string" &&
        typeof r.value === "string" &&
        !/[\r\n]/.test(r.name + r.value) &&
        !["host", "cookie"].includes(r.name.toLowerCase()),
      "INVALID_UPLOAD_URL",
      "Cloud 请求头无效",
    );
    h[r.name] = r.value;
  }
  return h;
}
function digest(value: unknown): string | null {
  if (Buffer.isBuffer(value)) return value.toString("hex");
  if (typeof value !== "string") return null;
  if (/^[a-fA-F0-9]{40}$/.test(value)) return value.toLowerCase();
  const b = Buffer.from(value, "base64");
  return b.length === 20 ? b.toString("hex") : null;
}
export async function transferCloud(
  url: string,
  opts: { method?: string; headers: Record<string, string>; body?: Buffer },
): Promise<Buffer> {
  const agent = new EnvHttpProxyAgent();
  try {
    const r = await fetch(url, {
      dispatcher: agent,
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    assert(
      r.ok,
      opts.method && opts.method !== "GET" ? "UPLOAD_FAILED" : "HTTP_ERROR",
      `Cloud HTTP ${r.status}`,
    );
    let total = 0;
    const chunks = [];
    for await (const chunk of r.body ?? []) {
      total += chunk.length;
      assert(
        total <= 256 * 1024 * 1024,
        "RESPONSE_TOO_LARGE",
        "Cloud 文件超过 256 MiB",
      );
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    await agent.close();
  }
}
export class Cloud {
  constructor(public t: CloudTransport) {}
  private async readback(id: string): Promise<any[]> {
    try {
      return await this.all(id);
    } catch (e: any) {
      throw new CliError(
        "WRITE_UNKNOWN",
        "云存档已接收，但读回失败；请先检查远端状态",
        {
          accepted: true,
          appid: appid(id),
          readback_error: e.code ?? "COMMAND_FAILED",
        },
      );
    }
  }
  async list(id: string, offset = 0, count = 1000): Promise<any> {
    const raw = await this.t.call("Cloud.EnumerateUserFiles#1", {
      appid: appid(id),
      extended_details: true,
      count: number(count, "count", 1, 1000),
      start_index: number(offset, "offset"),
    });
    assert(
      Array.isArray(raw.files) || raw.total_files === 0,
      "PARSE_ERROR",
      "Cloud 文件列表响应格式无效",
    );
    const items = (raw.files ?? []).map((f: any) => ({
      name: f.filename,
      size: f.file_size ?? null,
      sha1: digest(f.file_sha),
      timestamp: f.timestamp ?? null,
      ugcid: f.ugcid ?? null,
      platforms: f.platforms_to_sync ?? [],
    }));
    return {
      appid: appid(id),
      items,
      total: raw.total_files ?? null,
      next_offset:
        offset + items.length < (raw.total_files ?? 0)
          ? offset + items.length
          : null,
      complete: offset + items.length >= (raw.total_files ?? 0),
    };
  }
  async all(id: string): Promise<any[]> {
    const items: any[] = [];
    let offset = 0;
    for (let page = 0; page < 100; page++) {
      const r = await this.list(id, offset);
      items.push(...r.items);
      if (r.complete) return items;
      assert(r.next_offset > offset, "PAGINATION_ERROR", "Cloud 分页未前进");
      offset = r.next_offset;
    }
    throw new CliError("INCOMPLETE", "Cloud 文件超过 100 页上限");
  }
  async downloadBytes(id: string, name: string): Promise<Buffer> {
    assert(name && !name.includes("\0"), "INVALID_ARGUMENT", "文件名无效");
    const raw = await this.t.call("Cloud.ClientFileDownload#1", {
      appid: appid(id),
      filename: name,
    });
    assert(!raw.is_explicit_delete, "NOT_FOUND", "远端文件已删除");
    assert(
      !raw.encrypted,
      "UNSUPPORTED_ENCRYPTION",
      "此 Cloud 文件要求额外客户端加密支持",
    );
    assert(
      raw.url_host && raw.url_path,
      "PARSE_ERROR",
      "Cloud 下载响应缺少地址",
    );
    const data = await this.t.transfer(cloudURL(raw.url_host, raw.url_path), {
      headers: headers(raw.request_headers),
    });
    const sha = digest(raw.sha_file);
    assert(
      sha &&
        createHash("sha1").update(data).digest("hex") === sha &&
        data.length === Number(raw.raw_file_size ?? raw.file_size),
      "VERIFY_FAILED",
      "Cloud 下载大小或 SHA1 不符",
    );
    return data;
  }
  async upload(
    id: string,
    file: string,
    name: string,
    execute = false,
  ): Promise<any> {
    assert(name && !name.includes("\0"), "INVALID_ARGUMENT", "远端文件名无效");
    const s = lstatSync(file);
    assert(
      s.isFile() && !s.isSymbolicLink() && s.size <= 256 * 1024 * 1024,
      "INVALID_ARGUMENT",
      "上传文件必须为不超过 256 MiB 的普通文件",
    );
    const data = readFileSync(file),
      sha = createHash("sha1").update(data).digest(),
      sha1 = sha.toString("hex");
    if (!execute)
      return {
        dry_run: true,
        action: "cloud.upload",
        appid: appid(id),
        name,
        bytes: data.length,
        sha1,
      };
    const raw = await this.t.call(
      "Cloud.ClientBeginFileUpload#1",
      {
        appid: appid(id),
        filename: name,
        file_size: data.length,
        raw_file_size: data.length,
        file_sha: sha,
        time_stamp: String(Math.floor(s.mtimeMs / 1000)),
        platforms_to_sync: 0xffffffff,
        can_encrypt: false,
        is_shared_file: false,
      },
      true,
    );
    assert(
      !raw.encrypt_file && Array.isArray(raw.block_requests),
      "UNSUPPORTED_ENCRYPTION",
      "Cloud 返回了不支持的上传配置",
    );
    for (const block of raw.block_requests) {
      const method = (
        { 1: "GET", 2: "HEAD", 3: "POST", 4: "PUT" } as Record<number, string>
      )[block.http_method];
      assert(
        method === "POST" || method === "PUT",
        "INVALID_UPLOAD_URL",
        "不支持的 Cloud 上传方法",
      );
      const start = number(block.block_offset ?? 0, "block offset"),
        length = number(block.block_length ?? data.length, "block length");
      assert(
        start + length <= data.length,
        "INVALID_UPLOAD_URL",
        "Cloud 上传块超出文件范围",
      );
      const body = block.explicit_body_data?.length
        ? Buffer.from(block.explicit_body_data)
        : data.subarray(start, start + length);
      await this.t.transfer(cloudURL(block.url_host, block.url_path), {
        method,
        headers: headers(block.request_headers),
        body,
      });
    }
    const result = await this.t.call(
      "Cloud.ClientCommitFileUpload#1",
      {
        appid: appid(id),
        filename: name,
        file_sha: sha,
        transfer_succeeded: true,
      },
      true,
    );
    assert(
      result.file_committed === true,
      "WRITE_UNKNOWN",
      "Cloud 没有确认文件提交",
    );
    const files = await this.readback(id);
    return {
      accepted: true,
      verified: files.some((f) => f.name === name && f.sha1 === sha1),
      appid: appid(id),
      name,
      sha1,
    };
  }
  async remove(id: string, name: string, execute = false): Promise<any> {
    const before = (await this.all(id)).find((f) => f.name === name);
    assert(before, "NOT_FOUND", "远端文件不存在");
    if (!execute)
      return {
        dry_run: true,
        action: "cloud.delete",
        appid: appid(id),
        before,
      };
    await this.t.call(
      "Cloud.ClientDeleteFile#1",
      { appid: appid(id), filename: name, is_explicit_delete: true },
      true,
    );
    return {
      accepted: true,
      verified: !(await this.readback(id)).some((f) => f.name === name),
      appid: appid(id),
      name,
    };
  }
  async download(
    id: string,
    name: string,
    out: string,
    execute = false,
  ): Promise<any> {
    if (!execute)
      return {
        dry_run: true,
        action: "cloud.fetch",
        appid: appid(id),
        name,
        out: path.resolve(out),
      };
    assert(!existsSync(out), "ALREADY_EXISTS", "本地目标文件已存在");
    const data = await this.downloadBytes(id, name);
    writeFileSync(out, data, { flag: "wx", mode: 0o600 });
    return {
      verified: true,
      appid: appid(id),
      name,
      out: path.resolve(out),
      bytes: data.length,
    };
  }
  async sync(id: string, folder: string, execute = false): Promise<any> {
    const root = path.resolve(folder);
    assert(
      !existsSync(root) ||
        (lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink()),
      "INVALID_ARGUMENT",
      "同步目录无效",
    );
    const stateFile = safePath(root, ".steam-cli-sync.json"),
      baseline = existsSync(stateFile)
        ? readFileSync(stateFile)
        : Buffer.alloc(0),
      base = existsSync(stateFile)
        ? JSON.parse(readFileSync(stateFile, "utf8"))
        : {};
    assert(
      !base.appid || base.appid === appid(id),
      "CONFLICT",
      "同步目录属于另一个 appid",
    );
    assert(
      !baseline.length ||
        (base.version === 1 &&
          base.files &&
          typeof base.files === "object" &&
          !Array.isArray(base.files) &&
          Object.values(base.files).every(
            (v) => typeof v === "string" && /^[a-f0-9]{40}$/.test(v),
          )),
      "PARSE_ERROR",
      "同步基线格式无效",
    );
    const local: Record<string, string> = {};
    const walk = async (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name.startsWith(".steam-cli") ||
          entry.name.includes(".steam-cli-")
        )
          continue;
        assert(
          !entry.isSymbolicLink(),
          "INVALID_ARGUMENT",
          "同步目录含符号链接",
        );
        const p = safePath(dir, entry.name);
        if (entry.isDirectory()) await walk(p);
        else if (entry.isFile())
          local[path.relative(root, p).split(path.sep).join("/")] =
            await hashFile(p);
      }
    };
    await walk(root);
    const remoteFiles = await this.all(id),
      remote: Record<string, string> = {};
    for (const f of remoteFiles) {
      manifestPath(root, f.name);
      assert(f.sha1, "PARSE_ERROR", "远端文件缺少 SHA1，无法安全同步");
      assert(
        !Object.hasOwn(remote, f.name),
        "PARSE_ERROR",
        "Cloud 远端文件名重复",
      );
      remote[f.name] = f.sha1;
    }
    const actions: any[] = [],
      conflicts: any[] = [];
    for (const name of new Set([
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const l = local[name],
        r = remote[name],
        previous = base.files?.[name];
      if (l === r) continue;
      if (l && r) {
        if (previous && r === previous)
          actions.push({ action: "upload", name, sha1: l });
        else if (previous && l === previous)
          actions.push({ action: "download", name, sha1: r });
        else
          conflicts.push({
            name,
            reason: "both-present-with-different-content",
            local_sha1: l,
            remote_sha1: r,
          });
      } else if (l && !r) {
        if (previous)
          conflicts.push({ name, reason: "remote-deleted-or-missing" });
        else actions.push({ action: "upload", name, sha1: l });
      } else if (r && !l) {
        if (previous)
          conflicts.push({ name, reason: "local-deleted-or-missing" });
        else actions.push({ action: "download", name, sha1: r });
      }
    }
    const plan = {
      appid: appid(id),
      folder: root,
      actions,
      conflicts,
      deletes: false,
    };
    if (!execute) return { dry_run: true, ...plan };
    assert(!conflicts.length, "SYNC_CONFLICT", "检测到存档冲突，未执行同步");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const done: any[] = [],
      files = { ...local };
    try {
      for (const action of actions) {
        const target = manifestPath(root, action.name);
        if (action.action === "upload") {
          assert(
            (await hashFile(target)) === action.sha1,
            "CONFLICT",
            "本地文件在同步计划后变化",
          );
          const latest = (await this.all(id)).find(
            (f) => f.name === action.name,
          );
          assert(
            (latest?.sha1 ?? null) === (remote[action.name] ?? null),
            "CONFLICT",
            "远端文件在同步计划后变化",
          );
          const result = await this.upload(id, target, action.name, true);
          assert(
            result.verified === true,
            "WRITE_UNKNOWN",
            "上传已提交，但无法读回确认；同步中止",
          );
        } else {
          const data = await this.downloadBytes(id, action.name);
          assert(
            createHash("sha1").update(data).digest("hex") === action.sha1,
            "CONFLICT",
            "远端文件在同步计划后变化",
          );
          mkdirSync(path.dirname(target), { recursive: true });
          const before = existsSync(target)
            ? readFileSync(target)
            : Buffer.alloc(0);
          if (local[action.name])
            assert(
              createHash("sha1").update(before).digest("hex") ===
                local[action.name],
              "CONFLICT",
              "本地文件发生并发修改",
            );
          else assert(!existsSync(target), "CONFLICT", "本地新文件发生冲突");
          replaceLocal(target, before, data, true);
          files[action.name] = action.sha1;
        }
        done.push(action);
      }
      assert(
        (existsSync(stateFile)
          ? readFileSync(stateFile)
          : Buffer.alloc(0)
        ).equals(baseline),
        "CONFLICT",
        "同步基线已被另一个任务修改",
      );
      const temp = `${stateFile}.${randomBytes(8).toString("hex")}.tmp`;
      try {
        writeFileSync(
          temp,
          JSON.stringify({ version: 1, appid: appid(id), files }, null, 2),
          { flag: "wx", mode: 0o600 },
        );
        renameSync(temp, stateFile);
      } finally {
        rmSync(temp, { force: true });
      }
      return { ...plan, accepted: true, verified: true, completed: done };
    } catch (e: any) {
      throw new CliError("SYNC_PARTIAL", "同步中止，请检查已经完成的项目", {
        completed: done,
        error: { code: e.code ?? "COMMAND_FAILED", message: e.message },
      });
    }
  }
}
export async function cloudOperation(
  action: "list" | "upload" | "download" | "remove" | "sync",
  id: string,
  p: any,
): Promise<any> {
  if (!p.execute && (action === "upload" || action === "download")) {
    const preview = new Cloud({
      call: async () => {
        throw new CliError("AUTH_REQUIRED", "预览不访问客户端协议");
      },
      transfer: transferCloud,
    });
    return action === "upload"
      ? preview.upload(id, p.file, p.name, false)
      : preview.download(id, p.name, p.out, false);
  }
  return withClient(async (user) => {
    const cloud = new Cloud({
      call: (m, args, w) => unified(user, m, args, w),
      transfer: transferCloud,
    });
    if (action === "list") return cloud.list(id, p.offset, p.limit);
    if (action === "upload") return cloud.upload(id, p.file, p.name, p.execute);
    if (action === "download")
      return cloud.download(id, p.name, p.out, p.execute);
    if (action === "remove") return cloud.remove(id, p.name, p.execute);
    return cloud.sync(id, p.directory, p.execute);
  });
}
