import {
  existsSync,
  realpathSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  mkdirSync,
  cpSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import vdf from "./text-vdf.js";
import { assert, appid, number, CliError, redact } from "./core.js";
import { steamRoot } from "./local.js";
import {
  atom,
  value,
  dictionary,
  decodeBinary,
  encodeBinary,
} from "./binary-vdf.js";

export function safePath(root: string, ...parts: string[]): string {
  assert(
    !lstatSync(root, { throwIfNoEntry: false })?.isSymbolicLink(),
    "INVALID_ARGUMENT",
    "根目录不能是符号链接",
  );
  const target = path.resolve(root, ...parts),
    rel = path.relative(root, target);
  assert(
    !rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel),
    "INVALID_ARGUMENT",
    "路径超出指定目录",
  );
  let current = path.resolve(root);
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat)
      assert(!stat.isSymbolicLink(), "INVALID_ARGUMENT", "拒绝跟随符号链接");
  }
  return target;
}
export function treeSize(
  root: string,
  maxFiles = 100000,
): { bytes: number; files: number; complete: boolean } {
  if (!existsSync(root)) return { bytes: 0, files: 0, complete: true };
  let bytes = 0,
    files = 0,
    complete = true;
  const queue = [root];
  while (queue.length) {
    const next = queue.pop()!,
      s = lstatSync(next);
    if (s.isSymbolicLink()) continue;
    if (s.isFile()) {
      files++;
      bytes += s.size;
      if (files >= maxFiles) {
        complete = false;
        break;
      }
    } else if (s.isDirectory())
      for (const item of readdirSync(next)) queue.push(path.join(next, item));
  }
  return { bytes, files, complete };
}
function nested(obj: any, keys: string[], create = false): any {
  let current = obj;
  for (const key of keys) {
    const actual =
      Object.keys(current).find((k) => k.toLowerCase() === key.toLowerCase()) ??
      key;
    if (!current[actual] || typeof current[actual] !== "object") {
      if (!create) return undefined;
      current[actual] = Object.create(null);
    }
    current = current[actual];
  }
  return current;
}
function sha(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}
function fileSha(file: string): string {
  const hash = createHash("sha256"),
    fd = openSync(file, "r"),
    buf = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      hash.update(buf.subarray(0, n));
    }
    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}
