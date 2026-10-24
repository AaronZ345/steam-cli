# 功能覆盖

盘点日期：2026-10-25。对照公开文档逐项列出能力；“实现”表示已有代码，“实测”以 [validation.md](validation.md) 为准。不能由命令数量推导功能已经全部验证。

## 对照项目

| 项目 | 主要范围 | 本工具的对应方式 |
| --- | --- | --- |
| [nickxudotme/steam-cli](https://github.com/nickxudotme/steam-cli) | 商店、地区价格、ITAD、评价、媒体、DLC、活动、资料、愿望单 | 商店与账号查询、Steamworks 活动日历直接实现；ITAD 需密钥；完整筛选与实时媒体探测尚有差异 |
| [tamnd/steam-cli](https://github.com/tamnd/steam-cli) | 商店目录、资料、库存市场、多种导出、REST、MCP、图遍历 | 查询、格式、REST、MCP 直接实现；图遍历和 resource URI driver 未实现 |
| [SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD) | 安装、更新、校验、Depot、Workshop、开发者命令 | `backend steamcmd -- ...` 衔接；需要单独安装和登录 |
| [ValvePython/steamctl](https://github.com/ValvePython/steamctl) | Depot、Workshop、SteamID、Web API、TOTP、HL master | SteamID、Web API 直接实现；其余可交给已安装的 steamctl |
| [dmadisetti/steam-tui](https://github.com/dmadisetti/steam-tui) | SteamCMD 的安装、更新、启动界面 | 提供命令行分发与后端衔接，没有复刻 TUI |
| [Drackrath/Aurelia](https://github.com/Drackrath/Aurelia) | 无头下载、云同步、Workshop、好友聊天、Proton、合集、运行时 | 常用 Web 和账号能力直接实现；深层下载、同步和运行时管理通过 Aurelia 后端 |

## 直接实现

| 能力 | 命令 | 说明 |
| --- | --- | --- |
| 浏览器 Cookie | `login --browser`、`--profile` | 九种浏览器名称；操作系统和加密支持有边界 |
| Cookie 文件 | `login --cookie-file`、`--cookie-stdin` | JSON、Netscape、请求头 |
| Steam 手机登录 | `login --qr` | 获取客户端及 Web 登录态，需要用户扫码 |
| 搜索、目录、榜单 | `search`、`browse`、`deals`、`featured` | StoreQuery 与旧接口适配 |
| 游戏资料 | `app`、`store-item`、`package`、`dlc`、`media`、`similar` | 原始 Steam 字段和来源 |
| 当前及地区价格 | `price --compare` | 原币种，未做汇率换算 |
| 历史及跨店报价 | `history`、`cross-store` | 依赖 IsThereAnyDeal API Key |
| 社区评价与评分 | `reviews`、`store-item` | 旧 JSON 失效可切社区来源；字段差异明确标注 |
| 本人评测 | `review list/get/create/edit/delete/vote` | 默认预览；编辑先核验记录，仅传修改字段，再读回 |
| 游戏库与时长 | `games`、`recent` | 原始分钟值及换算小时；私密资料需权限 |
| 成就和统计 | `achievements`、`stats` | 全球与个人区分；部分接口需要 Web API Key |
| 资料与 SteamID | `user`、`resolve` | vanity、个人地址、SteamID2/3/64 |
| 愿望单和库存 | `wishlist`、`inventory` | 实际写入须 `--execute`；库存使用游标 |
| 市场 | `market search/price/listings` | 不提供自动买卖下单 |
| 工坊 | `workshop browse/info/subscribe/unsubscribe` | 下载可衔接后端 |
| 评论 | `comment list/create` | 资料、工坊、评测评论区 |
| 云存档 | `cloud list/download` | 下载不覆盖既有文件，暂不直接实现上传与双向同步 |
| 客户端 | `appinfo`、`friends`、`chat`、`licenses`、`playtime idle` | 需要扫码客户端登录；不绕过私密资料或游戏授权 |
| 本地游戏 | `local libraries/installed/play/install/verify/uninstall` | 目录查询直接读取；启动和安装等交给 Steam 客户端 |
| 接入与导出 | `mcp`、`serve`、`skill install`、SDK、`--format` | 写入默认预览；REST 只监听本机 |

## 后端保留能力

`steam-cli backend NAME -- ...` 对后端参数做进程级转发，不拼接 shell 命令。支持 `steamcmd`、`steamctl`、`aurelia`，可用 `config set NAME_path PATH` 指定程序。

后端不存在时返回 `DEPENDENCY_MISSING`。预览返回 `installed=false`；CLI 不会自动下载后端或安装游戏。后端进程退出码为零只代表程序成功退出，不能当作游戏安装、云同步或账号修改已经读回核验。当前本机已安装三种后端并验证启动入口，后端自己的账号登录和实际内容操作未测试。

## 尚未原生实现或充分验证

- 云存档上传、双向冲突同步、Collections 云同步。
- Depot CDN 下载、断点恢复、降级、分支切换、安装移动和 relink。
- Proton／Wine／umu／Luxtorpeda 运行时及自定义启动脚本管理。
- Steam Guard TOTP、交易报价、自动市场买卖、开发者上传、HL master 协议。
- 图遍历、资源 URI driver、TUI 和全部第三方 CLI 的交互模式。
- Windows App-Bound Encryption 的解密绕过；不提供绕过实现。
- 所有操作系统、浏览器组合的真实账号测试，以及真实账号写入测试。

这些项目没有被标注为已完成。对任何 Steam CLI 新版本的新增功能，也不能作永久全覆盖承诺。
