import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync, readFileSync, statfsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import vdf from "./text-vdf.js";
import { appid, assert, config, CliError, redact } from "./core.js";

const executeFile = promisify(execFile);
export function steamRoot(): string | null {
  const c = config(),
    candidates = [
      c.steam_path,
      process.env.STEAM_PATH,
      ...(process.platform === "darwin"
        ? [path.join(os.homedir(), "Library/Application Support/Steam")]
        : process.platform === "win32"
          ? [
              path.join(
                process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
                "Steam",
              ),
            ]
          : [
              path.join(os.homedir(), ".steam/steam"),
              path.join(os.homedir(), ".local/share/Steam"),
            ]),
    ];
  return (
    candidates.find((p) => p && existsSync(path.join(p, "steamapps"))) ?? null
  );
}
export function libraries(): any {
  const root = steamRoot();
  assert(
    root,
    "NOT_FOUND",
    "未找到 Steam 安装目录；可设置 config set steam_path",
  );
  const file = path.join(root, "steamapps/libraryfolders.vdf"),
    parsed = existsSync(file) ? vdf.parse(readFileSync(file, "utf8")) : {},
    folders = new Set<string>([root]);
  for (const [k, value] of Object.entries(
    parsed.libraryfolders ?? parsed.LibraryFolders ?? {},
  )) {
    if (!/^\d+$/.test(k)) continue;
    const folder = typeof value === "string" ? value : (value as any)?.path;
    if (typeof folder === "string") folders.add(folder);
  }
  return {
    steam_path: root,
    items: [...folders].map((folder) => {
      let free: number | null = null;
      try {
        const fs = statfsSync(folder);
        free = fs.bavail * fs.bsize;
      } catch {}
      return { path: folder, exists: existsSync(folder), free_bytes: free };
    }),
  };
}
export function installed(): any {
  const folders = libraries().items,
    items: any[] = [];
  for (const f of folders) {
    const dir = path.join(f.path, "steamapps");
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) =>
      /^appmanifest_\d+\.acf$/.test(n),
    )) {
      const raw = vdf.parse(
        readFileSync(path.join(dir, name), "utf8"),
      ).AppState;
      assert(
        raw?.appid && raw.installdir,
        "PARSE_ERROR",
        `无效安装清单：${name}`,
      );
      items.push({
        appid: Number(raw.appid),
        name: raw.name,
        library: f.path,
        install_dir: path.join(dir, "common", raw.installdir),
        size_bytes: Number(raw.SizeOnDisk || 0),
        state_flags: Number(raw.StateFlags),
        last_updated: raw.LastUpdated ? Number(raw.LastUpdated) : null,
        buildid: raw.buildid ?? null,
        manifest: path.join(dir, name),
      });
    }
  }
  return { items, total: items.length };
}
export function executable(name: string): string | null {
  const c = config(),
    configured = c[`${name}_path`];
  if (configured) return existsSync(configured) ? configured : null;
  for (const folder of (process.env.PATH || "").split(path.delimiter))
    for (const suffix of process.platform === "win32"
      ? [".exe", ".cmd", ""]
      : [""]) {
      const p = path.join(folder, name + suffix);
      if (existsSync(p)) return p;
    }
  return null;
}
export function backends(): object {
  return {
    items: ["steamcmd", "steamctl", "aurelia"].map((name) => ({
      name,
      path: executable(name),
      installed: Boolean(executable(name)),
      native: false,
    })),
  };
}
export async function backend(
  name: string,
  args: string[],
  execute = false,
): Promise<object> {
  assert(
    ["steamcmd", "steamctl", "aurelia"].includes(name),
    "INVALID_ARGUMENT",
    "backend 支持 steamcmd、steamctl、aurelia",
  );
  assert(
    args.every(
      (a) =>
        !/[\r\n\x00]/.test(a) &&
        !/password|refresh.?token|access.?token|shared.?secret|identity.?secret|api.?key/i.test(
          a,
        ),
    ),
    "INVALID_ARGUMENT",
    "请在后端自身交互终端或凭据文件中配置认证",
  );
  if (name === "steamcmd") {
    const index = args.findIndex((a) => a.toLowerCase() === "+login");
    if (index >= 0)
      assert(
        !args[index + 2] || args[index + 2].startsWith("+"),
        "INVALID_ARGUMENT",
        "steamcmd +login 只接收用户名；请先在后端终端完成登录缓存",
      );
  }
  const bin = executable(name);
  if (!execute)
    return {
      dry_run: true,
      backend: name,
      installed: Boolean(bin),
      command: name,
      args,
    };
  assert(bin, "DEPENDENCY_MISSING", `未安装 ${name}，请先安装该后端`);
  try {
    const r = await executeFile(bin, args, {
      timeout: 15 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      backend: name,
      exit_code: 0,
      stdout: redact(r.stdout),
      stderr: redact(r.stderr),
      verified: false,
    };
  } catch (e: any) {
    throw new CliError("BACKEND_ERROR", `${name} 执行失败或超时`, {
      exit_code: e.code ?? null,
      stdout: redact(e.stdout || ""),
      stderr: redact(e.stderr || ""),
    });
  }
}
export async function launch(
  input: string | number,
  action = "run",
  execute = false,
): Promise<object> {
  const id = appid(input);
  assert(
    ["run", "install", "uninstall", "validate", "store"].includes(action),
    "INVALID_ARGUMENT",
    "未知 Steam 客户端操作",
  );
  const uri = `steam://${action}/${id}`;
  if (!execute)
    return { dry_run: true, action, appid: id, uri, backend: "steam-client" };
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32.exe"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", uri] : [uri];
  await executeFile(command, args, { timeout: 10000 });
  return {
    dispatched: true,
    verified: false,
    action,
    appid: id,
    note: "操作已交给 Steam 客户端；安装或校验是否完成需另行检查",
  };
}
