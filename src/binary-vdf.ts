import { assert } from "./core.js";
export interface Atom {
  type: number;
  value: string | number | bigint | Buffer;
}
export interface Dictionary {
  [key: string]: Atom | Dictionary;
}
export const atom = (value: string | number): Atom => ({
  type: typeof value === "string" ? 1 : 2,
  value,
});
export function value(node: unknown): any {
  return node && typeof (node as Atom).type === "number"
    ? (node as Atom).value
    : undefined;
}
export function dictionary(node: unknown): Dictionary {
  return node && typeof (node as Atom).type !== "number"
    ? (node as Dictionary)
    : Object.create(null);
}
export function decodeBinary(buffer: Buffer): Dictionary {
  assert(buffer.length <= 32 * 1024 * 1024, "PARSE_ERROR", "二进制 VDF 过大");
  let offset = 0;
  const need = (n: number) =>
    assert(offset + n <= buffer.length, "PARSE_ERROR", "二进制 VDF 被截断");
  const text = (wide = false): string => {
    const start = offset,
      step = wide ? 2 : 1;
    for (;;) {
      need(step);
      if (wide ? buffer.readUInt16LE(offset) === 0 : buffer[offset] === 0) {
        const s = buffer.toString(wide ? "utf16le" : "utf8", start, offset);
        offset += step;
        return s;
      }
      offset += step;
    }
  };
  const object = (depth: number): Dictionary => {
    assert(depth <= 64, "PARSE_ERROR", "VDF 嵌套过深");
    const result: Dictionary = Object.create(null);
    while (offset < buffer.length) {
      need(1);
      const type = buffer[offset++];
      if (type === 8) return result;
      const key = text();
      assert(
        !Object.hasOwn(result, key),
        "PARSE_ERROR",
        "二进制 VDF 存在重复键",
      );
      if (type === 0) {
        result[key] = object(depth + 1);
        continue;
      }
      let item: string | number | bigint | Buffer;
      if (type === 1) item = text();
      else if (type === 5) item = text(true);
      else if ([2, 3, 4, 6].includes(type)) {
        need(4);
        item =
          type === 3
            ? buffer.readFloatLE(offset)
            : type === 6
              ? Buffer.from(buffer.subarray(offset, offset + 4))
              : buffer.readUInt32LE(offset);
        offset += 4;
      } else if (type === 7 || type === 10) {
        need(8);
        item =
          type === 7
            ? buffer.readBigUInt64LE(offset)
            : buffer.readBigInt64LE(offset);
        offset += 8;
      } else {
        assert(false, "PARSE_ERROR", `不支持的 VDF 类型 ${type}`);
      }
      result[key] = { type, value: item! };
    }
    assert(depth === 0, "PARSE_ERROR", "二进制 VDF 缺少结束标记");
    return result;
  };
  const root = object(0);
  assert(
    offset === buffer.length || buffer.subarray(offset).every((b) => b === 8),
    "PARSE_ERROR",
    "VDF 尾部数据无效",
  );
  return root;
}
export function encodeBinary(root: Dictionary): Buffer {
  const chunks: Buffer[] = [];
  const text = (s: string, wide = false) => {
    assert(!s.includes("\0"), "INVALID_ARGUMENT", "VDF 字符串含 NUL");
    chunks.push(
      Buffer.from(s, wide ? "utf16le" : "utf8"),
      Buffer.alloc(wide ? 2 : 1),
    );
  };
  const object = (obj: Dictionary, depth: number) => {
    assert(depth <= 64, "INVALID_ARGUMENT", "VDF 嵌套过深");
    for (const [k, node] of Object.entries(obj)) {
      const scalar = typeof (node as Atom).type === "number",
        a = node as Atom;
      chunks.push(Buffer.from([scalar ? a.type : 0]));
      text(k);
      if (!scalar) {
        object(node as Dictionary, depth + 1);
        continue;
      }
      if (a.type === 1 || a.type === 5) {
        text(String(a.value), a.type === 5);
        continue;
      }
      const b = Buffer.alloc(a.type === 7 || a.type === 10 ? 8 : 4);
      if (a.type === 2 || a.type === 4) b.writeUInt32LE(Number(a.value) >>> 0);
      else if (a.type === 3) b.writeFloatLE(Number(a.value));
      else if (a.type === 6) {
        assert(
          Buffer.isBuffer(a.value) && a.value.length === 4,
          "INVALID_ARGUMENT",
          "无效 VDF 颜色",
        );
        a.value.copy(b);
      } else if (a.type === 7) b.writeBigUInt64LE(BigInt(a.value as bigint));
      else if (a.type === 10) b.writeBigInt64LE(BigInt(a.value as bigint));
      else assert(false, "INVALID_ARGUMENT", `无效 VDF 类型 ${a.type}`);
      chunks.push(b);
    }
    chunks.push(Buffer.from([8]));
  };
  object(root, 0);
  return Buffer.concat(chunks);
}
