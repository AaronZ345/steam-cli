import { execFile } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, lstatSync } from "node:fs";
import path from "node:path";
import { assert, CliError } from "./core.js";
import { steamRoot } from "./local.js";
import { browserEnvironment } from "./browser-platform.js";
import {
  decryptChromiumCookie,
  chromiumStoragePassword,
} from "./browser-cookies.js";
import type { Cookie } from "./http.js";

export interface SteamCookieOptions {
  root?: string;
  profile?: string;
  keychainService?: string;
}
export interface SteamCookieStore {
  path: string;
  cache_root: string;
  profile: string;
}
export interface SteamCookieDependencies {
  stores?: SteamCookieStore[];
  macSecret?: (service: string) => Promise<string>;
  linuxSecret?: () => Promise<string | undefined>;
  unprotect?: (data: Buffer) => Promise<Buffer>;
}
function file(candidate: string): boolean {
  try {
    return lstatSync(candidate).isFile();
  } catch {
    return false;
  }
}
export function steamCookieStores(
  opts: SteamCookieOptions = {},
  target = browserEnvironment(),
): SteamCookieStore[] {
  assert(
    opts.root === undefined ||
      (typeof opts.root === "string" && opts.root.trim().length > 0),
    "INVALID_ARGUMENT",
    "Steam 根目录不能为空",
  );
  assert(
    opts.profile === undefined ||
      (typeof opts.profile === "string" && opts.profile.trim().length > 0),
    "INVALID_ARGUMENT",
    "Steam profile 不能为空",
  );
  const p = target.platform === "win32" ? path.win32 : path.posix;
  let roots: string[];
  if (opts.root)
    roots = [
      p.join(
        opts.root.startsWith("~/")
          ? p.join(target.home, opts.root.slice(2))
          : opts.root,
        "config",
        "htmlcache",
      ),
    ];
  else {
    const install =
      target.platform === process.platform &&
      target.home === browserEnvironment().home
        ? steamRoot()
        : null;
    roots = [
      ...(install ? [p.join(install, "config", "htmlcache")] : []),
      ...(target.platform === "darwin"
        ? [
            p.join(
              target.home,
              "Library",
              "Application Support",
              "Steam",
              "config",
              "htmlcache",
            ),
          ]
        : target.platform === "win32"
          ? [
              p.join(
                target.env.LOCALAPPDATA ??
                  p.join(target.home, "AppData", "Local"),
                "Steam",
                "htmlcache",
              ),
            ]
          : [
              p.join(target.home, ".steam", "steam", "config", "htmlcache"),
              p.join(
                target.home,
                ".local",
                "share",
                "Steam",
                "config",
                "htmlcache",
              ),
              p.join(
                target.home,
                ".var",
                "app",
                "com.valvesoftware.Steam",
                ".local",
                "share",
                "Steam",
                "config",
                "htmlcache",
              ),
            ]),
    ];
  }
  // Explicit selection never searches another browser or Steam profile.
  let selections: Array<{ dir: string; cache: string; direct?: boolean }>;
  if (
    opts.profile &&
    (p.isAbsolute(opts.profile) ||
      opts.profile.startsWith("~/") ||
      opts.profile.includes("/") ||
      opts.profile.includes("\\"))
  ) {
    const selected = opts.profile.startsWith("~/")
      ? p.join(target.home, opts.profile.slice(2))
      : p.resolve(opts.profile);
    const dir = file(selected) ? p.dirname(selected) : selected;
    const cache =
      p.basename(dir) === "Network"
        ? p.dirname(p.dirname(dir))
        : p.basename(dir) === "Default" || /^Profile \d+$/.test(p.basename(dir))
          ? p.dirname(dir)
          : dir;
    selections = [
      { dir: file(selected) ? selected : dir, cache, direct: file(selected) },
    ];
  } else {
    assert(
      !opts.profile || (opts.profile !== "." && opts.profile !== ".."),
      "INVALID_ARGUMENT",
      "Steam profile 名称无效",
    );
    selections = roots.flatMap((cache) => [
      { dir: p.join(cache, opts.profile ?? "Default"), cache },
      ...(!opts.profile ? [{ dir: cache, cache }] : []),
    ]);
  }
  const stores: SteamCookieStore[] = [];
  for (const selected of selections) {
    const found = selected.direct
      ? selected.dir
      : [
          p.join(selected.dir, "Network", "Cookies"),
          p.join(selected.dir, "Cookies"),
        ].find(file);
    if (!found || !file(found)) continue;
    const resolved = realpathSync(found);
    if (stores.some((s) => s.path === resolved)) continue;
    stores.push({
      path: resolved,
      cache_root: realpathSync(selected.cache),
      profile: selected.direct
        ? p.basename(p.dirname(found))
        : p.basename(selected.dir),
    });
  }
  return stores;
}
export function steamClientSources(
  opts: SteamCookieOptions = {},
  target = browserEnvironment(),
): any {
  const stores = steamCookieStores(opts, target);
  return {
    source: "steam-client",
    platform: target.platform,
    found: stores.length > 0,
    stores,
    read_only: true,
    encryption:
      target.platform === "darwin"
        ? "Chromium CBC with macOS Keychain"
        : target.platform === "win32"
          ? "Chromium GCM with current-user DPAPI (v20 unsupported)"
          : "Chromium CBC with basic storage or system keyring",
    client_protocol_credentials: false,
  };
}
export async function macStorageSecret(service: string): Promise<string> {
  assert(
    service.length > 0 && service.length <= 128 && !/[\r\n\0]/.test(service),
    "INVALID_ARGUMENT",
    "钥匙串 service 名称无效",
  );
  return new Promise((resolve, reject) =>
    execFile(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", service],
      { timeout: 15000, maxBuffer: 65536 },
      (error, out) => {
        if (error) {
          const code = String(error.code);
          reject(
            new CliError(
              code === "44"
                ? "KEYCHAIN_ITEM_NOT_FOUND"
                : "KEYCHAIN_ACCESS_DENIED",
              code === "44"
                ? "未找到 Steam 使用的 Safe Storage 钥匙串项目"
                : "系统钥匙串未允许读取 Steam Cookie 解密材料；原缓存未修改",
            ),
          );
          return;
        }
        assertSecret(out, resolve, reject);
      },
    ),
  );
}
function assertSecret(
  out: string,
  resolve: (v: string) => void,
  reject: (e: Error) => void,
): void {
  const value = out.trim();
  if (!value)
    reject(
      new CliError("KEYCHAIN_ACCESS_DENIED", "系统未返回 Cookie 解密材料"),
    );
  else resolve(value);
}
export async function unprotectWindows(data: Buffer): Promise<Buffer> {
  // Secret bytes travel through stdin/stdout pipes, never command-line arguments.
  const script = `$ErrorActionPreference='Stop';try {Add-Type -AssemblyName System.Security;$text=[Console]::In.ReadToEnd();$bytes=[Convert]::FromBase64String($text);$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($plain))} catch {[Console]::Error.Write('DPAPI access denied');exit 1}`;
  return new Promise((resolve, reject) => {
    const child = execFile(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, out) => {
        if (error) {
          reject(
            new CliError(
              "OS_CREDENTIAL_ACCESS_DENIED",
              "当前 Windows 用户无法解密 Steam Cookie；没有更改系统权限",
            ),
          );
          return;
        }
        const text = out.trim();
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
          reject(new CliError("COOKIE_DECRYPT_FAILED", "DPAPI 返回格式无效"));
          return;
        }
        resolve(Buffer.from(text, "base64"));
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(data.toString("base64"));
  });
}
async function windowsKey(
  store: SteamCookieStore,
  unprotect: (data: Buffer) => Promise<Buffer>,
): Promise<Buffer> {
  for (const name of ["Local State", "LocalPrefs.json"]) {
    const candidate = path.join(store.cache_root, name);
    if (!existsSync(candidate)) continue;
    const stat = lstatSync(candidate);
    assert(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4 * 1024 * 1024,
      "CONFIG_ERROR",
      "Steam CEF 加密配置类型或大小无效",
    );
    let raw: any;
    try {
      raw = JSON.parse(readFileSync(candidate, "utf8"));
    } catch {
      throw new CliError("PARSE_ERROR", "Steam CEF 加密配置不是有效 JSON");
    }
    const value = raw.os_crypt?.encrypted_key;
    if (typeof value !== "string") continue;
    const wrapped = Buffer.from(value, "base64");
    assert(
      wrapped.subarray(0, 5).toString() === "DPAPI",
      "UNSUPPORTED_ENCRYPTION",
      "此 Steam Cookie 使用不支持的 Windows 密钥格式",
    );
    const key = await unprotect(wrapped.subarray(5));
    assert(
      key.length === 32,
      "COOKIE_DECRYPT_FAILED",
      "Steam Cookie AES 密钥长度无效",
    );
    return key;
  }
  throw new CliError(
    "COOKIE_KEY_MISSING",
    "Steam CEF 配置中未找到当前用户的加密密钥",
  );
}
export function decryptSteamGCM(
  data: Buffer,
  host: string,
  version: number,
  key: Buffer,
): string | null {
  try {
    if (data.subarray(0, 3).toString() !== "v10" || data.length < 31)
      return null;
    const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(3, 15));
    cipher.setAuthTag(data.subarray(-16));
    let plain = Buffer.concat([
      cipher.update(data.subarray(15, -16)),
      cipher.final(),
    ]);
    if (version >= 24) {
      const expected = createHash("sha256").update(host).digest();
      if (!plain.subarray(0, 32).equals(expected)) return null;
      plain = plain.subarray(32);
    }
    return plain.toString("utf8");
  } catch {
    return null;
  }
}
export async function readSteamClientCookies(
  opts: SteamCookieOptions = {},
  target = browserEnvironment(),
  deps: SteamCookieDependencies = {},
): Promise<{
  cookies: Cookie[];
  stores: SteamCookieStore[];
  warnings: string[];
}> {
  assert(
    ["darwin", "win32", "linux"].includes(target.platform),
    "UNSUPPORTED_PLATFORM",
    "Steam Cookie 读取支持 macOS、Windows 和 Linux",
  );
  const stores = deps.stores ?? steamCookieStores(opts, target);
  assert(
    stores.length,
    "AUTH_REQUIRED",
    "没有找到 Steam App Cookie 数据库；请先在 Steam App 登录，或用 --profile 指定缓存目录",
  );
  const { DatabaseSync } = await import("node:sqlite"),
    cookies: Cookie[] = [],
    warnings = new Set<string>();
  let password: string | undefined,
    passwordRead = false;
  for (const store of stores) {
    let rows: any[], version: number;
    const db = new DatabaseSync(store.path, { readOnly: true });
    try {
      db.exec("PRAGMA trusted_schema=OFF");
      version = Number(
        db.prepare("SELECT value FROM meta WHERE key='version'").get()?.value ??
          0,
      );
      const columns = db
        .prepare("PRAGMA table_info(cookies)")
        .all()
        .map((c) => String(c.name));
      const partition = columns.includes("top_frame_site_key")
        ? " AND top_frame_site_key = ''"
        : "";
      assert(
        Number.isSafeInteger(version) && version >= 0,
        "PARSE_ERROR",
        "Steam Cookie 数据库 schema 版本无效",
      );
      rows = db
        .prepare(
          "SELECT host_key,name,value,encrypted_value,path,CAST(expires_utc AS TEXT) AS expires_utc FROM cookies WHERE name IN ('steamLoginSecure','sessionid','steamCountry','birthtime','lastagecheckage','wants_mature_content') AND host_key IN ('steamcommunity.com','.steamcommunity.com','steampowered.com','.steampowered.com','store.steampowered.com','.store.steampowered.com') AND path='/' AND (expires_utc=0 OR expires_utc>?)" +
            partition,
        )
        .all(BigInt(Date.now() + 11644473600000) * 1000n);
      assert(
        rows.length <= 1000,
        "RESPONSE_TOO_LARGE",
        "Steam 登录 Cookie 数量异常",
      );
    } finally {
      db.close();
    }
    if (!rows.some((r) => r.name === "steamLoginSecure")) continue;
    let key: Buffer | undefined;
    try {
      for (const row of rows) {
        let value =
          typeof row.value === "string" && row.value ? row.value : null;
        const encrypted = Buffer.from(row.encrypted_value ?? []),
          prefix = encrypted.subarray(0, 3).toString();
        if (!value && encrypted.length) {
          if (prefix === "v20")
            throw new CliError(
              "UNSUPPORTED_ENCRYPTION",
              "Steam Cookie 使用 App-Bound Encryption；不提供绕过，请改用扫码或用户导出的 Cookie",
            );
          if (target.platform === "win32") {
            if (prefix === "v10") {
              key ??= await windowsKey(
                store,
                deps.unprotect ?? unprotectWindows,
              );
              value = decryptSteamGCM(
                encrypted,
                String(row.host_key),
                version,
                key,
              );
            } else if (prefix !== "v11")
              value = (
                await (deps.unprotect ?? unprotectWindows)(encrypted)
              ).toString("utf8");
          } else {
            if (
              !passwordRead &&
              (target.platform === "darwin" || prefix === "v11")
            ) {
              password =
                target.platform === "darwin"
                  ? await (deps.macSecret ?? macStorageSecret)(
                      opts.keychainService ?? "Chromium Safe Storage",
                    )
                  : await (
                      deps.linuxSecret ??
                      (() => chromiumStoragePassword("chromium", target, 15000))
                    )();
              passwordRead = true;
              assert(
                password,
                "KEYCHAIN_ACCESS_DENIED",
                "系统钥匙串未提供 Steam Cookie 解密材料",
              );
            }
            value = decryptChromiumCookie(
              encrypted,
              String(row.host_key),
              version,
              target.platform,
              password,
            );
          }
        }
        if (!value) {
          if (row.name === "steamLoginSecure")
            throw new CliError(
              "COOKIE_DECRYPT_FAILED",
              "无法解密 Steam 登录 Cookie；原缓存未修改",
            );
          warnings.add(
            "部分非登录 Cookie 无法解密，相关写操作可能需要重新登录",
          );
          continue;
        }
        cookies.push({
          name: String(row.name),
          value,
          domain: String(row.host_key),
          path: String(row.path),
          expires:
            Number(row.expires_utc) === 0
              ? undefined
              : Number(row.expires_utc) / 1000000 - 11644473600,
        });
      }
    } finally {
      key?.fill(0);
    }
  }
  assert(
    cookies.some((c) => c.name === "steamLoginSecure"),
    "AUTH_REQUIRED",
    "Steam App 缓存中没有有效登录 Cookie；请在客户端打开社区或商店完成登录",
  );
  return { cookies, stores, warnings: [...warnings] };
}
