import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  renameSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import os from "node:os";
import vdf from "./text-vdf.js";
import { LocalData, safePath, replaceLocal, copyTree } from "./local-data.js";
import { appid, assert, CliError, redact } from "./core.js";

const PRESETS: Record<string, string> = {
  none: "",
  gamemode: "gamemoderun %command%",
  mangohud: "mangohud %command%",
  "gamemode-mangohud": "gamemoderun mangohud %command%",
  "proton-log": "PROTON_LOG=1 %command%",
  "disable-esync": "PROTON_NO_ESYNC=1 %command%",
  "disable-fsync": "PROTON_NO_FSYNC=1 %command%",
  "force-opengl": "PROTON_USE_WINED3D=1 %command%",
};
export function preset(
  local: LocalData,
  id?: string,
  name?: string,
  execute = false,
): any {
  if (!id || !name)
    return {
      items: Object.entries(PRESETS).map(([name, options]) => ({
        name,
        options,
      })),
    };
  assert(Object.hasOwn(PRESETS, name), "INVALID_ARGUMENT", "未知启动预设");
  return { preset: name, ...local.launchOptions(id, PRESETS[name], execute) };
}
export function mangoHud(p: any): any {
  const file = path.resolve(
    p.file ??
      path.join(
        process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
        "MangoHud",
        "MangoHud.conf",
      ),
  );
  assert(
    !existsSync(file) || !lstatSync(file).isSymbolicLink(),
    "INVALID_ARGUMENT",
    "拒绝覆盖符号链接",
  );
  const before = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
  if (p.config === undefined)
    return {
      path: file,
      exists: existsSync(file),
      text: before.toString("utf8"),
    };
  assert(
    typeof p.config === "string" &&
      p.config.length <= 128000 &&
      !p.config.includes("\0"),
    "INVALID_ARGUMENT",
    "MangoHud 配置格式无效",
  );
  return replaceLocal(file, before, Buffer.from(p.config), p.execute);
}
export async function importLutris(
  local: LocalData,
  file: string,
  execute = false,
): Promise<any> {
  // JSON export avoids executing YAML tags, installer scripts or runners.
  let raw: any;
  if (/\.db$/i.test(file)) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      db.exec("PRAGMA trusted_schema=OFF");
      raw = db
        .prepare("SELECT name, slug FROM games WHERE installed = 1")
        .all();
    } finally {
      db.close();
    }
  } else raw = JSON.parse(readFileSync(file, "utf8"));
  assert(
    Array.isArray(raw) && raw.length <= 1000,
    "INVALID_ARGUMENT",
    "需要 Lutris 游戏导出的 JSON 数组，最多 1000 项",
  );
  const planned: any[] = [],
    skipped: any[] = [];
  const existing = local.shortcutList().items;
  for (const game of raw) {
    assert(
      typeof game.name === "string" &&
        /^[\w.-]+$/.test(String(game.slug ?? "")),
      "INVALID_ARGUMENT",
      "Lutris 游戏需要 name、slug",
    );
    const exe = "lutris",
      options = `lutris:rungame/${game.slug}`;
    if (
      existing.some(
        (s: any) => s.name === game.name && s.launch_options === options,
      )
    ) {
      skipped.push(game.name);
      continue;
    }
    assert(
      !planned.some((g) => g.options === options),
      "INVALID_ARGUMENT",
      "Lutris 导出中有重复游戏",
    );
    planned.push({ name: game.name, exe, options });
    // Validate all names before changing the first shortcut.
    local.shortcutAdd(game.name, exe, undefined, options, false);
  }
  if (!execute) return { dry_run: true, items: planned, skipped, source: file };
  const completed = [];
  try {
    for (const g of planned)
      completed.push(
        local.shortcutAdd(g.name, g.exe, undefined, g.options, true),
      );
  } catch (e: any) {
    throw new CliError("IMPORT_PARTIAL", "快捷方式导入中止", {
      completed,
      error: { code: e.code ?? "COMMAND_FAILED" },
    });
  }
  return {
    accepted: true,
    verified: completed.every((g) => g.verified),
    items: completed,
    skipped,
  };
}
export function moveGame(
  local: LocalData,
  id: string,
  destination: string,
  execute = false,
): any {
  const game = local.game(id),
    targetLibrary = realpathSync(destination);
  assert(
    local.libraries().includes(targetLibrary),
    "INVALID_ARGUMENT",
    "目标必须是 Steam 已登记的游戏库",
  );
  assert(
    targetLibrary !== game.library,
    "INVALID_ARGUMENT",
    "游戏已位于目标库",
  );
  const source = game.install_dir,
    target = safePath(
      targetLibrary,
      "steamapps",
      "common",
      game.raw.installdir,
    ),
    sourceManifest = safePath(
      game.library,
      "steamapps",
      `appmanifest_${appid(id)}.acf`,
    ),
    targetManifest = safePath(
      targetLibrary,
      "steamapps",
      `appmanifest_${appid(id)}.acf`,
    );
  assert(
    existsSync(source) && !existsSync(target) && !existsSync(targetManifest),
    "CONFLICT",
    "游戏源目录不存在或目标已占用",
  );
  const before = readFileSync(sourceManifest),
    hash = createHash("sha256").update(before).digest("hex");
  const plan = {
    appid: appid(id),
    source,
    target,
    source_manifest: sourceManifest,
    target_manifest: targetManifest,
    includes_workshop: false,
  };
  if (!execute) return { dry_run: true, ...plan };
  local.assertStopped();
  const stage = safePath(
    targetLibrary,
    "steamapps",
    "common",
    `.steam-cli-moving-${appid(id)}-${randomBytes(6).toString("hex")}`,
  );
  mkdirSync(path.dirname(stage), { recursive: true });
  let committed = false,
    ownTarget = false,
    ownManifest = false;
  try {
    copyTree(source, stage);
    local.assertStopped();
    assert(
      createHash("sha256")
        .update(readFileSync(sourceManifest))
        .digest("hex") === hash,
      "CONFLICT",
      "复制期间安装清单已变化",
    );
    assert(
      !existsSync(target) && !existsSync(targetManifest),
      "CONFLICT",
      "目标库发生并发修改",
    );
    renameSync(stage, target);
    ownTarget = true;
    writeFileSync(targetManifest, before, { flag: "wx", mode: 0o600 });
    ownManifest = true;
    const readback = local
      .manifests()
      .filter((g) => g.appid === appid(id) && g.library === targetLibrary);
    assert(
      readback.length === 1 && readback[0].install_dir === target,
      "VERIFY_FAILED",
      "目标库安装记录读取失败",
    );
    // Keep the source manifest as a rollback record; source files were content-verified.
    renameSync(
      sourceManifest,
      sourceManifest + `.steam-cli-${hash.slice(0, 12)}.bak`,
    );
    committed = true;
    rmSync(source, { recursive: true });
    return {
      ...plan,
      accepted: true,
      verified: true,
      config_modified: true,
      backup: sourceManifest + `.steam-cli-${hash.slice(0, 12)}.bak`,
    };
  } catch (e) {
    if (!committed) {
      rmSync(stage, { recursive: true, force: true });
      if (ownTarget) rmSync(target, { recursive: true, force: true });
      if (ownManifest) rmSync(targetManifest, { force: true });
    } else
      throw new CliError("MOVE_PARTIAL", "目标库已完成，源文件清理未完成", {
        ...plan,
        source_cleanup_required: true,
      });
    throw e;
  }
}
export function localCollections(local: LocalData, p: any): any {
  const file = safePath(local.userRoot(), "7", "remote", "sharedconfig.vdf"),
    before = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
  const data = before.length
    ? vdf.parse(before.toString("utf8"))
    : {
        UserRoamingConfigStore: {
          Software: { Valve: { Steam: { apps: {} } } },
        },
      };
  let node = data;
  for (const key of [
    "UserRoamingConfigStore",
    "Software",
    "Valve",
    "Steam",
    "apps",
  ]) {
    const k =
      Object.keys(node).find((k) => k.toLowerCase() === key.toLowerCase()) ??
      key;
    node[k] ??= {};
    node = node[k];
  }
  if (!p.name) {
    const groups = new Map<string, number[]>();
    for (const [id, value] of Object.entries(node))
      for (const tag of Object.values((value as any).tags ?? {})) {
        if (typeof tag !== "string" || !/^\d+$/.test(id)) continue;
        groups.set(tag, [...(groups.get(tag) ?? []), Number(id)]);
      }
    return {
      items: [...groups].map(([name, apps]) => ({ name, apps })),
      source: "legacy sharedconfig tags",
      modern_collections: false,
      cloud_synced: false,
    };
  }
  assert(
    Array.isArray(p.apps) && p.apps.length <= 10000 && p.name.trim(),
    "INVALID_ARGUMENT",
    "需要合集名称和 appid 数组",
  );
  const wanted = new Set<number>(p.apps.map((v: any) => appid(v)));
  for (const [id, value] of Object.entries(node)) {
    const game = value as any,
      tags = Object.values(game.tags ?? {}).filter((t) => t !== p.name);
    if (wanted.has(Number(id))) {
      tags.push(p.name);
      wanted.delete(Number(id));
    }
    game.tags = Object.fromEntries(tags.map((t, i) => [String(i), t]));
  }
  for (const id of wanted) node[id] = { tags: { "0": p.name } };
  if (p.execute) local.assertStopped();
  return {
    name: p.name,
    modern_collections: false,
    cloud_synced: false,
    ...replaceLocal(file, before, Buffer.from(vdf.stringify(data)), p.execute),
  };
}
export function crashLogs(local: LocalData, id: string, limit = 50): any {
  const file = safePath(os.homedir(), `steam-${appid(id)}.log`);
  assert(
    limit >= 1 && limit <= 1000,
    "INVALID_ARGUMENT",
    "limit 必须为 1–1000",
  );
  // The Steam Proton log is user-readable; generic diagnostics handles redaction.
  if (!existsSync(file))
    return { appid: appid(id), path: file, exists: false, items: [] };
  assert(
    lstatSync(file).size <= 32 * 1024 * 1024,
    "RESPONSE_TOO_LARGE",
    "Proton 日志超过 32 MiB",
  );
  return {
    appid: appid(id),
    path: file,
    exists: true,
    text: redact(
      readFileSync(file, "utf8").split(/\r?\n/).slice(-limit).join("\n"),
    ),
    root: local.root,
  };
}
