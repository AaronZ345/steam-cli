#!/usr/bin/env node
import { Command, Option } from "commander";
import { readFileSync, statSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  assert,
  CliError,
  errorPayload,
  logout,
  number,
  setConfig,
} from "./core.js";
import { Client } from "./http.js";
import { emit } from "./output.js";
import {
  operations,
  run,
  capabilities,
  installSkill,
  showConfig,
} from "./service.js";
import { login, browsers, verify } from "./auth.js";
import { loginQR } from "./network.js";
import { backend } from "./local.js";
import { mcp, serve } from "./integrations.js";

function integer(value: string): number {
  return number(value, "value", 0);
}
function yesno(value: string): boolean {
  assert(
    ["yes", "no", "true", "false"].includes(value),
    "INVALID_ARGUMENT",
    "使用 yes|no",
  );
  return value === "yes" || value === "true";
}
function jsonObject(value: string): Record<string, any> {
  const r = JSON.parse(value);
  assert(
    r && typeof r === "object" && !Array.isArray(r),
    "INVALID_ARGUMENT",
    "需要 JSON object",
  );
  return r;
}
function fileText(p: string): string {
  assert(
    statSync(p).isFile() && statSync(p).size <= 1024 * 1024,
    "INVALID_ARGUMENT",
    "正文文件必须小于 1 MiB",
  );
  return readFileSync(p, "utf8");
}

