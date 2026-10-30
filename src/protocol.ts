import { createHmac } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import { createSocket } from "node:dgram";
import { assert, number, CliError } from "./core.js";

export function guardCode(
  secret: Buffer,
  time: number,
): { code: string; valid_until: number } {
  assert(
    secret.length >= 10 && secret.length <= 128,
    "INVALID_ARGUMENT",
    "Steam Guard shared secret 长度无效",
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(number(time, "time") / 30)));
  const hash = createHmac("sha1", secret).update(counter).digest(),
    offset = hash[19] & 15;
  let n = hash.readUInt32BE(offset) & 0x7fffffff,
    code = "";
  const alphabet = "23456789BCDFGHJKMNPQRTVWXY";
  for (let i = 0; i < 5; i++) {
    code += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return { code, valid_until: (Math.floor(time / 30) + 1) * 30 };
}
export function guardFile(
  file: string,
  time = Math.floor(Date.now() / 1000),
): any {
  const s = lstatSync(file);
  assert(
    s.isFile() && !s.isSymbolicLink() && s.size <= 1024 * 1024,
    "INVALID_ARGUMENT",
    "需要普通的 shared-secret 或 maFile 文件",
  );
  assert(
    process.platform === "win32" || (s.mode & 0o077) === 0,
    "CONFIG_ERROR",
    "认证文件权限需要 0600",
  );
  const text = readFileSync(file, "utf8").trim();
  let secret = text;
  if (text.startsWith("{")) secret = JSON.parse(text).shared_secret;
  assert(
    typeof secret === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(secret),
    "INVALID_ARGUMENT",
    "文件缺少 Base64 shared_secret",
  );
  return {
    ...guardCode(Buffer.from(secret, "base64"), time),
    clock: "local UTC; synchronize clock if codes fail",
    secret_exported: false,
  };
}
export function masterPacket(
  region: number,
  seed: string,
  filter: string,
): Buffer {
  number(region, "region", 0, 255);
  assert(
    region <= 7 || region === 255,
    "INVALID_ARGUMENT",
    "地区支持 0–7 或 255",
  );
  assert(
    /^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(seed),
    "INVALID_ARGUMENT",
    "服务器分页 seed 无效",
  );
  assert(
    filter.length <= 500 && !/[\x00-\x1f\x7f-\uffff]/.test(filter),
    "INVALID_ARGUMENT",
    "Master 过滤器必须为至多 500 字节 ASCII",
  );
  return Buffer.concat([
    Buffer.from([0x31, region]),
    Buffer.from(seed + "\0" + filter + "\0"),
  ]);
}
export function parseMaster(buffer: Buffer): {
  items: string[];
  complete: boolean;
} {
  assert(
    buffer.length >= 6 &&
      buffer
        .subarray(0, 6)
        .equals(Buffer.from([255, 255, 255, 255, 0x66, 0x0a])) &&
      (buffer.length - 6) % 6 === 0,
    "PARSE_ERROR",
    "Master Server 响应无效",
  );
  const items: string[] = [];
  for (let at = 6; at < buffer.length; at += 6) {
    const ip = [...buffer.subarray(at, at + 4)].join("."),
      port = buffer.readUInt16BE(at + 4);
    if (ip === "0.0.0.0" && port === 0) return { items, complete: true };
    items.push(`${ip}:${port}`);
  }
  return { items, complete: false };
}
async function exchange(packet: Buffer): Promise<Buffer> {
  const socket = createSocket("udp4");
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new CliError("NETWORK_ERROR", "Steam Master UDP 查询超时")),
        5000,
      );
      const finish = (error?: unknown, data?: Buffer) => {
        clearTimeout(timer);
        if (error)
          reject(new CliError("NETWORK_ERROR", "Steam Master UDP 查询失败"));
        else resolve(data!);
      };
      socket.once("error", finish);
      socket.once("message", (data) => finish(undefined, data));
      socket.connect(27011, "hl2master.steampowered.com", () =>
        socket.send(packet, (error) => {
          if (error) finish(error);
        }),
      );
    });
  } finally {
    socket.close();
  }
}
export async function masterServers(p: any, request = exchange): Promise<any> {
  const limit = number(p.limit ?? 100, "limit", 1, 10000),
    region = number(p.region ?? 255, "region"),
    items: string[] = [];
  let seed = p.cursor ?? "0.0.0.0:0",
    complete = false;
  const seen = new Set<string>();
  for (let page = 0; page < 50 && items.length < limit; page++) {
    assert(!seen.has(seed), "PAGINATION_ERROR", "Master Server 游标未前进");
    seen.add(seed);
    const reply = parseMaster(
      await request(masterPacket(region, seed, p.filter ?? "")),
    );
    const available = reply.items.slice(0, limit - items.length);
    items.push(...available);
    if (reply.complete && available.length === reply.items.length) {
      complete = true;
      break;
    }
    assert(
      available.length > 0,
      "PAGINATION_ERROR",
      "Master Server 返回非终止空页",
    );
    seed = available.at(-1)!;
  }
  return {
    items: [...new Set(items)],
    complete,
    next_cursor: complete ? null : seed,
    region,
    transport: "direct UDP; no system proxy changes",
  };
}
