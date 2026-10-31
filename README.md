<div align="center">

# steam-cli

在终端查 Steam 价格与评价，整理游戏库、时长和成就，编辑自己的游戏评测。

支持浏览器与 Steam App 登录态导入，提供 CLI、Node.js SDK、MCP、REST 和 Agent Skill。

[![CI](https://github.com/AaronZ345/steam-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/AaronZ345/steam-cli/actions/workflows/ci.yml) [![Version](https://img.shields.io/badge/version-0.2.2-1b2838)](CHANGELOG.md) [![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522.13-43853d)](https://nodejs.org/) [![MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

[安装](#安装) · [常用命令](#常用命令) · [登录](#登录) · [助手接入](#助手接入) · [文档](#文档) · [开发](#开发)

</div>

## 能做什么

| 功能 | 内容 |
| --- | --- |
| 游戏与商店 | 名称搜索、详情、标签、配置需求、DLC、媒体、套餐、相似游戏、新闻、在线人数和榜单 |
| 价格与折扣 | 当前价格、地区比价、优惠；配置 IsThereAnyDeal 密钥后查询历史价格和跨店报价 |
| 评价与评测 | 社区评价、汇总评分、本人完整评测；创建、编辑、删除和投票，编辑后读回核验 |
| 游戏记录 | 游戏库、总时长、近两周时长、最近游玩、个人与全球成就、未玩游戏和完成度 |
| 账号与社区 | 资料、SteamID、好友、聊天、徽章、等级、愿望单、库存、市场查询、工坊和评论 |
| 本地游戏 | 安装清单、下载进度、磁盘分析、存档备份、库间移动、启动参数、快捷方式和 Proton |
| 下载与云存档 | Depot 下载、SHA1 校验与恢复下载；Cloud 文件下载、上传和冲突同步 |
| 开发者工具 | Steamworks 所有权、分支、构建、排行榜、成就与物品写入、销售汇总和素材上传；需要对应权限 |
| 助手与自动化 | CLI、SDK、MCP、REST 共用 159 个操作；提供 Agent Skill、结构化输出和本地诊断 |

启动、安装、校验和卸载由 Steam 客户端执行；SteamCMD、steamctl、Aurelia 可作为另行安装的外部后端使用。具体实现、差异与实测范围见[覆盖表](docs/coverage.md)、[逐项对照](docs/parity.md)和[验证记录](docs/validation.md)。

## 安装

需要 **Node.js 22.13 或更新版本**。从源码安装：

```bash
git clone https://github.com/AaronZ345/steam-cli.git
cd steam-cli
npm ci
npm run build
npm link --ignore-scripts
steam-cli --version
steam-cli doctor --json
```

<details>
<summary>打包安装到另一台电脑</summary>

在源码目录运行 `npm pack`，将生成的发行包复制到目标电脑后安装：

```bash
npm install -g /path/to/aaronz345-steam-cli-0.2.2.tgz --ignore-scripts
```

命令名是 `steam-cli`，发行依赖由 `npm-shrinkwrap.json` 锁定。

</details>

## 常用命令

### 查游戏、价格与评价

```bash
steam-cli search "Portal 2" --limit 5 --json
steam-cli app 620 --json
steam-cli price 620 --compare CN,US,JP --json
steam-cli reviews 620 --limit 10 --json
steam-cli deals --filter specials --limit 10 --json
steam-cli news 620 --limit 5 --json
```

搜索结果包含 appid，后续命令可使用 ID 或 Steam 商店游戏地址。地区比价保留各地原币种。

### 看游戏库、时长与成就

先从[浏览器或 Steam App 导入登录态](#登录)，再查询个人记录：

```bash
steam-cli games --sort playtime --limit 20 --json
steam-cli achievements 620 --user me --json
steam-cli achievements 620 --json
steam-cli library unplayed --limit 20 --json
steam-cli insights completion --limit 50 --json
steam-cli wishlist list --json
```

`achievements --user me` 查询个人成就，不带 `--user` 查询全球成就。时长同时提供 Steam 原始分钟值和换算小时；未知值保留 `null`，私密资料或接口失败会明确报错。

### 读取与编辑本人评测

```bash
steam-cli review list --json
steam-cli review get 620 --json
steam-cli review edit 620 --file review.txt --recommend yes --dry-run --json
steam-cli review edit 620 --file review.txt --recommend yes --execute --json
```

先检查预览，再加 `--execute` 提交。未指定的正文、推荐状态、公开性、语言和评论权限保留原值。提交前核实账号与评测归属，提交后读取记录核对；结果未知时不自动重复提交。

创建和删除使用 `review create`、`review delete`，同样默认预览。具体参数见各命令的 `--help`。

<details>
<summary>库存、市场、工坊与云存档</summary>

```bash
steam-cli inventory --appid 753 --context 6 --limit 100 --json
steam-cli market search --query "Mann Co. Supply Crate Key" --appid 440 --json
steam-cli market price 440 --name "Mann Co. Supply Crate Key" --currency 23 --json
steam-cli workshop browse 620 --query "puzzle" --json
steam-cli cloud list 620 --json
steam-cli cloud download 620 --name "完整文件名" --out ./save.dat --dry-run --json
```

`cloud list/download` 使用 Web 登录态；`cloud files/fetch/upload/delete/sync` 使用客户端协议登录。云同步按独立基线检查冲突，发现冲突即停止，不自动删除文件。

</details>

<details>
<summary>本地游戏、存档备份与游玩资料</summary>

```bash
steam-cli local installed --json
steam-cli local games --query bg3 --json
steam-cli local disk-report --json
steam-cli local saves-backup --out /path/to/new-backup --dry-run --json
steam-cli local launch-options 620 --json
steam-cli game hltb --query "Portal 2" --json
steam-cli crawl "steam://app/620" --depth 1 --limit 5 --json
```

本地修改默认预览，显式 `--execute` 才执行。修改客户端配置或移动游戏时要求 Steam 退出，先备份，再检查文件是否被其他程序改动。

</details>

<details>
<summary>客户端协议与外部后端</summary>

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

后端默认显示执行计划。实际运行时将 `--execute` 放在 `--` 前，例如 `steam-cli backend steamctl --execute -- depot --help`。`--` 后的参数原样交给后端，全局 `--json` 也应放在它前面。后端凭据由其自己的交互终端或缓存管理。

客户端分发成功只表示请求已发出，下载是否完成需要检查本地清单。`playtime idle` 限时设置 gamesPlayed 状态并在退出时清理，Steam 是否计入时长需要稍后读取游戏库确认。

</details>

## 登录

### 浏览器

读取当前用户已登录 Steam 的本机浏览器 Cookie：

```bash
steam-cli browsers --json
steam-cli login --browser chrome --profile Default
steam-cli login --browser brave --profile "Profile 1"
steam-cli login --browser firefox --profile /path/to/profile
```

| 浏览器 | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Chrome、Edge、Chromium、Brave、Vivaldi、Opera | 支持 | 支持，受系统加密限制 | 支持 |
| Arc | 支持 | 支持，受系统加密限制 | 无 Linux 版 |
| Firefox | 支持 | 支持 | 支持 |
| Safari | 支持，需要系统读取权限 | 不支持 | 不支持 |

表中“支持”表示已实现定位与读取适配；真实账号登录实测范围目前为 macOS Chrome。Chromium 系和 Firefox 的 `--profile` 可指定名称、目录或数据库路径，Safari 不支持此参数。系统钥匙串、keyring 和 App-Bound 加密等限制见[浏览器登录](docs/browser-login.md)。

### 浏览器 Cookie 导入边界

CLI 必须与已登录浏览器位于同一可访问的运行环境；远程或隔离浏览器的网页登录不会自动同步给云端 CLI。默认只读所选浏览器的默认资料，不会扫描其他账号；已知自定义路径可通过 `login --browser chromium --profile /path/to/profile --json` 指定，也支持直接指定 `Cookies` 文件。选中实际资料目录后不会再合并其嵌套 `Default`。

内置 Chromium 读取器（Linux Chromium 系列、macOS Vivaldi/Opera）缺少数据库或解密失败会返回 `BROWSER_COOKIE_IMPORT_FAILED`，`details.issues` 区分 `PROFILE_NOT_FOUND`、`COOKIE_DECRYPTION_FAILED` 与 `COOKIE_FORMAT_UNSUPPORTED`；数据库可读但没有有效登录 Cookie 仍为 `AUTH_REQUIRED`。不支持的加密格式（如 App-Bound v20）不会尝试绕过系统保护；重新登录网页不解决文件隔离或解密权限问题。没有获得可读的受支持资料路径时，不会声称导入成功，也不会改写旧缓存。

### Steam App

也可以从 Steam 桌面客户端内嵌浏览器的 Cookie 数据库导入网页登录态：

```bash
steam-cli auth steam-client --json  # 只发现来源，不解密或导入
steam-cli login --steam-client --json
steam-cli login --steam-client --steam-path /path/to/Steam --profile Default --json
```

macOS 使用系统钥匙串，默认 service 为 `Chromium Safe Storage`，自定义安装可用 `--keychain-service` 指定。Linux 支持 basic/keyring CBC，Windows 支持当前用户 DPAPI/GCM；App-Bound v20 不支持。先解密并核验 Steam 账号，再更新缓存，失败时保留旧缓存。

目前 macOS 实机已确认数据库来源，真实解密与账号核验因钥匙串拒绝访问尚未完成；跨平台解密使用合成数据测试。[查看验证记录](docs/validation.md)

### 扫码与文件导入

```bash
steam-cli login --qr
steam-cli login --cookie-file /path/to/cookies.json
steam-cli auth status --json
```

浏览器和 Steam App 导入的是 Web 会话。Depot 下载、Cloud 客户端协议等功能需要独立客户端凭据，可通过手机扫码登录；导入 Web Cookie 时会保留已有的同账号客户端凭据。

登录缓存使用 AES-256-GCM 加密，目录与文件权限分别为 `0700/0600`。密钥与缓存同存于本机用户目录，仍依赖操作系统账号保护。工具不输出 Cookie 或 token 值，也不修改浏览器资料或 Steam Cookie 数据库。

## 助手接入

### Agent Skill

```bash
steam-cli skill install
```

技能安装到当前 Codex home 的 `skills/steam-cli`，源码和发行包均包含[技能文件](skills/steam-cli/SKILL.md)。助手读取技能后可调用本机命令，例如：

> 用 steam-cli 列出我游玩时长最多的 20 款游戏，并显示成就完成度。

> 用 steam-cli 读取我的 Portal 2 评测，预览修改正文，保留其他字段。

### MCP

支持 stdio 的 MCP 客户端可使用以下配置：

```json
{
  "mcpServers": {
    "steam-cli": {
      "command": "steam-cli",
      "args": ["mcp"]
    }
  }
}
```

也支持 `steam-cli mcp --transport streamable-http --port 7732`。159 个工具与 CLI 共用操作，写工具默认 `execute=false`。[工具与参数说明](docs/integrations.md)

<details>
<summary>REST 与 Node.js SDK</summary>

REST 服务只监听本机：

```bash
steam-cli serve --port 7731
curl http://127.0.0.1:7731/v1/capabilities
curl 'http://127.0.0.1:7731/v1/app?target=620'
```

SDK 可从安装后的包导入：

```js
import { run } from '@aaronz345/steam-cli';

const result = await run('price', { target: '620', compare: 'CN,US' });
```

调用方需要检查返回结果，尤其是写入的 `accepted` 和 `verified`。[完整接入说明](docs/integrations.md)

</details>

## 结果与诊断

```bash
steam-cli doctor --json
steam-cli doctor --network --verify-login --json
steam-cli capabilities --json
steam-cli games --limit 1000 --format csv --output ./games.csv
```

| 字段或值 | 含义 |
| --- | --- |
| `ok` | JSON 顶层成功标记；失败包含 `error.code` 和 `error.message`，退出码为 1 |
| `accepted` / `verified` | 平台已接收 / 读回核验通过；未知结果不自动重试 |
| `complete=false` | 尚未完整读取，需检查分页位置或来源限制 |
| `next_cursor` / `next_offset` / `next_page` | 下一次读取的位置 |
| `null` | 数值未知，不用 0 代替 |

支持 `table`、`json`、`jsonl`、`csv`、`tsv`、`markdown` 和 `url`。`--fields` 选择表格或 CSV 字段，`--output` 写入新文件；JSON 模式的 stdout 只输出结果，诊断写入 stderr。社区评价启用后备来源时会标注来源与缺失字段。

## 文档

| 文档 | 用途 |
| --- | --- |
| [命令参考](docs/cli.md) | 命令族、参数、筛选、分页与错误 |
| [浏览器与 Steam App 登录](docs/browser-login.md) | 登录来源、资料路径、加密与权限 |
| [MCP、REST 与 SDK](docs/integrations.md) | 助手配置、工具参数和服务调用 |
| [功能覆盖表](docs/coverage.md) | 原生功能、后端衔接与已知缺口 |
| [MCP 逐项对照](docs/parity.md) | 三套源码快照、145 个功能点的映射与差异 |
| [接口契约](docs/api-contract.md) | Steam 数据来源和写入字段 |
| [验证记录](docs/validation.md) | 自动测试、实机结果与未验证范围 |
| [更新日志](CHANGELOG.md) | 各版本变更 |

功能映射按冻结的源码版本对照，仍有参数、字段和工作流差异，不能据此认定与所有 Steam CLI／MCP 完全等价。Steamworks 需要发行商或财务密钥及对应权限，`sdk guide` 只提供集成步骤。

## 开发

```bash
npm ci
npm run verify
npm run package:smoke
npm pack
```

`verify` 运行 lint、类型检查、57 项测试和构建。GitHub Actions 在 Linux 的 Node.js 22、26 上执行校验与发行包干净安装检查。默认测试使用合成 Cookie、响应和临时 HTTP 服务，不读取真实账号；真实站点与账号验证单独记录。

## 许可证

非官方 Steam 工具，采用 [MIT License](LICENSE)。Steam 和 Valve 商标属于各自权利人。问题和复现步骤请提交到 [Issues](https://github.com/AaronZ345/steam-cli/issues)。

## 致谢

浏览器适配沿用 [AaronZ345/douban-cli](https://github.com/AaronZ345/douban-cli) 的代码，其上游为 [Marvae/douban-cli](https://github.com/Marvae/douban-cli)。原许可保留于 [THIRD_PARTY_LICENSE_DOUBAN](THIRD_PARTY_LICENSE_DOUBAN)。