export function program(): Command {
  const cli = new Command()
    .name("steam-cli")
    .description(
      "Steam 游戏、价格、评测、成就与账号工具；支持 CLI、SDK、MCP、REST 和 Agent Skill",
    )
    .version("0.1.0")
    .option("--json", "稳定 JSON 输出，包括错误")
    .option(
      "--format <format>",
      "table|json|jsonl|csv|tsv|markdown|url",
      "table",
    )
    .option("--output <path>", "输出到新文件，不覆盖已有文件")
    .option("--fields <names>", "表格或 CSV 字段，逗号分隔")
    .option("--cc <country>", "商店国家代码，如 CN、US")
    .option("--lang <language>", "Steam 语言代码，如 schinese、english")
    .option("--timeout <ms>", "HTTP 超时毫秒", integer)
    .option("--rate-ms <ms>", "请求最小间隔毫秒", integer);
  cli.exitOverride().configureOutput({ writeErr: () => {} });
  const output = (value: any) => emit(value, cli.opts());
  const groups = new Map<string, Command>();
  for (const [name, op] of Object.entries(operations)) {
    const parts = name.split("."),
      leaf = parts.pop()!;
    let parent = cli,
      prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}.${part}` : part;
      if (!groups.has(prefix))
        groups.set(
          prefix,
          parent
            .command(part)
            .description(`${part} 操作；使用 --help 查看子命令`),
        );
      parent = groups.get(prefix)!;
    }
    const syntax = op.target
      ? `${leaf} <target>`
      : name === "user"
        ? `${leaf} [target]`
        : leaf;
    const cmd = parent.command(syntax).description(op.description);
    if (
      [
        "search",
        "browse",
        "deals",
        "reviews",
        "news",
        "similar",
        "games",
        "recent",
        "chat.history",
        "inventory",
        "market.search",
        "comment.list",
      ].includes(name)
    )
      cmd.option("--limit <n>", "最多返回条数", integer);
    if (["search", "browse", "market.search", "comment.list"].includes(name))
      cmd.option("--offset <n>", "分页起点", integer);
    if (["review.list", "workshop.browse"].includes(name))
      cmd.option("--page <n>", "页码，从 1 开始", integer);
    if (
      [
        "achievements",
        "stats",
        "games",
        "recent",
        "friends.list",
        "wishlist.list",
        "review.list",
        "review.get",
        "inventory",
        "badges",
        "bans",
        "level",
      ].includes(name)
    )
      cmd.option("--user <user>", "me、SteamID、vanity 或资料地址");
    if (["search", "games", "market.search", "workshop.browse"].includes(name))
      cmd.option("--query <text>", "搜索或筛选名称");
    if (["games", "browse", "workshop.browse"].includes(name))
      cmd.option(
        "--sort <sort>",
        name === "browse"
          ? "Steam StoreQuery sort 枚举整数，默认 0"
          : "排序方式",
      );
    if (["reviews", "inventory"].includes(name))
      cmd.option("--cursor <cursor>", "下一页游标");
    if (name === "browse")
      cmd.option("--tags <ids>", "按标签 ID 筛选，逗号分隔");
    if (name === "search") cmd.argument("[query]", "游戏名称");
    if (name === "price")
      cmd.option("--compare <countries>", "比较多个地区，例如 CN,US,JP");
    if (name === "reviews")
      cmd
        .addOption(
          new Option("--type <type>", "推荐状态").choices([
            "all",
            "positive",
            "negative",
          ]),
        )
        .addOption(
          new Option("--filter <filter>", "评价排序").choices([
            "all",
            "recent",
            "updated",
          ]),
        )
        .option("--language <language>", "评价语言，默认 all")
        .addOption(
          new Option("--purchase-type <type>", "购买来源").choices([
            "all",
            "steam",
            "non_steam_purchase",
          ]),
        )
        .option("--max-pages <n>", "最多翻页数，默认 1", integer);
    if (name === "deals")
      cmd.addOption(
        new Option("--filter <filter>", "商店列表").choices([
          "specials",
          "topsellers",
          "newreleases",
          "comingsoon",
        ]),
      );
    if (name === "history")
      cmd.option("--days <n>", "历史天数，默认 30", integer);
    if (name === "inventory")
      cmd
        .option("--appid <id>", "库存应用，默认 753", integer)
        .option("--context <id>", "库存 context，默认 6");
    if (name === "market.search")
      cmd.option("--appid <id>", "限制游戏", integer);
    if (name === "market.price")
      cmd
        .requiredOption("--name <hash-name>", "市场物品完整 market_hash_name")
        .option("--currency <id>", "Steam 货币编号，默认人民币 23", integer);
    if (name.startsWith("comment."))
      cmd
        .addOption(
          new Option("--type <type>", "评论区类型").choices([
            "Profile",
            "PublishedFile_Public",
            "Recommendation",
          ]),
        )
        .option("--feature <id>", "工坊/评测记录 ID，资料评论为 -1");
    if (name === "comment.create" || name === "chat.send")
      cmd.requiredOption("--text <text>", "正文");
    if (name === "friends.list")
      cmd.option("--client", "通过客户端协议读取好友在线状态");
    if (name === "cloud.download")
      cmd
        .requiredOption("--name <name>", "完整云存档文件名")
        .requiredOption("--out <path>", "本地目标文件");
    if (name === "playtime.idle")
      cmd.requiredOption(
        "--minutes <n>",
        "挂机上限 1–1440 分钟；target 可为逗号分隔 appid",
        integer,
      );
    if (name === "doctor")
      cmd
        .option("--network", "实测公开商店连接")
        .option("--verify-login", "联网核验登录态");
    if (name === "review.edit" || name === "review.create")
      cmd
        .addOption(
          new Option("--text <text>", "评测原文，保留 BBCode").conflicts(
            "file",
          ),
        )
        .addOption(
          new Option("--file <path>", "从 UTF-8 文件读取正文").conflicts(
            "text",
          ),
        )
        .option("--recommend <yes|no>", "推荐或不推荐", yesno)
        .option("--public <yes|no>", "是否公开", yesno)
        .option("--comments <yes|no>", "允许评论", yesno)
        .option("--language <language>", "评测语言")
        .option("--received-free <yes|no>", "免费获得/报酬披露", yesno);
    if (name === "review.vote")
      cmd
        .option("--up <yes|no>", "是否有帮助，默认 yes", yesno)
        .option("--funny", "标记有趣");
    if (op.write)
      cmd
        .addOption(
          new Option("--execute", "实际提交或执行；默认仅预览").conflicts(
            "dryRun",
          ),
        )
        .addOption(
          new Option("--dry-run", "预览，不提交").conflicts("execute"),
        );
    cmd.action(async (...args: any[]) => {
      const command = args.at(-1) as Command,
        opts = command.opts();
      const p: any = { ...opts };
      if (op.target || name === "user") p.target = args[0];
      if (name === "search" && args[0]) p.query = args[0];
      if (name === "review.edit" || name === "review.create")
        p.changes = Object.fromEntries(
          Object.entries({
            text: opts.file ? fileText(opts.file) : opts.text,
            recommend: opts.recommend,
            public: opts.public,
            comments: opts.comments,
            language: opts.language,
            receivedFree: opts.receivedFree,
          }).filter(([, v]) => v !== undefined),
        );
      output(await run(name, p, cli.opts()));
    });
  }
  cli
    .command("capabilities")
    .description("全部操作与后端覆盖状态")
    .action(() => output(capabilities()));
  cli
    .command("browsers")
    .description("浏览器 Cookie 读取能力与安装路径")
    .action(() => output(browsers()));
  cli
    .command("login")
    .description("读取本机浏览器 Cookie 或 Steam 手机扫码登录")
    .addOption(
      new Option(
        "--browser <name>",
        "chrome|edge|chromium|brave|vivaldi|opera|arc|firefox|safari",
      ).conflicts(["qr", "cookieFile", "cookieStdin"]),
    )
    .option(
      "--profile <name-or-path>",
      "浏览器资料名称、目录或 Cookie 数据库路径",
    )
    .addOption(
      new Option("--qr", "Steam 手机扫码，支持客户端功能").conflicts([
        "browser",
        "cookieFile",
        "cookieStdin",
      ]),
    )
    .addOption(
      new Option(
        "--cookie-file <path>",
        "JSON、Netscape 或请求头文件",
      ).conflicts(["browser", "qr", "cookieStdin"]),
    )
    .addOption(
      new Option(
        "--cookie-stdin",
        "从管道读取 Cookie，不放进命令行参数",
      ).conflicts(["browser", "qr", "cookieFile"]),
    )
    .option("--qr-timeout <seconds>", "扫码时限，默认 120 秒", integer)
    .action(async (opts) =>
      output(await (opts.qr ? loginQR(opts.qrTimeout) : login(opts))),
    );
  cli
    .command("logout")
    .description("清除本工具的本地登录缓存")
    .action(() => output(logout()));
  groups
    .get("auth")!
    .command("verify")
    .description("联网核验已保存网页登录态")
    .action(async () => {
      const c = new Client();
      try {
        output(await verify(c.requireAuth()));
      } finally {
        await c.close();
      }
    });
  const conf = cli.command("config").description("本工具的配置");
  conf.command("show").action(() => output(showConfig()));
  conf
    .command("set <name> <value>")
    .description(
      "country|language|steam_path|steamcmd_path|steamctl_path|aurelia_path",
    )
    .action((name, value) => output(setConfig(name, value)));
  cli
    .command("request <method> <url>")
    .description("Steam 官方 HTTP 接口；写入需 --execute")
    .option("--params <json>", "URL 参数 JSON object")
    .option("--data-file <path>", "表单字段 JSON 文件")
    .option("--auth", "按域名携带已保存 Cookie")
    .option("--text", "返回文本")
    .option("--execute", "允许非 GET/HEAD 请求")
    .action(async (method, url, opts) => {
      method = method.toUpperCase();
      assert(
        ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method),
        "INVALID_ARGUMENT",
        "不支持的 HTTP method",
      );
      assert(
        ["GET", "HEAD"].includes(method) || opts.execute,
        "INVALID_ARGUMENT",
        "原始写入需要 --execute",
      );
      const c = new Client();
      try {
        output(
          await c.request(url, {
            method,
            params: opts.params ? jsonObject(opts.params) : undefined,
            form: opts.dataFile
              ? jsonObject(fileText(opts.dataFile))
              : undefined,
            auth: opts.auth,
            text: opts.text,
          }),
        );
      } finally {
        await c.close();
      }
    });
  cli
    .command("api <interface> <method>")
    .description("Steam Web API GET 入口")
    .option("--params <json>", "参数 JSON object")
    .option("--api-version <version>", "版本，例如 v1", "v1")
    .option("--auth", "使用 STEAM_WEB_API_KEY 或 Web token")
    .action(async (iface, method, opts) => {
      assert(
        /^I[A-Za-z0-9]+$/.test(iface) &&
          /^[A-Za-z0-9]+$/.test(method) &&
          /^v\d+$/.test(opts.apiVersion),
        "INVALID_ARGUMENT",
        "API 标识无效",
      );
      const c = new Client();
      try {
        output(
          await c.api(
            iface,
            method,
            opts.params ? jsonObject(opts.params) : {},
            opts.auth,
            opts.apiVersion,
          ),
        );
      } finally {
        await c.close();
      }
    });
  cli
    .command("backend <name> [args...]")
    .description("运行 steamcmd|steamctl|aurelia；-- 后原样传参，默认预览")
    .allowUnknownOption()
    .option("--execute", "实际运行后端")
    .action(async (name, args, opts) =>
      output(await backend(name, args, opts.execute)),
    );
  const skill = cli.command("skill").description("Agent Skill");
  skill
    .command("install")
    .description("安装至当前 Codex home 的 skills/steam-cli")
    .action(() => output(installSkill()));
  cli
    .command("mcp")
    .description("MCP 服务，默认 stdio")
    .option("--transport <transport>", "stdio|streamable-http", "stdio")
    .option("--port <port>", "HTTP 端口，默认 7732", integer)
    .action((opts) => mcp(opts.transport, opts.port));
  cli
    .command("serve")
    .description("本机 REST API，默认 127.0.0.1:7731")
    .option("--port <port>", "本机端口", integer)
    .action((opts) => serve(opts.port));
  return cli;
}
export async function main(argv = process.argv): Promise<void> {
  try {
    await program().parseAsync(argv);
  } catch (e: any) {
    if (e.code === "commander.helpDisplayed" || e.code === "commander.version")
      return;
    const error = e.code?.startsWith("commander.")
      ? new CliError("INVALID_ARGUMENT", e.message)
      : e;
    if (
      argv.includes("--json") ||
      argv.some((v, i) => v === "--format" && argv[i + 1] === "json")
    )
      process.stdout.write(JSON.stringify(errorPayload(error)) + "\n");
    else
      process.stderr.write((errorPayload(error) as any).error.message + "\n");
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
)
  await main();
