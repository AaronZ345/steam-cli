import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

export class CliError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export class CliArgumentError extends CliError {
  constructor(message: string) {
    super("INVALID_ARGUMENT", message);
  }
}
export function assert(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new CliError(code, message);
}
export function number(
  value: unknown,
  name = "number",
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const n = Number(value);
  assert(
    String(value).trim() !== "" &&
      Number.isSafeInteger(n) &&
      n >= min &&
      n <= max,
    "INVALID_ARGUMENT",
    `${name} 必须是 ${min}–${max} 的整数`,
  );
  return n;
}
export function appid(input: string | number): number {
  const text = String(input).trim();
  const match =
    /^https:\/\/store\.steampowered\.com\/app\/(\d+)(?:[/?#]|$)/.exec(text);
  return number(match?.[1] ?? text, "appid", 1, 0xffffffff);
}
export function home(): string {
  return path.resolve(
    process.env.STEAM_CLI_HOME ||
      path.join(os.homedir(), ".config", "steam-cli"),
  );
}
export function privateDir(dir = home()): void {
  if (existsSync(dir)) {
    const s = lstatSync(dir);
    assert(
      s.isDirectory() && !s.isSymbolicLink(),
      "CONFIG_ERROR",
      "存储目录必须是普通目录",
    );
    assert(
      process.platform === "win32" || (s.mode & 0o077) === 0,
      "CONFIG_ERROR",
      "存储目录权限应为 0700",
    );
  } else mkdirSync(dir, { recursive: true, mode: 0o700 });
}
export function atomic(file: string, data: string | Buffer): void {
  privateDir(path.dirname(file));
  if (existsSync(file))
    assert(
      lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(),
      "CONFIG_ERROR",
      "拒绝覆盖非普通文件",
    );
  const temp = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    const fd = openSync(
      temp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      writeFileSync(fd, data);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
}
export function privateRead(file: string, max = 1024 * 1024): string {
  const stat = lstatSync(file);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= max,
    "CONFIG_ERROR",
    "文件类型或大小无效",
  );
  assert(
    process.platform === "win32" || (stat.mode & 0o077) === 0,
    "CONFIG_ERROR",
    "凭据文件权限应为 0600",
  );
  return readFileSync(file, "utf8");
}
function key(create: boolean): Buffer {
  const p = path.join(home(), "cache.key");
  if (create && !existsSync(p)) {
    try {
      const fd = openSync(
        p,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600,
      );
      try {
        writeFileSync(fd, randomBytes(32));
      } finally {
        closeSync(fd);
      }
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  privateRead(p);
  const buf = readFileSync(p);
  assert(buf.length === 32, "CONFIG_ERROR", "本地缓存密钥长度无效");
  return buf;
}
export function saveSession(session: Record<string, unknown>): void {
  privateDir();
  const k = key(true),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", k, iv);
  try {
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(session)),
      cipher.final(),
    ]);
    atomic(
      path.join(home(), "session.json"),
      JSON.stringify({
        version: 1,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: encrypted.toString("base64"),
      }),
    );
  } finally {
    k.fill(0);
  }
}
export function loadSession(): any | null {
  const p = path.join(home(), "session.json");
  if (!existsSync(p)) return null;
  const k = key(false);
  try {
    const raw = JSON.parse(privateRead(p));
    assert(raw.version === 1, "CONFIG_ERROR", "登录缓存版本不支持");
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(raw.iv, "base64"));
    d.setAuthTag(Buffer.from(raw.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        d.update(Buffer.from(raw.data, "base64")),
        d.final(),
      ]).toString(),
    );
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError("CONFIG_ERROR", "无法解密登录缓存；缓存已保留");
  } finally {
    k.fill(0);
  }
}
export function logout(): object {
  for (const name of ["session.json", "cache.key"])
    rmSync(path.join(home(), name), { force: true });
  return { logged_in: false, cleared: true };
}
export function config(): Record<string, any> {
  const p = path.join(home(), "config.json");
  return existsSync(p) ? JSON.parse(privateRead(p)) : {};
}
export function setConfig(name: string, value: string): object {
  assert(
    [
      "country",
      "language",
      "steam_path",
      "steamcmd_path",
      "steamctl_path",
      "aurelia_path",
    ].includes(name),
    "INVALID_ARGUMENT",
    "未知配置项",
  );
  if (name === "country")
    assert(
      /^[A-Za-z]{2}$/.test(value),
      "INVALID_ARGUMENT",
      "国家代码须为两个字母",
    );
  const c = config();
  c[name] = value;
  atomic(path.join(home(), "config.json"), JSON.stringify(c, null, 2));
  return { changed: name, value, path: path.join(home(), "config.json") };
}
const secretKeys =
  /^(?:cookies?|authorization|password|refreshToken|accessToken|refresh_token|access_token|sessionid|steamLoginSecure|api_key|key|shared_secret|identity_secret)$/i;
export function redact(value: any): any {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string")
    return value
      .replace(
        /(["']?)\b(steamLoginSecure|sessionid|access_?token|refresh_?token|api_?key|key|password|shared_secret|identity_secret)\1\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s;,&]+)/gi,
        "$2=[REDACTED]",
      )
      .replace(/\bBearer\s+[A-Za-z0-9_.~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        "[REDACTED]",
      );
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        secretKeys.test(k) ? "[REDACTED]" : redact(v),
      ]),
    );
  return value;
}
export function errorPayload(e: unknown): object {
  const error =
    e instanceof CliError
      ? e
      : new CliError(
          "COMMAND_FAILED",
          e instanceof Error ? e.message : "命令执行失败",
        );
  return redact({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}
