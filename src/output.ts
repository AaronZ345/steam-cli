import { writeFileSync } from "node:fs";
import path from "node:path";
import { assert, redact } from "./core.js";

export interface OutputOptions {
  json?: boolean;
  format?: string;
  output?: string;
  fields?: string;
}
function cell(value: any): string {
  return value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
export function format(data: any, opts: OutputOptions): string {
  const value = redact(data),
    mode = opts.json ? "json" : opts.format || "table";
  assert(
    ["json", "jsonl", "csv", "tsv", "table", "markdown", "url"].includes(mode),
    "INVALID_ARGUMENT",
    "format 支持 json|jsonl|csv|tsv|table|markdown|url",
  );
  if (mode === "json")
    return JSON.stringify({ ok: true, data: value }, null, 2) + "\n";
  let rows = Array.isArray(value)
    ? value
    : value?.items || value?.assets || value?.operations;
  if (!Array.isArray(rows)) rows = [value];
  rows = rows.map((row: any) =>
    typeof row === "object" && row !== null ? row : { value: row },
  );
  if (mode === "jsonl")
    return (
      rows.map((row: any) => JSON.stringify(row)).join("\n") +
      (rows.length ? "\n" : "")
    );
  if (mode === "url")
    return (
      rows
        .map((row: any) => row.url || "")
        .filter(Boolean)
        .join("\n") + "\n"
    );
  const keys = opts.fields
    ? opts.fields.split(",").map((s) => s.trim())
    : [...new Set<string>(rows.flatMap((row: any) => Object.keys(row)))];
  if (mode === "csv" || mode === "tsv") {
    const sep = mode === "csv" ? "," : "\t";
    const quote = (v: any) => {
      const text = cell(v);
      return new RegExp(`["\\r\\n${sep}]`).test(text)
        ? `"${text.replaceAll('"', '""')}"`
        : text;
    };
    return (
      [
        keys.map(quote).join(sep),
        ...rows.map((row: any) => keys.map((k) => quote(row[k])).join(sep)),
      ].join("\n") + "\n"
    );
  }
  if (mode === "markdown") {
    const escape = (v: any) =>
      cell(v)
        .replaceAll("|", "\\|")
        .replace(/[\r\n]+/g, "<br>");
    return (
      [
        "| " + keys.join(" | ") + " |",
        "| " + keys.map(() => "---").join(" | ") + " |",
        ...rows.map(
          (row: any) =>
            "| " + keys.map((k) => escape(row[k])).join(" | ") + " |",
        ),
      ].join("\n") + "\n"
    );
  }
  if (!rows.length) return "没有结果。\n";
  const selected = opts.fields
    ? keys
    : keys
        .filter((k) =>
          rows.some((r: any) => r[k] !== null && typeof r[k] !== "object"),
        )
        .slice(0, 10);
  if (!selected.length || (rows.length === 1 && !value.items))
    return JSON.stringify(value, null, 2) + "\n";
  const texts: string[][] = [
    selected,
    ...rows.map((row: any) =>
      selected.map((k) =>
        cell(row[k])
          .replace(/[\r\n\t]+/g, " ")
          .slice(0, 160),
      ),
    ),
  ];
  const widths = selected.map((_, i) =>
    Math.min(55, Math.max(...texts.map((row) => row[i]?.length || 0))),
  );
  return (
    texts
      .map((row) =>
        row
          .map((s, i) => s.slice(0, widths[i]).padEnd(widths[i]))
          .join("  ")
          .trimEnd(),
      )
      .join("\n") +
    "\n" +
    (value.complete === false ? "结果未完整读取；请检查分页字段。\n" : "")
  );
}
export function emit(data: any, opts: OutputOptions = {}): void {
  const text = format(data, opts);
  if (opts.output) {
    const target = path.resolve(opts.output);
    writeFileSync(target, text, { flag: "wx", mode: 0o600 });
    process.stdout.write(
      opts.json
        ? JSON.stringify({
            ok: true,
            data: { path: target, bytes: Buffer.byteLength(text) },
          }) + "\n"
        : `已写入 ${target}\n`,
    );
  } else process.stdout.write(text);
}
