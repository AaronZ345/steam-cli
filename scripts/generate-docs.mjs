import { writeFileSync, readFileSync } from "node:fs";
import { operations } from "../dist/service.js";
const lines = [
  "# 命令参考",
  "",
  "通用参数：`--json`、`--format table|json|jsonl|csv|tsv|markdown|url`、`--output PATH`、`--fields a,b`、`--cc CN`、`--lang schinese`、`--timeout MS`、`--rate-ms MS`。",
  "",
  "写命令默认预览；`--execute` 实际执行，`--dry-run` 明确预览，两者不能同时使用。`--help` 列出每个命令的具体参数。",
  "",
  "| 命令 | 目标 | 类型 | 用途 |",
  "| --- | --- | --- | --- |",
  ...Object.entries(operations).map(
    ([name, op]) =>
      `| \`steam-cli ${name.replaceAll(".", " ")}\` | ${op.target || "可选参数"} | ${op.write ? "写入，默认预览" : "读取"} | ${op.description} |`,
  ),
  "",
  "## 登录与工具",
  "",
  "登录：`login --steam-client [--steam-path ROOT] [--profile PROFILE]`、`login --browser NAME [--profile PROFILE]`、`login --cookie-file PATH`、`login --cookie-stdin`、`login --qr`。另有 `logout`、`browsers`、`auth verify`。",
  "",
  "配置：`config show`、`config set KEY VALUE`。允许 country、language、steam_path、steamcmd_path、steamctl_path、aurelia_path。修改配置的命令会返回文件路径与修改项。",
  "",
  "接口：`api INTERFACE METHOD --params JSON`、`request METHOD URL --params JSON`。原始写入须 `--execute`。",
  "",
  "后端：`backend steamcmd|steamctl|aurelia [--execute] -- ARGS`。`--` 后是后端参数，全局选项应放在前面。",
  "",
  "接入：`mcp`、`mcp --transport streamable-http --port 7732`、`serve --port 7731`、`skill install`。",
  "",
  "## 分页与筛选",
  "",
  "- `search QUERY --limit N --offset N`：名称搜索最多前 100 项。",
  "- `games --query TEXT --sort playtime|name --limit N`：游戏库筛选。",
  "- `reviews APPID --type all|positive|negative --filter all|recent|updated --language all --limit N --max-pages N --cursor CURSOR`：评价游标分页。默认最多一页；后备社区来源不支持 purchase-type 过滤。",
  "- `inventory --appid ID --context ID --limit N --cursor CURSOR`：库存游标。",
  "- `review list --page N`、`workshop browse APPID --page N`：页码。",
  "- `market search --query TEXT --appid ID --limit N --offset N`：市场搜索。",
  "",
  "## 错误",
  "",
  "`AUTH_REQUIRED` 缺少认证；`AUTH_FAILED` 认证失败；`ACCESS_DENIED` 权限或可见性限制；`NOT_FOUND` 目标不存在；`RATE_LIMITED` 限流；`PARSE_ERROR` 返回格式变化；`PAGINATION_ERROR` 分页异常；`WRITE_UNKNOWN` 写入结果未知；`DEPENDENCY_MISSING` 缺少外部后端。",
  "",
  "失败退出码为 1。JSON 错误写 stdout，普通错误写 stderr。没有结果只在能确认查询成功时返回空集合。",
  "",
];
writeFileSync(new URL("../docs/cli.md", import.meta.url), lines.join("\n"));
const parity = JSON.parse(
  readFileSync(new URL("../docs/parity.json", import.meta.url), "utf8"),
);
const sources = [...new Set(parity.entries.map((e) => e.source))];
const output = [
  "# MCP 逐项对照",
  "",
  `盘点日期：${parity.audited_at}。功能映射不等于字段完全等价或真实写入验收通过；参见 [验证记录](validation.md)。`,
  "",
  ...sources.map((source) => {
    const entries = parity.entries.filter((e) => e.source === source);
    return `- [${source}](https://github.com/${source}/tree/${entries[0].revision})：${entries.length} 项，源码版本 \`${entries[0].revision}\`。`;
  }),
  "",
  "native 为直接实现入口，partial 有差异，client-dispatch 交给 Steam 客户端，guide 只输出集成步骤。后端转发没有归入 native。",
  "",
  "| 来源功能点 | 对应操作 | 类型 | 边界 |",
  "| --- | --- | --- | --- |",
  ...parity.entries.map(
    (e) =>
      `| ${e.source} / ${e.action} | \`${e.operation}\` | ${e.status} | ${e.note.replaceAll("|", "／")} |`,
  ),
  "",
];
writeFileSync(new URL("../docs/parity.md", import.meta.url), output.join("\n"));
