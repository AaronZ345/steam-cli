import {
  existsSync,
  readFileSync,
  cpSync,
  mkdirSync,
  lstatSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { appid, assert, config, home, number } from "./core.js";
import { Client } from "./http.js";
import { Store } from "./store.js";
import { Community, idForms } from "./community.js";
import { Reviews } from "./reviews.js";
import { Extras } from "./extras.js";
import * as auth from "./auth.js";
import * as local from "./local.js";
import * as network from "./network.js";
import { itad } from "./prices.js";
import { featureOperations } from "./feature-ops.js";
import { extendedOperations } from "./extended-ops.js";
import { parseArguments, type ArgumentSpec } from "./arguments.js";
import { VERSION } from "./version.js";
import { steamClientSources } from "./steam-client-cookies.js";

export type Params = Record<string, any>;
export interface Operation {
  description: string;
  write?: boolean;
  target?: string;
  options?: ArgumentSpec[];
  offline?: boolean;
  run: (p: Params, c: Client) => Promise<any> | any;
}
export const operations: Record<string, Operation> = {
  ...featureOperations,
  ...extendedOperations,
  "auth.steam-client": {
    description: "发现 Steam App Cookie 来源；execute 后解密、核验并导入",
    write: true,
    offline: true,
    options: [
      { name: "root", description: "Steam 安装根目录", type: "string" },
      {
        name: "profile",
        description: "CEF 资料名称或 Cookie 路径",
        type: "string",
      },
      {
        name: "keychainService",
        description: "macOS 钥匙串 service",
        type: "string",
      },
    ],
    run: (p) =>
      p.execute
        ? auth.importSteamClient({
            root: p.root,
            profile: p.profile,
            keychainService: p.keychainService,
          })
        : {
            dry_run: true,
            ...steamClientSources({
              root: p.root,
              profile: p.profile,
              keychainService: p.keychainService,
            }),
          },
  },
  search: {
    description: "搜索 Steam 游戏名称",
    run: (p, c) => new Store(c).search(p.query || p.target || "", p),
  },
  browse: {
    description: "分页浏览商店目录",
    run: (p, c) => new Store(c).search("", p),
  },
  app: {
    description: "游戏详情、发行信息、配置需求和售价",
    target: "appid",
    run: (p, c) => new Store(c).app(p.target),
  },
  appinfo: {
    description: "客户端 PICS 元数据、depots、branches、launch 配置",
    target: "appid",
    run: (p) => network.productInfo(appid(p.target)),
  },
  "store-item": {
    description: "StoreBrowse 评分、标签、Deck 兼容性及购买选项",
    target: "appid",
    run: (p, c) => new Store(c).browseItem(appid(p.target)),
  },
  price: {
    description: "当前价格与地区比价，保留原币种",
    target: "appid",
    run: (p, c) => new Store(c).price(p.target, p.compare),
  },
  history: {
    description: "IsThereAnyDeal 历史价格，需要 ITAD_API_KEY",
    target: "appid",
    run: (p, c) =>
      itad(
        p.target,
        "history",
        c.country,
        number(p.days ?? 30, "days", 1, 3650),
      ),
  },
  "cross-store": {
    description: "跨店当前报价，需要 ITAD_API_KEY",
    target: "appid",
    run: (p, c) => itad(p.target, "prices", c.country),
  },
  deals: {
    description: "优惠、畅销、新游和即将推出列表",
    run: (p, c) =>
      new Store(c).search("", {
        ...p,
        filter: p.filter ?? "specials",
        specials: (p.filter ?? "specials") === "specials",
      }),
  },
  featured: {
    description: "商店特色栏目",
    run: (_p, c) => new Store(c).featured(),
  },
  dlc: {
    description: "游戏 DLC 列表",
    target: "appid",
    run: (p, c) => new Store(c).dlc(p.target),
  },
  media: {
    description: "封面、截图和预告片",
    target: "appid",
    run: (p, c) => new Store(c).media(p.target),
  },
  similar: {
    description: "相似游戏",
    target: "appid",
    run: (p, c) => new Store(c).similar(p.target, p.limit),
  },
  package: {
    description: "套餐详情",
    target: "package-id",
    run: (p, c) => new Store(c).package(p.target),
  },
  reviews: {
    description: "游戏社区评价、汇总评分、游标分页",
    target: "appid",
    run: (p, c) => new Store(c).reviews(p.target, p),
  },
  news: {
    description: "游戏新闻公告",
    target: "appid",
    run: (p, c) => new Store(c).news(p.target, p.limit),
  },
  events: {
    description: "Steamworks 即将举行的活动日历",
    run: (_p, c) => new Store(c).events(),
  },
  players: {
    description: "当前在线人数",
    target: "appid",
    run: (p, c) => new Store(c).players(p.target),
  },
  achievements: {
    description: "全球成就或指定用户成就",
    target: "appid",
    run: (p, c) =>
      p.user
        ? new Community(c).achievements(p.target, p.user)
        : new Store(c).achievements(p.target),
  },
  stats: {
    description: "用户游戏统计",
    target: "appid",
    run: (p, c) => new Community(c).stats(p.target, p.user),
  },
  user: {
    description: "用户资料",
    run: (p, c) => new Community(c).profile(p.target || "me"),
  },
  resolve: {
    description: "解析 SteamID、vanity 和个人资料地址",
    target: "user",
    run: async (p, c) => idForms(await new Community(c).resolve(p.target)),
  },
  games: {
    description: "游戏库和时长，支持筛选排序",
    run: (p, c) => new Community(c).games(p.user || "me", p),
  },
  recent: {
    description: "最近游玩记录",
    run: (p, c) => new Community(c).recent(p.user, p.limit),
  },
  "friends.list": {
    description: "好友列表",
    run: (p, c) =>
      p.client ? network.networkFriends() : new Community(c).friends(p.user),
  },
  "friends.add": {
    description: "发送好友申请",
    write: true,
    target: "steamid64",
    run: (p) => network.friendChange(p.target, false, !p.execute),
  },
  "friends.remove": {
    description: "移除好友",
    write: true,
    target: "steamid64",
    run: (p) => network.friendChange(p.target, true, !p.execute),
  },
  "chat.history": {
    description: "读取好友聊天历史",
    target: "steamid64",
    run: (p) => network.chatHistory(p.target, p.limit),
  },
  "chat.send": {
    description: "发送好友消息，默认预览",
    write: true,
    target: "steamid64",
    run: (p) => network.chatSend(p.target, p.text || "", !p.execute),
  },
  "wishlist.list": {
    description: "读取愿望单",
    run: (p, c) => new Community(c).wishlist(p.user),
  },
  "wishlist.add": {
    description: "加入愿望单",
    write: true,
    target: "appid",
    run: (p, c) => new Community(c).changeWishlist(p.target, false, !p.execute),
  },
  "wishlist.remove": {
    description: "移出愿望单",
    write: true,
    target: "appid",
    run: (p, c) => new Community(c).changeWishlist(p.target, true, !p.execute),
  },
  "review.list": {
    description: "用户评测列表",
    run: (p, c) => new Community(c).reviewList(p.user, p.page),
  },
  "review.get": {
    description: "读取个人完整评测和推荐状态",
    target: "appid",
    run: (p, c) => new Community(c).review(p.target, p.user),
  },
  "review.edit": {
    description: "编辑本人评测，保留未指定字段，提交后读回",
    write: true,
    target: "appid",
    run: (p, c) => new Reviews(c).edit(p.target, p.changes || {}, !p.execute),
  },
  "review.create": {
    description: "创建本人评测",
    write: true,
    target: "appid",
    run: (p, c) => new Reviews(c).create(p.target, p.changes || {}, !p.execute),
  },
  "review.delete": {
    description: "删除本人评测",
    write: true,
    target: "appid",
    run: (p, c) => new Reviews(c).delete(p.target, !p.execute),
  },
  "review.vote": {
    description: "评价投票或有趣标记",
    write: true,
    target: "review-id",
    run: (p, c) =>
      new Reviews(c).vote(
        p.target,
        p.up !== false,
        p.funny === true,
        !p.execute,
      ),
  },
  inventory: {
    description: "库存物品和描述，支持分页",
    run: (p, c) =>
      new Community(c).inventory(
        p.user || "me",
        appid(p.appid || 753),
        String(p.context || 6),
        p,
      ),
  },
  "market.search": {
    description: "社区市场搜索",
    run: (p, c) => new Extras(c).marketSearch(p.query || "", p),
  },
  "market.price": {
    description: "市场物品最低价、中位价和成交量",
    target: "appid",
    run: (p, c) => new Extras(c).marketPrice(p.target, p.name, p.currency),
  },
  "market.listings": {
    description: "本人市场挂单及买单",
    run: (_p, c) => new Extras(c).marketListings(),
  },
  "workshop.info": {
    description: "创意工坊条目及合集详情",
    target: "file-id",
    run: (p, c) => new Extras(c).workshopInfo(p.target),
  },
  "workshop.browse": {
    description: "分页浏览创意工坊",
    target: "appid",
    run: (p, c) => new Extras(c).workshopBrowse(p.target, p),
  },
  "workshop.subscribe": {
    description: "订阅创意工坊条目",
    write: true,
    target: "file-id",
    run: (p, c) => new Extras(c).workshopSubscribe(p.target, false, !p.execute),
  },
  "workshop.unsubscribe": {
    description: "取消创意工坊订阅",
    write: true,
    target: "file-id",
    run: (p, c) => new Extras(c).workshopSubscribe(p.target, true, !p.execute),
  },
  "comment.list": {
    description: "读取个人资料、评测或工坊评论",
    target: "owner-id",
    run: (p, c) =>
      new Extras(c).comments(
        p.type || "Profile",
        p.target,
        p.feature || "-1",
        p.limit,
        p.offset,
      ),
  },
  "comment.create": {
    description: "发表个人资料、评测或工坊评论",
    write: true,
    target: "owner-id",
    run: (p, c) =>
      new Extras(c).comment(
        p.type || "Profile",
        p.target,
        p.feature || "-1",
        p.text || "",
        !p.execute,
      ),
  },
  "cloud.list": {
    description: "列出 Steam Cloud 文件",
    target: "appid",
    run: (p, c) => new Extras(c).cloudList(p.target),
  },
  "cloud.download": {
    description: "下载一个云存档到指定文件，不覆盖已有文件",
    write: true,
    target: "appid",
    run: (p, c) =>
      p.execute
        ? new Extras(c).cloudDownload(p.target, p.name, p.out)
        : {
            dry_run: true,
            action: "cloud.download",
            appid: appid(p.target),
            name: p.name,
            out: p.out,
          },
  },
  badges: {
    description: "用户徽章",
    run: (p, c) => new Extras(c).badges(p.user),
  },
  bans: {
    description: "公开封禁状态",
    run: (p, c) => new Extras(c).bans(p.user),
  },
  level: {
    description: "Steam 等级",
    run: (p, c) => new Extras(c).level(p.user),
  },
  "licenses.list": {
    description: "客户端账号许可证和钱包信息",
    run: () => network.licenses(),
  },
  "licenses.free": {
    description: "领取免费游戏许可证",
    write: true,
    target: "appid",
    run: (p) => network.freeLicense(appid(p.target), !p.execute),
  },
  "playtime.idle": {
    description: "限时运行 gamesPlayed 状态，结束自动清理",
    write: true,
    target: "appid",
    run: (p) =>
      network.idle(
        String(p.target).split(",").map(appid),
        number(p.minutes, "minutes", 1, 1440),
        !p.execute,
      ),
  },
  "local.libraries": {
    description: "本地 Steam 游戏库目录及剩余空间",
    run: () => local.libraries(),
  },
  "local.installed": {
    description: "读取本地安装清单",
    run: () => local.installed(),
  },
  "local.backends": {
    description: "外部后端依赖状态",
    run: () => local.backends(),
  },
  "local.play": {
    description: "交给 Steam 客户端启动游戏",
    write: true,
    target: "appid",
    run: (p) => local.launch(p.target, "run", p.execute),
  },
  "local.install": {
    description: "交给 Steam 客户端安装游戏",
    write: true,
    target: "appid",
    run: (p) => local.launch(p.target, "install", p.execute),
  },
  "local.verify": {
    description: "交给 Steam 客户端校验游戏",
    write: true,
    target: "appid",
    run: (p) => local.launch(p.target, "validate", p.execute),
  },
  "local.uninstall": {
    description: "交给 Steam 客户端卸载游戏",
    write: true,
    target: "appid",
    run: (p) => local.launch(p.target, "uninstall", p.execute),
  },
  "auth.status": {
    description: "本地登录状态，不联系 Steam",
    run: () => auth.status(),
  },
  doctor: {
    description: "诊断运行环境、配置、认证和后端",
    run: async (p, c) => {
      const result: any = {
        version: VERSION,
        node: process.version,
        platform: process.platform,
        config_home: home(),
        country: c.country,
        language: c.language,
        auth: auth.status(),
        steam_client: steamClientSources(),
        web_api_key: Boolean(process.env.STEAM_WEB_API_KEY),
        publisher_api_key: Boolean(process.env.STEAM_PUBLISHER_API_KEY),
        financial_api_key: Boolean(process.env.STEAM_FINANCIAL_API_KEY),
        itad_key: Boolean(
          process.env.ITAD_API_KEY || process.env.STEAM_CLI_ITAD_KEY,
        ),
        backends: local.backends(),
        steam_path: local.steamRoot(),
        network_checked: false,
      };
      if (p.verifyLogin) result.auth = await auth.verify(c.requireAuth());
      if (p.network) {
        const game = await new Store(c).app(620);
        result.network_checked = true;
        result.network = { store: Boolean(game.steam_appid) };
      }
      return result;
    },
  },
};
export async function run(
  name: string,
  p: Params = {},
  settings: Params = {},
): Promise<any> {
  const op = operations[name];
  assert(op, "UNKNOWN_COMMAND", `未知操作 ${name}`);
  if (op.target)
    assert(p.target !== undefined, "INVALID_ARGUMENT", `操作需要 ${op.target}`);
  if (p.execute !== undefined)
    assert(
      typeof p.execute === "boolean",
      "INVALID_ARGUMENT",
      "execute 必须为布尔值",
    );
  const c = new Client({
    ...(op.offline ? { session: null } : {}),
    country: settings.cc,
    language: settings.lang,
    timeout: settings.timeout,
    interval: settings.rateMs,
  });
  try {
    return await op.run(parseArguments(p, op.options), c);
  } finally {
    await c.close();
  }
}
export function capabilities(): object {
  return {
    version: VERSION,
    operations: Object.entries(operations).map(([name, op]) => ({
      name,
      description: op.description,
      write: Boolean(op.write),
      target: op.target ?? null,
      options: op.options ?? [],
    })),
    backend_integrations: ["steamcmd", "steamctl", "aurelia"],
    exhaustive_parity: false,
  };
}
export function installSkill(): object {
  const source = path.resolve(import.meta.dirname, "../skills/steam-cli"),
    dest = path.join(
      process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
      "skills/steam-cli",
    );
  assert(existsSync(source), "NOT_FOUND", "安装包中缺少 companion skill");
  if (existsSync(dest)) {
    assert(
      !lstatSync(dest).isSymbolicLink() &&
        readFileSync(path.join(dest, "SKILL.md"), "utf8").includes(
          "owner: aaron",
        ) &&
        readFileSync(path.join(dest, "SKILL.md"), "utf8").includes(
          "name: steam-cli",
        ),
      "CONFIG_ERROR",
      "目标技能已有其他来源，拒绝覆盖",
    );
  }
  mkdirSync(dest, { recursive: true });
  cpSync(source, dest, { recursive: true });
  return { installed: true, path: dest };
}
export function showConfig(): object {
  return { path: path.join(home(), "config.json"), ...config() };
}
