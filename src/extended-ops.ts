import type { Operation } from "./service.js";
import { arg } from "./arguments.js";
import { Publisher } from "./publisher.js";
import { contentOperation } from "./content.js";
import { cloudOperation } from "./cloud.js";
import { guardFile, masterServers } from "./protocol.js";
import {
  validateAsset,
  auditAssets,
  uploadAsset,
  assetSlots,
} from "./assets.js";
import { sdkGuide } from "./sdk-guide.js";
import { coverage } from "./coverage.js";
import { launch } from "./local.js";
import { LocalData } from "./local-data.js";
import {
  preset,
  mangoHud,
  importLutris,
  moveGame,
  localCollections,
  crashLogs,
} from "./local-tools.js";

const str = (name: string, description: string, required = false) =>
  arg(name, description, "string", { required });
const int = (
  name: string,
  description: string,
  required = false,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) => arg(name, description, "integer", { required, min, max });
const localArgs = [
  str("root", "Steam 根目录"),
  str("account", "userdata 账号目录或 SteamID64"),
];
const local = (p: any) => new LocalData(p.root, p.account);
const steamid = str("steamid", "目标 SteamID64", true),
  board = int("board", "排行榜 ID", true, 1);
const downloadArgs = [
  int("depot", "Depot ID", true, 1, 0xffffffff),
  str("manifest", "Manifest uint64 ID", true),
  str("branch", "分支，默认 public"),
  str("out", "目标目录", true),
  arg("anonymous", "使用匿名客户端", "boolean"),
];
export const extendedOperations: Record<string, Operation> = {
  coverage: {
    description: "逐项展示固定 MCP 源码版本的功能映射与未齐项",
    offline: true,
    run: () => coverage(),
  },
  "local.store-page": {
    description: "预览或在 Steam 客户端打开游戏商店页面",
    target: "appid",
    offline: true,
    write: true,
    run: (p) => launch(p.target, "store", p.execute),
  },
  "guard.code": {
    description:
      "从权限受限的 maFile/shared-secret 文件生成 Steam Guard 代码，不输出原始密钥",
    offline: true,
    options: [
      str("file", "认证文件路径", true),
      int("time", "Unix 秒，默认本地当前时间"),
    ],
    run: (p) => guardFile(p.file, p.time),
  },
  "servers.master": {
    description: "分页查询 Valve HL2 Master Server，限制结果数量",
    offline: true,
    options: [
      int("limit", "最多返回条数", false, 1, 10000),
      int("region", "地区 0–7 或 255"),
      str("filter", "Valve 过滤表达式"),
      str("cursor", "上一页 next_cursor"),
    ],
    run: (p) => masterServers(p),
  },
  "assets.validate": {
    description: "检查商店图片结构、尺寸、格式及透明通道",
    offline: true,
    options: [
      str("file", "图片路径", true),
      arg("slot", "素材槽位", "string", {
        required: true,
        choices: assetSlots,
      }),
    ],
    run: (p) => validateAsset(p.file, p.slot),
  },
  "assets.audit": {
    description: "按文件名前缀核查素材目录、必需槽位和成就图标配对",
    offline: true,
    options: [
      str("directory", "素材目录", true),
      arg("icons", "仅检查成就图标配对", "boolean"),
    ],
    run: (p) => auditAssets(p.directory, p.icons),
  },
  "publisher.asset-upload": {
    description: "预览或保存 Steamworks 商店图片，不发布页面",
    target: "appid",
    write: true,
    options: [
      str("file", "图片路径", true),
      arg("slot", "素材槽位", "string", {
        required: true,
        choices: assetSlots,
      }),
      str("cookieFile", "仅供 Partner 上传的 Cookie JSON 文件"),
    ],
    run: (p, c) => uploadAsset(c, p.target, p),
  },
  "sdk.guide": {
    description: "输出 Lobby/Workshop/Trailer 集成步骤，明确不会执行 SDK",
    target: "lobby|workshop|trailer",
    offline: true,
    options: [
      str("appid", "Workshop 所属 App"),
      int("members", "大厅人数", false, 1, 250),
    ],
    run: (p) => sdkGuide(p.target, p),
  },
  depots: {
    description: "读取 PICS Depot 和分支清单",
    target: "appid",
    options: [arg("anonymous", "使用匿名客户端", "boolean")],
    run: (p) => contentOperation("depots", p.target, p),
  },
  "content.manifest": {
    description: "读取和解密 Depot 文件清单，不暴露密钥",
    target: "appid",
    options: downloadArgs.filter((s) => s.name !== "out"),
    run: (p) => contentOperation("manifest", p.target, p),
  },
  "content.download": {
    description: "下载指定 Depot 清单，断点恢复并核对 SHA1",
    target: "appid",
    write: true,
    options: [
      ...downloadArgs,
      arg("resume", "恢复相同下载任务", "boolean"),
      int("limitBytes", "最大下载字节数"),
    ],
    run: (p) => contentOperation("download", p.target, p),
  },
  "content.verify": {
    description: "逐文件校验本地 Depot 大小与 SHA1",
    target: "appid",
    options: downloadArgs,
    run: (p) => contentOperation("verify", p.target, p),
  },
  "cloud.files": {
    description: "通过 Steam 客户端协议分页读取云存档元信息",
    target: "appid",
    options: [
      int("offset", "起始文件序号"),
      int("limit", "文件数，最多 1000", false, 1, 1000),
    ],
    run: (p) => cloudOperation("list", p.target, p),
  },
  "cloud.fetch": {
    description: "通过客户端协议下载并校验云存档 SHA1",
    target: "appid",
    write: true,
    options: [str("name", "远端文件名", true), str("out", "新本地文件", true)],
    run: (p) => cloudOperation("download", p.target, p),
  },
  "cloud.upload": {
    description: "分块传输云存档、提交一次并读回 SHA1",
    target: "appid",
    write: true,
    options: [
      str("name", "远端文件名", true),
      str("file", "本地存档文件", true),
    ],
    run: (p) => cloudOperation("upload", p.target, p),
  },
  "cloud.delete": {
    description: "删除一个云存档并读回核验",
    target: "appid",
    write: true,
    options: [str("name", "远端文件名", true)],
    run: (p) => cloudOperation("remove", p.target, p),
  },
  "cloud.sync": {
    description: "有基线的双向存档同步，冲突即停，不自动删除",
    target: "appid",
    write: true,
    options: [str("directory", "本地同步目录", true)],
    run: (p) => cloudOperation("sync", p.target, p),
  },
  "local.move": {
    description: "校验内容后将游戏移至已登记的 Steam 库",
    target: "appid",
    offline: true,
    write: true,
    options: [...localArgs, str("destination", "Steam 目标库根目录", true)],
    run: (p) => moveGame(local(p), p.target, p.destination, p.execute),
  },
  "local.presets": {
    description: "查看可用启动参数预设",
    offline: true,
    run: () => preset(null as any),
  },
  "local.apply-preset": {
    description: "备份后应用一个启动参数预设",
    target: "appid",
    offline: true,
    write: true,
    options: [...localArgs, str("name", "预设名称", true)],
    run: (p) => preset(local(p), p.target, p.name, p.execute),
  },
  "local.mangohud": {
    description: "读取 MangoHud 配置",
    offline: true,
    options: [str("file", "配置文件，默认 XDG 路径")],
    run: (p) => mangoHud(p),
  },
  "local.set-mangohud": {
    description: "备份后写入 MangoHud 配置",
    offline: true,
    write: true,
    options: [
      str("file", "配置文件，默认 XDG 路径"),
      str("config", "完整配置文本", true),
    ],
    run: (p) => mangoHud(p),
  },
  "shortcuts.import-lutris": {
    description: "从 Lutris 只读 SQLite 库或 JSON 导出导入快捷方式",
    offline: true,
    write: true,
    options: [...localArgs, str("file", "[{name,slug}] JSON 文件", true)],
    run: (p) => importLutris(local(p), p.file, p.execute),
  },
  "collections.list": {
    description: "读取旧版 sharedconfig 合集标签，标明非现代合集",
    offline: true,
    options: localArgs,
    run: (p) => localCollections(local(p), p),
  },
  "collections.set": {
    description: "备份后更新旧版合集标签，不自动云同步",
    offline: true,
    write: true,
    options: [
      ...localArgs,
      str("name", "合集名称", true),
      arg("apps", "appid JSON 数组", "json", { required: true }),
    ],
    run: (p) => localCollections(local(p), p),
  },
  "proton.crash-logs": {
    description: "读取指定游戏的 Proton 日志尾部",
    target: "appid",
    offline: true,
    options: [...localArgs, int("limit", "最多行数", false, 1, 1000)],
    run: (p) => crashLogs(local(p), p.target, p.limit),
  },
  "publisher.ownership": {
    description: "Steamworks 游戏所有权查询，需要发行商密钥",
    target: "appid",
    options: [steamid],
    run: (p, c) => new Publisher(c).ownership(p.target, p.steamid),
  },
  "publisher.betas": {
    description: "查询开发者 App 测试分支",
    target: "appid",
    run: (p, c) => new Publisher(c).betas(p.target),
  },
  "publisher.builds": {
    description: "查询开发者 App 构建记录",
    target: "appid",
    options: [int("count", "构建条数", false, 1, 1000)],
    run: (p, c) => new Publisher(c).builds(p.target, p.count),
  },
  "leaderboards.list": {
    description: "Steamworks 排行榜列表，需要发行商密钥",
    target: "appid",
    run: (p, c) => new Publisher(c).leaderboards(p.target),
  },
  "leaderboards.entries": {
    description: "Steamworks 排名条目与玩家附近排名",
    target: "appid",
    options: [
      board,
      int("start", "起点"),
      int("end", "终点"),
      int("mode", "0 全球、1 玩家附近、2 好友", false, 0, 2),
      str("steamid", "玩家 SteamID64"),
    ],
    run: (p, c) => new Publisher(c).entries(p.target, p),
  },
  "leaderboards.score": {
    description: "发行商设置排行榜分数，提交一次并读回",
    target: "appid",
    write: true,
    options: [
      steamid,
      board,
      int("score", "分数", true, -2147483648, 2147483647),
      arg("method", "更新方式", "string", {
        choices: ["KeepBest", "ForceUpdate"],
      }),
    ],
    run: (p, c) => new Publisher(c).score(p.target, p),
  },
  "publisher.achievement": {
    description: "发行商设置或清除成就并读回，需要 App 权限",
    target: "appid",
    write: true,
    options: [
      steamid,
      str("name", "成就 API 名称", true),
      arg("unlocked", "yes 解锁/no 清除", "boolean"),
    ],
    run: (p, c) => new Publisher(c).achievement(p.target, p),
  },
  "publisher.grant": {
    description: "发行商授予游戏物品，需要非零幂等 requestid",
    target: "appid",
    write: true,
    options: [
      steamid,
      str("items", "itemdefid，逗号分隔", true),
      str("requestid", "uint64 幂等请求 ID", true),
      arg("notify", "通知玩家", "boolean"),
    ],
    run: (p, c) => new Publisher(c).grant(p.target, p),
  },
  "publisher.workshop-update": {
    description: "发行商修改工坊条目元信息，不上传文件",
    target: "publishedfileid",
    write: true,
    options: [
      str("appid", "所属 App ID", true),
      str("title", "新标题"),
      str("description", "新说明"),
      int("visibility", "可见性 0–3", false, 0, 3),
      arg("tags", "标签 JSON 数组", "json"),
    ],
    run: (p, c) => new Publisher(c).workshop(p.target, p),
  },
  "financial.changed": {
    description: "获取有销售数据变更的日期及后续水位",
    options: [str("highwatermark", "上次返回的水位，首次为 0")],
    run: (p, c) => new Publisher(c).changed(p.highwatermark),
  },
  "financial.sales": {
    description: "完整分页汇总最多 31 天销售，十进制定点美元",
    options: [
      str("start", "开始日期 YYYY-MM-DD", true),
      str("end", "结束日期，默认同一天"),
      str("appid", "仅统计指定 App"),
      arg("group", "分组", "string", {
        choices: ["country", "day", "app", "package", "platform"],
      }),
    ],
    run: (p, c) => new Publisher(c).sales(p),
  },
};