export function clientRunning(): boolean {
  try {
    const text = execFileSync(
      process.platform === "win32" ? "tasklist" : "ps",
      process.platform === "win32"
        ? ["/FO", "CSV", "/NH"]
        : ["-ax", "-o", "comm="],
      { encoding: "utf8", timeout: 3000 },
    );
    return /(?:^|[/\\"\s])(?:steam_osx|steam\.exe|steam)(?:"|\s|$)/im.test(
      text,
    );
  } catch {
    throw new CliError(
      "PROCESS_CHECK_FAILED",
      "无法确认 Steam 是否退出，拒绝修改客户端文件",
    );
  }
}
export function replaceLocal(
  file: string,
  before: Buffer,
  after: Buffer,
  execute: boolean,
): any {
  const expected = sha(before),
    backup = `${file}.steam-cli-${expected.slice(0, 12)}.bak`;
  if (!execute)
    return {
      dry_run: true,
      path: file,
      before_sha256: expected,
      after_sha256: sha(after),
      backup,
    };
  const current = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
  assert(sha(current) === expected, "CONFLICT", "文件在预览后变化，请重新读取");
  mkdirSync(path.dirname(file), { recursive: true });
  if (before.length && !existsSync(backup)) {
    writeFileSync(backup, before, { flag: "wx", mode: 0o600 });
  }
  const temp = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, after, { flag: "wx", mode: 0o600 });
    assert(
      sha(existsSync(file) ? readFileSync(file) : Buffer.alloc(0)) === expected,
      "CONFLICT",
      "文件发生并发修改",
    );
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
  return {
    accepted: true,
    verified: sha(readFileSync(file)) === sha(after),
    path: file,
    backup: before.length ? backup : null,
    before_sha256: expected,
    after_sha256: sha(after),
    config_modified: true,
  };
}
export class LocalData {
  root: string;
  constructor(
    root?: string,
    public account?: string,
  ) {
    const found = root ?? steamRoot();
    assert(
      found && existsSync(path.join(found, "steamapps")),
      "NOT_FOUND",
      "未找到 Steam 安装目录",
    );
    this.root = realpathSync(found);
  }
  libraries(): string[] {
    const file = safePath(this.root, "steamapps", "libraryfolders.vdf"),
      raw = existsSync(file) ? vdf.parse(readFileSync(file, "utf8")) : {},
      set = new Set<string>([this.root]);
    for (const [k, v] of Object.entries(
      raw.libraryfolders ?? raw.LibraryFolders ?? {},
    )) {
      if (!/^\d+$/.test(k)) continue;
      const p = typeof v === "string" ? v : (v as any)?.path;
      if (typeof p === "string" && existsSync(p)) set.add(realpathSync(p));
    }
    return [...set];
  }
  accounts(): any {
    const dir = safePath(this.root, "userdata");
    return {
      items: existsSync(dir)
        ? readdirSync(dir)
            .filter(
              (n) =>
                /^\d+$/.test(n) && lstatSync(safePath(dir, n)).isDirectory(),
            )
            .map((account) => ({ account, path: safePath(dir, account) }))
        : [],
    };
  }
  userRoot(): string {
    const accounts = this.accounts().items;
    let selected = this.account;
    if (selected?.startsWith("7656119"))
      selected = String(BigInt(selected) - 76561197960265728n);
    if (!selected) {
      assert(
        accounts.length === 1,
        accounts.length ? "AMBIGUOUS" : "NOT_FOUND",
        "请先 local accounts，再用 --account 指定 userdata 账号",
      );
      selected = accounts[0].account;
    }
    assert(
      /^\d+$/.test(selected!) &&
        accounts.some((a: any) => a.account === selected),
      "NOT_FOUND",
      "未找到指定 userdata 账号",
    );
    return safePath(this.root, "userdata", selected!);
  }
  manifests(): any[] {
    const items: any[] = [];
    for (const library of this.libraries()) {
      const dir = safePath(library, "steamapps");
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir).filter((n) =>
        /^appmanifest_\d+\.acf$/.test(n),
      )) {
        const manifest = safePath(dir, file),
          raw = vdf.parse(readFileSync(manifest, "utf8")).AppState;
        assert(raw?.appid && raw.installdir, "PARSE_ERROR", "安装清单无效");
        const install_dir = safePath(dir, "common", raw.installdir);
        items.push({
          appid: appid(raw.appid),
          name: raw.name ?? null,
          library,
          install_dir,
          manifest,
          size_bytes: Number(raw.SizeOnDisk ?? 0),
          buildid: raw.buildid ?? null,
          state_flags: Number(raw.StateFlags ?? 0),
          bytes_to_download: Number(raw.BytesToDownload ?? 0),
          bytes_downloaded: Number(raw.BytesDownloaded ?? 0),
          last_updated: Number(raw.LastUpdated ?? 0),
          last_played:
            raw.LastPlayed === undefined ? null : Number(raw.LastPlayed),
          raw,
        });
      }
    }
    return items;
  }
  installed(
    p: { query?: string; limit?: number; offset?: number; sort?: string } = {},
  ): any {
    let items = this.manifests().map(({ raw: _raw, ...item }) => item);
    if (p.query) {
      const q = p.query.toLowerCase();
      items = items.filter(
        (g) =>
          g.name?.toLowerCase().includes(q) ||
          g.name
            ?.split(/[^\p{L}\p{N}]+/u)
            .map((w: string) => w[0] ?? "")
            .join("")
            .toLowerCase()
            .includes(q) ||
          String(g.appid) === q,
      );
    }
    if (p.sort === "size") items.sort((a, b) => b.size_bytes - a.size_bytes);
    else if (p.sort === "name")
      items.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    const limit = number(p.limit ?? 100, "limit", 1, 100000),
      offset = number(p.offset ?? 0, "offset");
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      next_offset: offset + limit < items.length ? offset + limit : null,
      complete: offset + limit >= items.length,
    };
  }
  game(id: string): any {
    const matches = this.manifests().filter((g) => g.appid === appid(id));
    assert(
      matches.length === 1,
      matches.length ? "AMBIGUOUS" : "NOT_FOUND",
      "游戏不存在或在多个库重复安装",
    );
    return matches[0];
  }
  status(id?: string): any {
    const items = this.manifests().filter((g) => !id || g.appid === appid(id));
    return {
      running: clientRunning(),
      items: items
        .filter(
          (g) =>
            id ||
            g.bytes_to_download > g.bytes_downloaded ||
            (g.state_flags & 256) !== 0,
        )
        .map((g) => ({
          appid: g.appid,
          name: g.name,
          bytes_to_download: g.bytes_to_download,
          bytes_downloaded: g.bytes_downloaded,
          progress: g.bytes_to_download
            ? Math.min(1, g.bytes_downloaded / g.bytes_to_download)
            : null,
          state_flags: g.state_flags,
          buildid: g.buildid,
        })),
      source: "appmanifest snapshot",
    };
  }
  diskReport(id?: string): any {
    const installed = this.manifests(),
      ids = new Set(installed.map((g) => g.appid)),
      items: any[] = [];
    for (const lib of this.libraries()) {
      const base = safePath(lib, "steamapps");
      const all = new Set<number>(
        installed.filter((g) => g.library === lib).map((g) => g.appid),
      );
      for (const category of ["compatdata", "shadercache"]) {
        const dir = safePath(base, category);
        if (existsSync(dir))
          for (const n of readdirSync(dir))
            if (/^\d+$/.test(n)) all.add(Number(n));
      }
      const content = safePath(base, "workshop", "content");
      if (existsSync(content))
        for (const n of readdirSync(content))
          if (/^\d+$/.test(n)) all.add(Number(n));
      for (const app of all) {
        if (id && app !== appid(id)) continue;
        const game = installed.find(
            (g) => g.appid === app && g.library === lib,
          ),
          parts: Record<string, any> = {
            install: game
              ? treeSize(game.install_dir)
              : { bytes: 0, files: 0, complete: true },
            compat: treeSize(safePath(base, "compatdata", String(app))),
            shader: treeSize(safePath(base, "shadercache", String(app))),
            workshop: treeSize(safePath(content, String(app))),
          };
        items.push({
          appid: app,
          name: game?.name ?? null,
          library: lib,
          installed: ids.has(app),
          orphaned: !ids.has(app),
          parts,
          total_bytes: Object.values(parts).reduce(
            (n: number, p: any) => n + p.bytes,
            0,
          ),
          complete: Object.values(parts).every((p: any) => p.complete),
        });
      }
    }
    return {
      items,
      total_bytes: items.reduce((n, r) => n + r.total_bytes, 0),
      complete: items.every((r) => r.complete),
    };
  }
  cleanup(): any {
    const report = this.diskReport(),
      items = report.items
        .filter((r: any) => r.orphaned)
        .map((r: any) => ({
          appid: r.appid,
          library: r.library,
          compat_bytes: r.parts.compat.bytes,
          shader_bytes: r.parts.shader.bytes,
          workshop_bytes: r.parts.workshop.bytes,
          reclaimable_cache_bytes: r.parts.shader.bytes,
          save_data_may_exist: r.parts.compat.bytes > 0,
        }));
    return {
      items,
      automatic_deletion: false,
      reclaimable_cache_bytes: items.reduce(
        (n: number, r: any) => n + r.reclaimable_cache_bytes,
        0,
      ),
    };
  }
  saves(id?: string): any {
    const root = this.userRoot(),
      items: any[] = [];
    for (const n of readdirSync(root).filter(
      (n) => /^\d+$/.test(n) && (!id || n === String(appid(id))),
    )) {
      const remote = safePath(root, n, "remote");
      if (!existsSync(remote)) continue;
      const stat = treeSize(remote);
      items.push({ appid: Number(n), path: remote, ...stat });
    }
    return {
      items,
      total_bytes: items.reduce((n, r) => n + r.bytes, 0),
      complete: items.every((r) => r.complete),
    };
  }
  backup(out: string, id?: string, execute = false): any {
    const target = path.resolve(out),
      files = this.saves(id).items;
    assert(!existsSync(target), "ALREADY_EXISTS", "备份目标已存在");
    assert(
      !target.startsWith(this.root + path.sep),
      "INVALID_ARGUMENT",
      "备份目标不能位于 Steam 安装目录内",
    );
    if (!execute)
      return {
        dry_run: true,
        action: "saves.backup",
        out: target,
        items: files,
      };
    mkdirSync(target, { recursive: true, mode: 0o700 });
    try {
      for (const item of files) {
        const dst = path.join(target, String(item.appid));
        copyTree(item.path, dst);
      }
      writeFileSync(
        path.join(target, "manifest.json"),
        JSON.stringify(
          { version: 1, created_at: new Date().toISOString(), items: files },
          null,
          2,
        ),
        { flag: "wx", mode: 0o600 },
      );
      return { accepted: true, verified: true, out: target, items: files };
    } catch (e) {
      rmSync(target, { recursive: true, force: true });
      throw e;
    }
  }
  localConfig(): { file: string; before: Buffer; data: any } {
    const file = safePath(this.userRoot(), "config", "localconfig.vdf");
    assert(existsSync(file), "NOT_FOUND", "localconfig.vdf 不存在");
    const before = readFileSync(file);
    return { file, before, data: vdf.parse(before.toString("utf8")) };
  }
  launchOptions(id: string, options?: string, execute = false): any {
    const r = this.localConfig(),
      apps = nested(
        r.data,
        ["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"],
        options !== undefined,
      );
    const game = apps?.[String(appid(id))];
    if (options === undefined)
      return {
        appid: appid(id),
        options: game?.LaunchOptions ?? game?.launchoptions ?? "",
        path: r.file,
      };
    assert(
      !options.includes("\0") && options.length <= 32000,
      "INVALID_ARGUMENT",
      "启动参数无效",
    );
    if (execute) this.assertStopped();
    const target = nested(apps, [String(appid(id))], true);
    const k =
      Object.keys(target).find((k) => k.toLowerCase() === "launchoptions") ??
      "LaunchOptions";
    const old = target[k] ?? "";
    target[k] = options;
    return {
      appid: appid(id),
      before: old,
      after: options,
      ...replaceLocal(
        r.file,
        r.before,
        Buffer.from(vdf.stringify(r.data)),
        execute,
      ),
    };
  }
  settings(): any {
    const r = this.localConfig(),
      steam =
        nested(r.data, [
          "UserLocalConfigStore",
          "Software",
          "Valve",
          "Steam",
        ]) ?? {};
    const allowed = [
      "Language",
      "language",
      "MaxServerBrowserPingsPerMin",
      "DownloadThrottleKbps",
      "DownloadThrottleEnabled",
      "apps",
    ];
    return {
      path: r.file,
      system: Object.fromEntries(
        Object.entries(
          nested(r.data, ["UserLocalConfigStore", "system"]) ?? {},
        ).filter(
          ([k, v]) =>
            [
              "InGameOverlayShowFPSCorner",
              "EnableGameOverlay",
              "EnableScreenshots",
              "StreamingEnabled",
              "RemotePlayEnabled",
              "ControllerConfigEnabled",
            ].includes(k) &&
            typeof v === "string" &&
            v.length <= 100,
        ),
      ),
      settings: Object.fromEntries(
        allowed
          .filter((k) => steam[k] !== undefined)
          .map((k) => [
            k,
            k === "apps" ? { count: Object.keys(steam[k]).length } : steam[k],
          ]),
      ),
    };
  }
  shortcuts(): any {
    const file = safePath(this.userRoot(), "config", "shortcuts.vdf"),
      before = existsSync(file) ? readFileSync(file) : Buffer.alloc(0),
      data: Record<string, any> = before.length
        ? decodeBinary(before)
        : { shortcuts: Object.create(null) },
      key =
        Object.keys(data).find((k) => k.toLowerCase() === "shortcuts") ??
        "shortcuts",
      shortcuts = dictionary(data[key]);
    return { file, before, data, shortcuts, key };
  }
  shortcutList(): any {
    const r = this.shortcuts();
    return {
      path: r.file,
      items: Object.entries(r.shortcuts).map(([index, node]) => {
        const s = dictionary(node);
        return {
          index,
          appid: value(s.appid) ?? null,
          name: value(s.AppName) ?? value(s.appname) ?? null,
          exe: value(s.Exe) ?? value(s.exe) ?? null,
          start_dir: value(s.StartDir) ?? null,
          launch_options: value(s.LaunchOptions) ?? "",
          tags: Object.values(dictionary(s.tags)).map(value),
        };
      }),
    };
  }
  shortcutAdd(
    name: string,
    exe: string,
    startDir?: string,
    options = "",
    execute = false,
  ): any {
    assert(
      name.trim() && exe.trim() && !/[\x00\r\n]/.test(name + exe),
      "INVALID_ARGUMENT",
      "快捷方式名称或程序无效",
    );
    const r = this.shortcuts();
    const existing = this.shortcutList().items;
    assert(
      !existing.some((s: any) => s.name === name && s.exe === exe),
      "ALREADY_EXISTS",
      "快捷方式已存在",
    );
    const id = (crc32(exe + name) | 0x80000000) >>> 0,
      index = String(Math.max(-1, ...Object.keys(r.shortcuts).map(Number)) + 1);
    r.shortcuts[index] = {
      appid: atom(id),
      AppName: atom(name),
      Exe: atom(exe),
      StartDir: atom(startDir ?? path.dirname(exe.replace(/^"|"$/g, ""))),
      LaunchOptions: atom(options),
      IsHidden: atom(0),
      AllowDesktopConfig: atom(1),
      AllowOverlay: atom(1),
      OpenVR: atom(0),
      Devkit: atom(0),
      DevkitGameID: atom(""),
      LastPlayTime: atom(0),
      tags: Object.create(null),
    };
    r.data[r.key] = r.shortcuts;
    if (execute) this.assertStopped();
    return {
      appid: id,
      name,
      ...replaceLocal(r.file, r.before, encodeBinary(r.data), execute),
    };
  }
  shortcutRemove(id: string, execute = false): any {
    const r = this.shortcuts(),
      matches = Object.entries(r.shortcuts).filter(
        ([, node]) => String(value(dictionary(node).appid)) === id,
      );
    assert(
      matches.length === 1,
      matches.length ? "AMBIGUOUS" : "NOT_FOUND",
      "快捷方式 ID 不存在或重复",
    );
    delete r.shortcuts[matches[0][0]];
    r.data[r.key] = Object.fromEntries(
      Object.values(r.shortcuts).map((v, i) => [String(i), v]),
    );
    if (execute) this.assertStopped();
    return {
      appid: id,
      ...replaceLocal(r.file, r.before, encodeBinary(r.data), execute),
    };
  }
  workshop(id?: string): any {
    const items: any[] = [];
    for (const lib of this.libraries()) {
      const dir = safePath(lib, "steamapps", "workshop");
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir).filter((n) =>
        /^appworkshop_\d+\.acf$/.test(n),
      )) {
        const data = vdf.parse(
          readFileSync(safePath(dir, file), "utf8"),
        ).AppWorkshop;
        const app = String(data?.appid ?? /\d+/.exec(file)?.[0]);
        if (id && app !== String(appid(id))) continue;
        for (const [publishedfileid, detail] of Object.entries(
          data?.WorkshopItemsInstalled ?? {},
        )) {
          const content = safePath(dir, "content", app, publishedfileid);
          items.push({
            appid: Number(app),
            publishedfileid,
            library: lib,
            path: content,
            manifest: (detail as any).manifest ?? null,
            updated: Number((detail as any).timeupdated ?? 0),
            ...treeSize(content),
          });
        }
      }
    }
    return { items, total_bytes: items.reduce((n, r) => n + r.bytes, 0) };
  }
  logs(kind: string, limit = 50): any {
    const map: Record<string, string> = {
      content: "content_log.txt",
      connection: "connection_log.txt",
      shader: "shader_log.txt",
      process: "gameprocess_log.txt",
      compat: "compat_log.txt",
    };
    assert(map[kind], "INVALID_ARGUMENT", "日志类型无效");
    const file = safePath(this.root, "logs", map[kind]);
    if (!existsSync(file)) return { path: file, exists: false, items: [] };
    const stat = lstatSync(file);
    assert(
      stat.size <= 32 * 1024 * 1024,
      "RESPONSE_TOO_LARGE",
      "日志超过 32 MiB",
    );
    const lines = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    return {
      path: file,
      exists: true,
      items: lines.slice(-number(limit, "limit", 1, 1000)).map((text, i) => ({
        line: Math.max(1, lines.length - limit + 1) + i,
        text: redact(text),
      })),
    };
  }
  assertStopped(): void {
    assert(
      !clientRunning(),
      "STEAM_RUNNING",
      "请先退出 Steam 客户端再修改其配置",
    );
  }
}
export function copyTree(source: string, destination: string): void {
  assert(!existsSync(destination), "ALREADY_EXISTS", "复制目标已存在");
  const scan = (root: string) => {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const p = path.join(root, entry.name);
      assert(
        !entry.isSymbolicLink(),
        "INVALID_ARGUMENT",
        "拒绝复制含符号链接的存档目录",
      );
      if (entry.isDirectory()) scan(p);
    }
  };
  scan(source);
  cpSync(source, destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
    dereference: false,
  });
  const check = (dir: string, target: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const src = safePath(dir, entry.name),
        dst = safePath(target, entry.name);
      if (entry.isDirectory()) check(src, dst);
      else
        assert(
          lstatSync(src).size === lstatSync(dst).size &&
            fileSha(src) === fileSha(dst),
          "VERIFY_FAILED",
          "备份文件内容校验失败",
        );
    }
  };
  check(source, destination);
}
function crc32(text: string): number {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(text)) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
