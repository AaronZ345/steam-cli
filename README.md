# steam-cli

在终端查询 Steam 游戏、价格、评价、个人游戏库和成就，编辑本人的游戏评测。支持 CLI、Node.js SDK、MCP、REST 和 Agent Skill。

[安装](#安装) · [常用命令](#常用命令) · [助手接入](#助手接入) · [浏览器](#浏览器) · [文档](#文档) · [开发](#开发)

## 能做什么

| 功能 | 内容 |
| --- | --- |
| 游戏与商店 | 名称搜索、详情、标签、配置需求、DLC、媒体、套餐、相似游戏、新闻、在线人数、商店榜单 |
| 价格 | 当前价格、折扣、地区比价；配置 IsThereAnyDeal 密钥后读取历史价格和跨店报价 |
| 评价与评测 | 社区评价、汇总评分、本人完整评测；创建、编辑、删除、投票；编辑保留未指定字段并读回核验 |
| 游戏记录 | 游戏库、总时长、近两周时长、最近游玩、个人及全球成就、游戏统计 |
| 账号与社区 | 资料、SteamID 转换、好友、聊天、徽章、等级、愿望单、库存、市场查询、工坊、云存档下载 |
| 本地游戏 | 安装清单、下载进度、磁盘与存档备份、库间移动、启动参数、快捷方式、Proton；启动/安装/校验/卸载仍交给 Steam 客户端 |
| 客户端协议 | 手机扫码登录、PICS/Depot 下载与 SHA1 校验、恢复下载、云存档上传和冲突同步、许可证、好友聊天 |
| 开发者 | Steamworks 所有权、分支、构建、排行榜、成就与物品写入、工坊元信息、销售汇总、素材校验与上传；需要对应权限 |
| 其他工具 | 衔接 SteamCMD、steamctl、Aurelia 的原始命令；后端需要另行安装 |
| 助手接入 | MCP、Agent Skill、ChatGPT 电脑工具、REST、SDK、诊断、JSON／CSV 等格式 |

能力范围及验证情况见[覆盖表](docs/coverage.md)。当前版本没有完成所有现有 Steam CLI 的逐项功能等价验证；后端转发也不计作原生实现。

## 0.2.0 新增

158 个共享操作可从 CLI、SDK、MCP 和 REST 使用。三套 MCP 源码快照中的 145 个功能点已逐项映射；19 项仍有参数、字段或工作流差异，详见 [parity.md](docs/parity.md)。这不是对所有项目与版本的永久全覆盖承诺。

```bash
steam-cli coverage --json
steam-cli local games --query bg3 --json
steam-cli local disk-report --json
steam-cli local saves-backup --out /path/to/new-backup --dry-run --json
steam-cli local launch-options 620 --json
steam-cli library unplayed --limit 20 --json
steam-cli insights completion --limit 50 --json
steam-cli game hltb --query 'Portal 2' --json
steam-cli crawl 'steam://app/620' --depth 1 --limit 5 --json
```

本地修改默认预览；`--execute` 才执行，涉及客户端配置时要求 Steam 退出，备份并检查并发修改。云同步使用独立基线，冲突即停，不自动删除。协议下载需要客户端登录；`cloud list/download` 仍可使用 Web 登录，`cloud files/fetch/upload/delete/sync` 使用客户端协议。

开发者接口分别读取 `STEAM_PUBLISHER_API_KEY` 和 `STEAM_FINANCIAL_API_KEY`，不会把普通 Web Cookie 发给发行商 API。素材上传需要独立 Partner Cookie JSON。SDK 指引明确返回 `executed=false`。

## 安装

需要 Node.js 22.13 或更新版本。发行依赖使用 `npm-shrinkwrap.json` 锁定。从源码安装：

```bash
npm ci
npm run build
npm link --ignore-scripts
steam-cli --version
steam-cli doctor --json
```

也可运行 `npm pack` 生成发行包，然后 `npm install -g /path/to/aaronz345-steam-cli-0.1.0.tgz --ignore-scripts`。命令名是 `steam-cli`。

## 常用命令

### 查询商店和记录

```bash
steam-cli search "Portal 2" --limit 5 --json
steam-cli app 620 --json
steam-cli store-item 620 --json
steam-cli price 620 --compare CN,US,JP --json
steam-cli reviews 620 --limit 10 --json
steam-cli deals --filter specials --limit 10 --json
steam-cli news 620 --limit 5 --json
steam-cli achievements 620 --json

steam-cli login --browser chrome
steam-cli games --sort playtime --limit 20 --json
steam-cli achievements 620 --user me --json
steam-cli review list --json
steam-cli review get 620 --json
steam-cli wishlist list --json
```

搜索结果给出 appid，后续命令使用 ID 或商店游戏地址。时长保留 Steam 的分钟值，同时提供换算小时。未知值保留 `null`，私密资料和接口失败会返回错误。

### 编辑评测

```bash
steam-cli review edit 620 --file review.txt --recommend yes --dry-run --json
steam-cli review edit 620 --file review.txt --recommend yes --execute --json
steam-cli review create 620 --text "评测正文" --recommend yes --dry-run --json
steam-cli review delete 620 --dry-run --json
```

未提供的正文、推荐状态、公开性、语言和评论权限保持原值。所有写操作默认预览，只有 `--execute` 才提交。`accepted` 表示平台接收，`verified` 表示读回核对；未知结果不自动重复提交。

### 库存、市场、工坊和存档

```bash
steam-cli inventory --appid 753 --context 6 --limit 100 --json
steam-cli market search --query "Mann Co. Supply Crate Key" --appid 440 --json
steam-cli market price 440 --name "Mann Co. Supply Crate Key" --currency 23 --json
steam-cli workshop browse 620 --query "puzzle" --json
steam-cli cloud list 620 --json
steam-cli cloud download 620 --name "完整文件名" --out ./save.dat --dry-run --json
steam-cli local installed --json
```

### 客户端和外部后端

```bash
steam-cli login --qr
steam-cli appinfo 620 --json
steam-cli friends list --client --json
steam-cli chat send STEAMID64 --text "消息正文" --dry-run --json
steam-cli playtime idle 620 --minutes 10 --dry-run --json

steam-cli local backends --json
steam-cli --json backend steamcmd -- +login anonymous +app_info_print 620 +quit
steam-cli --json backend steamctl -- depot --help
steam-cli --json backend aurelia -- cloud list 620
```

后端默认显示执行计划。要运行，将 `--execute` 放在 `--` 前，例如 `steam-cli backend steamctl --execute -- depot --help`。`--` 后的内容原样交给后端；全局 `--json` 也应放在它前面。后端账号凭据在后端自己的交互终端或缓存里管理。

Steam 客户端的 `local install` 等命令只确认请求已分发；下载是否完成需要检查本地清单。`playtime idle` 设置 gamesPlayed 状态，必填时限并在退出时清理；Steam 是否计入时长需要稍后读取游戏库确认。

## 助手接入

### Agent Skill 与 ChatGPT

```bash
steam-cli skill install
```

技能安装到当前 Codex home 的 `skills/steam-cli`。已连接的电脑可以通过命令调用工具；电脑需在线并已授予访问权限。

### MCP

```bash
steam-cli mcp
steam-cli mcp --transport streamable-http --port 7732
```

客户端配置和工具约定见 [MCP 与 SDK](docs/integrations.md)。写工具默认 `execute=false`。

### REST 与 SDK

```bash
steam-cli serve --port 7731
curl http://127.0.0.1:7731/v1/capabilities
curl 'http://127.0.0.1:7731/v1/app?target=620'
```

服务只监听本机。SDK 与 CLI 共用操作：

```js
import { run } from '@aaronz345/steam-cli';
const result = await run('price', { target: '620', compare: 'CN,US' });
```

## 浏览器

```bash
steam-cli browsers --json
steam-cli login --browser chrome --profile Default
steam-cli login --browser firefox --profile /path/to/profile
steam-cli login --cookie-file /path/to/cookies.json
```

支持 macOS、Windows、Linux 上的 Chrome、Edge、Chromium、Brave、Vivaldi、Opera、Firefox；Arc 支持 macOS／Windows，Safari 支持 macOS。系统加密限制和实测范围见[浏览器登录](docs/browser-login.md)。Windows 的 App-Bound Encryption 可能阻止 Cookie 解密，此时可用扫码或文件导入。

网页登录态与客户端登录态分开使用；浏览器 Cookie 不能直接用于客户端协议。登录缓存采用 AES-256-GCM 加密，目录权限 `0700`，文件权限 `0600`。缓存密钥在同一本机目录内，不能替代操作系统账号保护。工具不输出 Cookie 或 token 值。

## 结果与诊断

```bash
steam-cli doctor --json
steam-cli doctor --network --verify-login --json
steam-cli capabilities --json
steam-cli games --limit 1000 --format csv --output ./games.csv
```

`--json` 的成功结构为 `{"ok":true,"data":...}`，失败结构为 `{"ok":false,"error":{"code":"...","message":"..."}}`，失败退出码为 1。stdout 仅输出 JSON，诊断写入 stderr。支持 `table`、`json`、`jsonl`、`csv`、`tsv`、`markdown`、`url`；`--fields` 选择表格或 CSV 字段，`--output` 写入新文件。

`next_cursor`、`next_offset`、`next_page` 用于继续读取。分页限制不会被描述为完整读取。旧评价 JSON 接口失效时可使用 Steam 社区后备来源，返回字段会说明来源和缺失内容。

## 文档

| 文档 | 用途 |
| --- | --- |
| [命令参考](docs/cli.md) | 命令族、筛选、分页和错误 |
| [浏览器登录](docs/browser-login.md) | 浏览器、资料路径、导入与权限 |
| [MCP、REST、SDK](docs/integrations.md) | 助手配置与服务调用 |
| [覆盖表](docs/coverage.md) | 对照项目、原生实现、后端与缺口 |
| [接口契约](docs/api-contract.md) | Steam 数据来源和写入字段 |
| [验证记录](docs/validation.md) | 实测结果和验证边界 |

## 开发

```bash
npm ci
npm run verify
npm pack
```

默认测试使用虚构 Cookie、响应和模拟 HTTP，不读取真实账号。联网和账号读取另行执行；测试不发表真实评测、评论或聊天消息。浏览器适配基于豆瓣项目的 MIT 代码，原许可保留于 `THIRD_PARTY_LICENSE_DOUBAN`。

## 许可证

非官方 Steam 工具，采用 MIT License。Steam 和 Valve 商标属于各自权利人。
