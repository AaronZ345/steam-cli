import type { Operation } from "./service.js";
import { arg } from "./arguments.js";
import { appid } from "./core.js";
import { reference, convertId, readResource, crawl } from "./graph.js";
import { Insights } from "./insights.js";
import { SteamQueries } from "./web-extra.js";
import { LocalData } from "./local-data.js";
import { Compatibility, wiki, howLong, protonRating } from "./compatibility.js";

const user = arg("user", "me、SteamID64、vanity 或资料地址");
const limit = arg("limit", "最多处理条数", "integer", { min: 1, max: 100000 });
const query = arg("query", "名称或缩写");
const root = arg("root", "Steam 根目录；默认自动检测");
const account = arg("account", "userdata 的账号 ID 或 SteamID64");
const local = (p: Record<string, any>) => new LocalData(p.root, p.account);
export const featureOperations: Record<string, Operation> = {
  "workshop.query": {
    description: "按标签、排序和游标查询工坊，需要 Web API Key",
    target: "appid",
    options: [
      query,
      arg("sort", "排序", "string", {
        choices: [
          "vote",
          "date",
          "trend",
          "subscriptions",
          "text",
          "playtime",
          "updated",
        ],
      }),
      arg("limit", "每页最多 100 条", "integer", { min: 1, max: 100 }),
      arg("cursor", "分页游标，首次 *"),
      arg("days", "趋势天数", "integer", { min: 1, max: 7 }),
      arg("requiredTags", "必需标签 JSON 数组", "json"),
      arg("excludedTags", "排除标签 JSON 数组", "json"),
      arg("matchAll", "要求匹配全部标签", "boolean"),
      arg("previews", "返回预览媒体", "boolean"),
    ],
    run: (p, c) => new SteamQueries(c).workshop(p.target, p),
  },
  "local.accounts": {
    description: "列出本机 Steam userdata 账号目录",
    offline: true,
    options: [root],
    run: (p) => local(p).accounts(),
  },
  "local.games": {
    description: "按名称、大小、分页读取本地安装记录",
    offline: true,
    options: [
      root,
      query,
      limit,
      arg("offset", "分页起点", "integer"),
      arg("sort", "排序字段", "string", { choices: ["name", "size"] }),
    ],
    run: (p) => local(p).installed(p),
  },
  "local.game": {
    description: "本地游戏安装、构建和下载清单详情",
    offline: true,
    target: "appid",
    options: [root],
    run: (p) => {
      const game = { ...local(p).game(p.target) };
      delete game.raw;
      return game;
    },
  },
  "local.status": {
    description: "Steam 进程状态和下载队列快照",
    offline: true,
    options: [root],
    run: (p) => local(p).status(),
  },
  "local.progress": {
    description: "指定游戏的下载字节数和进度",
    offline: true,
    target: "appid",
    options: [root],
    run: (p) => local(p).status(p.target),
  },
  "local.disk-report": {
    description: "安装、兼容前缀、着色器与工坊占用明细",
    offline: true,
    options: [root, arg("appid", "只检查指定游戏")],
    run: (p) => local(p).diskReport(p.appid),
  },
  "local.orphans": {
    description: "查找未安装游戏遗留的缓存与兼容数据",
    offline: true,
    options: [root],
    run: (p) => {
      const r = local(p).diskReport();
      return { ...r, items: r.items.filter((g: any) => g.orphaned) };
    },
  },
  "local.cleanup-plan": {
    description: "清理建议及可释放缓存大小，标明潜在存档",
    offline: true,
    options: [root],
    run: (p) => local(p).cleanup(),
  },
  "local.saves": {
    description: "列出本地 Steam Cloud 存档及占用",
    offline: true,
    options: [root, account, arg("appid", "只检查指定游戏")],
    run: (p) => local(p).saves(p.appid),
  },
  "local.saves-backup": {
    description: "备份本地云存档至新目录并核对",
    offline: true,
    write: true,
    options: [
      root,
      account,
      arg("appid", "只备份指定游戏"),
      arg("out", "新的备份目录", "string", { required: true }),
    ],
    run: (p) => local(p).backup(p.out, p.appid, p.execute),
  },
  "local.launch-options": {
    description: "读取指定游戏启动参数",
    offline: true,
    target: "appid",
    options: [root, account],
    run: (p) => local(p).launchOptions(p.target),
  },
  "local.set-launch-options": {
    description: "备份并修改启动参数，要求客户端退出",
    offline: true,
    write: true,
    target: "appid",
    options: [
      root,
      account,
      arg("options", "新的完整启动参数", "string", { required: true }),
    ],
    run: (p) => local(p).launchOptions(p.target, p.options, p.execute),
  },
  "local.settings": {
    description: "读取允许公开的客户端设置项",
    offline: true,
    options: [root, account],
    run: (p) => local(p).settings(),
  },
  "shortcuts.list": {
    description: "读取本机非 Steam 游戏快捷方式",
    offline: true,
    options: [root, account],
    run: (p) => local(p).shortcutList(),
  },
  "shortcuts.add": {
    description: "保留未知 VDF 字段、备份后添加非 Steam 快捷方式",
    offline: true,
    write: true,
    options: [
      root,
      account,
      arg("name", "游戏名称", "string", { required: true }),
      arg("exe", "程序路径", "string", { required: true }),
      arg("startDir", "工作目录"),
      arg("launchOptions", "启动参数"),
    ],
    run: (p) =>
      local(p).shortcutAdd(
        p.name,
        p.exe,
        p.startDir,
        p.launchOptions,
        p.execute,
      ),
  },
  "shortcuts.remove": {
    description: "按 appid 删除一个本机快捷方式并保留备份",
    offline: true,
    write: true,
    target: "shortcut-appid",
    options: [root, account],
    run: (p) => local(p).shortcutRemove(p.target, p.execute),
  },
  "workshop.installed": {
    description: "读取已安装工坊内容、清单版本和大小",
    offline: true,
    options: [root, arg("appid", "只检查指定游戏")],
    run: (p) => local(p).workshop(p.appid),
  },
  "proton.versions": {
    description: "本地 Proton/Steam Linux Runtime 及游戏映射",
    offline: true,
    options: [root],
    run: (p) => new Compatibility(local(p)).versions(),
  },
  "proton.info": {
    description: "游戏兼容工具、前缀大小和 Windows 注册表版本",
    offline: true,
    target: "appid",
    options: [root],
    run: (p) => new Compatibility(local(p)).info(p.target),
  },
  "proton.games": {
    description: "列出使用兼容前缀或兼容工具的已装游戏",
    offline: true,
    options: [root],
    run: (p) => new Compatibility(local(p)).games(),
  },
  "proton.rating": {
    description: "读取 ProtonDB 社区兼容评分",
    offline: true,
    target: "appid",
    options: [root],
    run: (p) => protonRating(p.target),
  },
  "proton.recommend": {
    description: "根据本机运行时和社区评分列出兼容工具候选",
    offline: true,
    target: "appid",
    options: [root],
    run: (p) => new Compatibility(local(p)).recommend(p.target),
  },
  "diagnostics.logs": {
    description: "读取指定类型 Steam 日志尾部并脱敏",
    offline: true,
    options: [
      root,
      limit,
      arg("type", "日志种类", "string", {
        required: true,
        choices: ["content", "connection", "shader", "process", "compat"],
      }),
    ],
    run: (p) => local(p).logs(p.type, p.limit),
  },
  "game.wiki": {
    description: "读取 PCGamingWiki 游戏修复条目与章节",
    target: "appid",
    run: (p) => wiki(p.target),
  },
  "game.hltb": {
    description: "按游戏名查 HowLongToBeat 通关时长",
    options: [{ ...query, required: true }],
    run: (p) => howLong(p.query),
  },
  "ref.id": {
    description: "离线解析 Steam URL 和 steam:// 资源 URI",
    target: "reference",
    offline: true,
    run: (p) => reference(p.target),
  },
  "ref.steamid": {
    description: "离线转换 SteamID2/3/64",
    target: "steamid",
    offline: true,
    run: (p) => convertId(p.target),
  },
  "resource.read": {
    description: "通过 Steam URL 或资源 URI 读取对象",
    target: "reference",
    run: (p, c) => readResource(p.target, c),
  },
  crawl: {
    description: "有界遍历游戏、DLC、Demo、套餐和工坊合集关系",
    target: "reference",
    options: [
      limit,
      arg("depth", "关系深度 0–4", "integer", { min: 0, max: 4 }),
    ],
    run: (p, c) => crawl(p.target, c, p),
  },
  "library.stats": {
    description: "完整游戏库数量、已玩/未玩、总时长汇总",
    options: [user],
    run: (p, c) => new Insights(c).stats(p.user),
  },
  "library.search": {
    description: "在个人游戏库按名称或缩写搜索",
    options: [user, limit, { ...query, required: true }],
    run: (p, c) => new Insights(c).search(p.query, p.user, p.limit),
  },
  "library.unplayed": {
    description: "读取个人游戏库未游玩游戏",
    options: [user, limit, query],
    run: (p, c) => new Insights(c).backlog(p.user, p.limit, p.query),
  },
  "library.random": {
    description: "随机选择个人游戏库中的一款游戏",
    options: [user, arg("unplayed", "仅从未玩游戏中选择", "boolean")],
    run: (p, c) => new Insights(c).random(p.user, p.unplayed),
  },
  "library.compare": {
    description: "比较多款游戏的价格、平台、配置和类别",
    target: "comma-separated-appids",
    run: (p, c) => new Insights(c).compare(p.target),
  },
  "library.value": {
    description: "按地区现价估算库中游戏价格，按币种分别求和",
    options: [user, limit],
    run: (p, c) => new Insights(c).value(p.user, p.limit),
  },
  "insights.completion": {
    description: "按游戏汇总个人成就完成度",
    options: [user, limit],
    run: (p, c) => new Insights(c).completion(p.user, p.limit),
  },
  "insights.perfect": {
    description: "查找成就全部完成的游戏",
    options: [user, limit],
    run: (p, c) => new Insights(c).completion(p.user, p.limit, true),
  },
  "insights.timeline": {
    description: "按最近游玩月份分组，不将终身时长误作月度时长",
    options: [
      user,
      arg("year", "只显示指定年份", "integer", { min: 1970, max: 2100 }),
    ],
    run: (p, c) => new Insights(c).timeline(p.user, p.year),
  },
  "insights.year": {
    description: "指定年份最近游玩游戏的统计快照",
    options: [
      user,
      arg("year", "年份", "integer", { required: true, min: 1970, max: 2100 }),
    ],
    run: (p, c) => new Insights(c).timeline(p.user, p.year),
  },
  "insights.history": {
    description: "已安装与已卸载游戏的完整终身时长记录",
    options: [user, limit],
    run: (p, c) => new Insights(c).history(p.user, p.limit),
  },
  "wishlist.details": {
    description: "愿望单附带当前价格和折扣",
    options: [user, limit],
    run: (p, c) => new Insights(c).wishlist(p.user, p.limit),
  },
  "wishlist.deals": {
    description: "筛选愿望单中正在打折的游戏",
    options: [user, limit],
    run: (p, c) => new Insights(c).wishlist(p.user, p.limit, true),
  },
  "player.summary": {
    description: "批量玩家资料、在线状态及当前游戏，需要 Web API Key",
    target: "comma-separated-users",
    run: (p, c) => new SteamQueries(c).summary(p.target),
  },
  "player.groups": {
    description: "玩家群组",
    options: [user],
    run: (p, c) => new SteamQueries(c).groups(p.user),
  },
  "player.badge-progress": {
    description: "社区徽章任务进度",
    options: [user, arg("badge", "徽章 ID", "integer")],
    run: (p, c) => new SteamQueries(c).badge(p.user, p.badge),
  },
  "player.shared-game": {
    description: "检查玩家当前游戏是否通过家庭共享",
    target: "appid",
    options: [user],
    run: (p, c) => new SteamQueries(c).sharing(p.target, p.user),
  },
  "game.schema": {
    description: "游戏成就与统计定义",
    target: "appid",
    run: (p, c) => new SteamQueries(c).schema(p.target),
  },
  "game.global-stats": {
    description: "游戏全局累计统计，需要 Web API Key",
    target: "appid",
    options: [
      arg("names", "统计 API 名称，逗号分隔", "string", { required: true }),
      arg("start", "开始日期 Unix 秒", "integer"),
      arg("end", "结束日期 Unix 秒", "integer"),
    ],
    run: (p, c) =>
      new SteamQueries(c).globalStats(p.target, p.names, p.start, p.end),
  },
  "game.update-check": {
    description: "检查指定游戏版本是否为最新",
    target: "appid",
    options: [arg("build", "游戏版本整数", "string", { required: true })],
    run: (p, c) => new SteamQueries(c).update(p.target, p.build),
  },
  "servers.address": {
    description: "查询指定 IP 地址的 Steam 游戏服务器",
    target: "address",
    run: (p, c) => new SteamQueries(c).servers(p.target),
  },
  "economy.items": {
    description: "读取 TF2/CS2/Dota 等经济物品接口，需要 Web API Key",
    target: "appid",
    options: [user],
    run: (p, c) =>
      new SteamQueries(c).inventory(p.user ?? "me", String(appid(p.target))),
  },
  "trade.list": {
    description: "交易报价列表、描述和游标，需要 Web API Key",
    options: [
      arg("sent", "包含发出的报价", "boolean"),
      arg("received", "包含收到的报价", "boolean"),
      arg("active", "仅有效报价", "boolean"),
      arg("cursor", "Steam 报价游标"),
    ],
    run: (p, c) => new SteamQueries(c).tradeOffers(p),
  },
  "trade.get": {
    description: "按交易报价 ID 读取完整详情",
    target: "tradeofferid",
    run: (p, c) => new SteamQueries(c).tradeOffer(p.target),
  },
  "trade.summary": {
    description: "待处理交易数量汇总",
    run: (_p, c) => new SteamQueries(c).tradeSummary(),
  },
  "trade.history": {
    description: "已完成交易历史及后续游标",
    options: [
      limit,
      arg("failed", "包含失败或回滚交易", "boolean"),
      arg("afterTime", "从此时间后继续", "integer"),
      arg("afterId", "从此交易 ID 后继续"),
    ],
    run: (p, c) => new SteamQueries(c).tradeHistory(p),
  },
};
