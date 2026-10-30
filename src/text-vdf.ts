import { assert } from "./core.js";

// Config writes must round-trip escaped quotes and backslashes. Preserve key case
// and unknown fields; reject ambiguous duplicate keys instead of dropping data.
export function parse(text: string): Record<string, any> {
  assert(
    Buffer.byteLength(text) <= 32 * 1024 * 1024,
    "PARSE_ERROR",
    "文本 VDF 超过 32 MiB",
  );
  let pos = 0;
  const space = () => {
    for (;;) {
      while (/\s/.test(text[pos] ?? "") && pos < text.length) pos++;
      if (text.slice(pos, pos + 2) !== "//") break;
      const end = text.indexOf("\n", pos);
      pos = end < 0 ? text.length : end + 1;
    }
  };
  const token = (): string => {
    space();
    assert(pos < text.length, "PARSE_ERROR", "VDF 意外结束");
    if (text[pos] === '"') {
      pos++;
      let out = "";
      while (pos < text.length) {
        const ch = text[pos++];
        if (ch === '"') return out;
        if (ch === "\\") {
          assert(pos < text.length, "PARSE_ERROR", "VDF 转义被截断");
          const next = text[pos++];
          out +=
            (
              { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"' } as Record<
                string,
                string
              >
            )[next] ?? "\\" + next;
        } else out += ch;
      }
      assert(false, "PARSE_ERROR", "VDF 字符串未闭合");
    }
    const start = pos;
    while (pos < text.length && !/[\s{}\[\]"]/.test(text[pos])) pos++;
    assert(pos > start, "PARSE_ERROR", "不支持的 VDF 条件或语法");
    return text.slice(start, pos);
  };
  const object = (depth: number): Record<string, any> => {
    assert(depth <= 64, "PARSE_ERROR", "VDF 嵌套超过上限");
    const out = Object.create(null);
    for (;;) {
      space();
      if (pos === text.length) {
        assert(depth === 0, "PARSE_ERROR", "VDF 缺少右括号");
        return out;
      }
      if (text[pos] === "}") {
        assert(depth > 0, "PARSE_ERROR", "VDF 多余右括号");
        pos++;
        return out;
      }
      const key = token();
      assert(!Object.hasOwn(out, key), "PARSE_ERROR", "VDF 存在重复键");
      space();
      if (text[pos] === "{") {
        pos++;
        out[key] = object(depth + 1);
      } else out[key] = token();
    }
  };
  return object(0);
}
export function stringify(obj: Record<string, any>): string {
  const quote = (s: string) =>
    '"' +
    s
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\r", "\\r")
      .replaceAll("\n", "\\n")
      .replaceAll("\t", "\\t") +
    '"';
  const rows = (node: Record<string, any>, depth: number): string => {
    assert(depth <= 64, "INVALID_ARGUMENT", "VDF 嵌套超过上限");
    const indent = "\t".repeat(depth);
    return Object.entries(node)
      .map(([key, value]) => {
        assert(
          !key.includes("\0") &&
            value !== null &&
            value !== undefined &&
            !Array.isArray(value),
          "INVALID_ARGUMENT",
          "VDF 字段无效",
        );
        if (typeof value === "object")
          return `${indent}${quote(key)}\n${indent}{\n${rows(value, depth + 1)}${indent}}\n`;
        assert(
          ["string", "number", "boolean"].includes(typeof value) &&
            !String(value).includes("\0"),
          "INVALID_ARGUMENT",
          "VDF 值无效",
        );
        return `${indent}${quote(key)}\t${quote(String(value))}\n`;
      })
      .join("");
  };
  return rows(obj, 0);
}
export default { parse, stringify };
