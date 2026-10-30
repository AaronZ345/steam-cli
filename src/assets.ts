import { readFileSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { assert, appid, CliError } from "./core.js";
import { Client, cookieHeader } from "./http.js";
import { fetch, FormData, EnvHttpProxyAgent } from "undici";

// Valve size specifications, checked 2026-10-30. Asset content still needs review.
export const assetSizes: Record<string, [number, number]> = {
  headerCapsule: [920, 430],
  smallCapsule: [462, 174],
  mainCapsule: [1232, 706],
  verticalCapsule: [748, 896],
  libraryCapsule: [600, 900],
  libraryHero: [3840, 1240],
  libraryHeader: [920, 430],
  pageBackground: [1438, 810],
  achievementIcon: [256, 256],
  communityIcon: [184, 184],
  eventCover: [800, 450],
  eventHeader: [1920, 622],
};
export const assetSlots = [
  ...Object.keys(assetSizes),
  "libraryLogo",
  "screenshot",
];
function crc(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function imageInfo(bytes: Buffer): any {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    let width = 0,
      height = 0,
      depth = 0,
      color = 0,
      interlace = 0,
      alpha = false,
      end = false;
    const compressed: Buffer[] = [];
    for (let offset = 8; offset < bytes.length;) {
      assert(offset + 12 <= bytes.length, "INVALID_IMAGE", "PNG 块被截断");
      const size = bytes.readUInt32BE(offset),
        endData = offset + 8 + size;
      assert(endData + 4 <= bytes.length, "INVALID_IMAGE", "PNG 块长度无效");
      const type = bytes.toString("ascii", offset + 4, offset + 8),
        data = bytes.subarray(offset + 8, endData);
      assert(
        crc(bytes.subarray(offset + 4, endData)) ===
          bytes.readUInt32BE(endData),
        "INVALID_IMAGE",
        "PNG CRC 校验失败",
      );
      if (type === "IHDR") {
        assert(offset === 8 && size === 13, "INVALID_IMAGE", "PNG IHDR 无效");
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        depth = data[8];
        color = data[9];
        interlace = data[12];
        alpha = color === 4 || color === 6;
      }
      if (type === "tRNS") alpha = true;
      if (type === "IDAT") compressed.push(data);
      offset = endData + 4;
      if (type === "IEND") {
        end = true;
        assert(offset === bytes.length, "INVALID_IMAGE", "PNG 末尾含多余数据");
        break;
      }
    }
    assert(
      end &&
        width > 0 &&
        height > 0 &&
        width * height <= 16000000 &&
        compressed.length,
      "INVALID_IMAGE",
      "PNG 尺寸或结构无效",
    );
    const channels = (
      { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>
    )[color];
    assert(
      channels &&
        (color === 0
          ? [1, 2, 4, 8, 16]
          : color === 3
            ? [1, 2, 4, 8]
            : [8, 16]
        ).includes(depth) &&
        interlace === 0,
      "UNSUPPORTED_IMAGE",
      "PNG 位深或交错模式暂不支持",
    );
    const rowBytes = Math.ceil((width * channels * depth) / 8),
      expected = (rowBytes + 1) * height;
    const raw = inflateSync(Buffer.concat(compressed), {
      maxOutputLength: Math.min(expected, 128 * 1024 * 1024),
    });
    assert(raw.length === expected, "INVALID_IMAGE", "PNG 像素长度无效");
    for (let i = 0; i < height; i++)
      assert(raw[i * (rowBytes + 1)] <= 4, "INVALID_IMAGE", "PNG 滤波类型无效");
    return {
      format: "png",
      width,
      height,
      alpha,
      pixel_stream_validated: true,
    };
  }
  assert(
    bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217,
    "INVALID_IMAGE",
    "需要完整 PNG 或 JPEG",
  );
  for (let at = 2; at + 4 <= bytes.length;) {
    assert(bytes[at] === 255, "INVALID_IMAGE", "JPEG 标记无效");
    while (bytes[at] === 255) at++;
    const marker = bytes[at++];
    if (marker === 0xda) break;
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      continue;
    const length = bytes.readUInt16BE(at);
    assert(
      length >= 2 && at + length <= bytes.length,
      "INVALID_IMAGE",
      "JPEG 段长度无效",
    );
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      assert(length >= 8, "INVALID_IMAGE", "JPEG SOF 无效");
      return {
        format: "jpeg",
        width: bytes.readUInt16BE(at + 5),
        height: bytes.readUInt16BE(at + 3),
        alpha: false,
        pixel_stream_validated: false,
      };
    }
    at += length;
  }
  throw new CliError("INVALID_IMAGE", "JPEG 缺少尺寸信息");
}
export function validateAsset(file: string, slot: string): any {
  assert(assetSlots.includes(slot), "INVALID_ARGUMENT", "未知素材槽位");
  const s = lstatSync(file);
  assert(
    s.isFile() && !s.isSymbolicLink() && s.size <= 50 * 1024 * 1024,
    "INVALID_ARGUMENT",
    "素材必须为不超过 50 MiB 的普通文件",
  );
  const info = imageInfo(readFileSync(file)),
    issues: string[] = [];
  const size = assetSizes[slot];
  if (size && (info.width !== size[0] || info.height !== size[1]))
    issues.push(`需要 ${size[0]}x${size[1]}`);
  if (
    slot === "libraryLogo" &&
    (!info.alpha ||
      info.format !== "png" ||
      (info.width !== 1280 && info.height !== 720))
  )
    issues.push("Logo 需要透明 PNG，宽 1280 或高 720");
  if (
    slot === "screenshot" &&
    (info.width < 1920 ||
      info.height < 1080 ||
      Math.abs(info.width / info.height - 16 / 9) > 0.02)
  )
    issues.push("截图需要至少 1920x1080，比例 16:9");
  if (slot === "libraryHero" && info.format !== "png")
    issues.push("Hero 需要 PNG");
  if (
    ["communityIcon", "achievementIcon"].includes(slot) &&
    info.format !== "jpeg"
  )
    issues.push("此图标需要 JPEG");
  return {
    file: path.resolve(file),
    slot,
    ...info,
    ok: issues.length === 0,
    issues,
    content_review_required: true,
    checks: ["file structure", "dimensions", "format", "transparency"],
  };
}
export function auditAssets(dir: string, icons = false): any {
  const files = readdirSync(dir).filter((n) => /\.(png|jpe?g)$/i.test(n));
  assert(files.length <= 1000, "INVALID_ARGUMENT", "一次最多检查 1000 张图片");
  const items: any[] = [],
    unrecognized: string[] = [],
    pairs = new Map<string, Set<string>>();
  for (const name of files) {
    const full = path.join(dir, name);
    let slot = icons
      ? "achievementIcon"
      : assetSlots.find((slot) =>
          name
            .toLowerCase()
            .replace(/[_ -]/g, "")
            .startsWith(slot.toLowerCase()),
        );
    if (!slot && /^(?:ss|screenshot)/i.test(name)) slot = "screenshot";
    if (!slot) {
      unrecognized.push(name);
      continue;
    }
    try {
      items.push(validateAsset(full, slot));
    } catch (e: any) {
      items.push({ file: full, slot, ok: false, issues: [e.message] });
    }
    const pair = /^(.*?)_(achieved|unachieved)\./i.exec(name);
    if (pair) {
      const found = pairs.get(pair[1]) ?? new Set<string>();
      found.add(pair[2].toLowerCase());
      pairs.set(pair[1], found);
    }
  }
  const required = [
      "headerCapsule",
      "smallCapsule",
      "mainCapsule",
      "verticalCapsule",
      "libraryCapsule",
      "libraryHero",
      "libraryLogo",
    ],
    missing = icons
      ? []
      : required.filter((slot) => !items.some((i) => i.slot === slot && i.ok));
  const missingPairs = icons
    ? [...pairs].filter(([, states]) => states.size !== 2).map(([name]) => name)
    : [];
  const screenshots = items.filter(
    (i) => i.slot === "screenshot" && i.ok,
  ).length;
  return {
    directory: path.resolve(dir),
    items,
    unrecognized,
    missing_slots: missing,
    missing_pairs: missingPairs,
    screenshots,
    ok:
      items.length > 0 &&
      items.every((i) => i.ok) &&
      !unrecognized.length &&
      !missing.length &&
      !missingPairs.length &&
      (icons || screenshots >= 5),
    content_review_required: true,
  };
}
export async function uploadAsset(
  _c: Client,
  id: string,
  p: any,
): Promise<any> {
  const validation = validateAsset(p.file, p.slot);
  assert(validation.ok, "INVALID_IMAGE", "素材校验未通过");
  const field = (
    {
      headerCapsule: "header_image",
      smallCapsule: "small_capsule",
      mainCapsule: "main_capsule",
      verticalCapsule: "hero_capsule",
      libraryCapsule: "library_capsule",
      libraryHero: "library_hero",
      libraryLogo: "library_logo",
      libraryHeader: "library_header",
      screenshot: "screenshot",
      pageBackground: "page_background",
    } as Record<string, string>
  )[p.slot];
  assert(field, "INVALID_ARGUMENT", "此槽位需要在 Steamworks 对应页面上传");
  const plan = {
    appid: appid(id),
    slot: p.slot,
    validation,
    publishes: false,
    endpoint: "unofficial Partner admin save",
  };
  if (!p.execute) return { dry_run: true, ...plan };
  assert(
    p.cookieFile,
    "AUTH_REQUIRED",
    "需要 --cookie-file 指向 Partner Cookie JSON 导出；不会输出内容",
  );
  const stat = lstatSync(p.cookieFile);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1024 * 1024,
    "CONFIG_ERROR",
    "Cookie 文件无效",
  );
  const data = JSON.parse(readFileSync(p.cookieFile, "utf8")),
    cookies = Array.isArray(data) ? data : data.cookies;
  assert(
    Array.isArray(cookies),
    "CONFIG_ERROR",
    "Cookie JSON 需要数组或 cookies 字段",
  );
  const url = new URL(
    `https://partner.steamgames.com/admin/game/save/${appid(id)}?json=1`,
  );
  const selected = cookies.filter(
    (c: any) =>
      ["sessionid", "steamLoginSecure", "steamLogin"].includes(c.name) &&
      typeof c.value === "string" &&
      !/[;\r\n\0]/.test(c.value) &&
      ["partner.steamgames.com", ".steamgames.com"].includes(c.domain),
  );
  const cookie = cookieHeader(selected, url);
  assert(cookie, "AUTH_REQUIRED", "缺少 Partner 登录 Cookie");
  const form = new FormData();
  form.append(
    field + "|image",
    new File([readFileSync(p.file)], path.basename(p.file)),
  );
  const dispatcher = new EnvHttpProxyAgent();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    if ([301, 302, 303, 307, 308, 401, 403].includes(r.status)) {
      await r.body?.cancel();
      throw new CliError("AUTH_FAILED", "Partner 登录态无效或缺少上传权限");
    }
    assert(
      r.ok,
      "WRITE_UNKNOWN",
      `Partner HTTP ${r.status}；请先检查素材再决定是否重试`,
    );
    const json = (await r.json()) as any;
    assert(
      json.success === 1 || json.success === true,
      "WRITE_UNKNOWN",
      "Partner 没有确认素材保存",
    );
    return { ...plan, accepted: true, verified: false };
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError("WRITE_UNKNOWN", "素材上传结果未知；没有自动重试");
  } finally {
    await dispatcher.close();
  }
}
