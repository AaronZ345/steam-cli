# 接口契约

## 来源

| 资源 | 来源 | 认证与分页 |
| --- | --- | --- |
| 游戏详情、价格、DLC、套餐 | Steam Store `api/appdetails`、`api/dlcforapp`、`api/packagedetails` | 公开；国家和语言参数 |
| 商店结构化数据 | `IStoreBrowseService/GetItems`、`IStoreQueryService/SearchSuggestions`、`Query` | 公开；`input_json`；目录有 offset |
| 新闻、在线人数、全球成就 | `ISteamNews`、`ISteamUserStats` | 公开 |
| 评价 | [官方 appreviews 文档](https://partner.steamgames.com/doc/store/getreviews) | cursor 由 URLSearchParams 编码一次 |
| 评价后备 | Steam Community app hub `homecontent` | 公开；userreviewsoffset；返回 community 游标 |
| 游戏库、最近游玩、个人成就 | `IPlayerService`、`ISteamUserStats`，社区页面 | token、API Key 或可见社区资料；不可绕过私密性 |
| 个人评测 | [UserReviews 协议定义](https://github.com/SteamDatabase/Protobufs/blob/master/webui/service_userreviews.proto)、社区 recommended 页面 | 原始正文优先 API；网页用作读取后备 |
| 愿望单 | `IWishlistService/GetWishlist` | 公开性限制；写入使用商店 Cookie 和 sessionid |
| 库存 | Community `inventory/STEAMID/APPID/CONTEXT` | start_assetid 游标、more_items |
| 工坊条目 | `ISteamRemoteStorage/GetPublishedFileDetails` | POST 是只读查询；不自动重试 |
| 云存档 | Store `account/remotestorageapp` | 本人 Cookie；下载地址只在内部使用 |
| 历史价格 | [IsThereAnyDeal API](https://docs.isthereanydeal.com/) | 独立 `ITAD_API_KEY`；不向其发送 Steam Cookie |
| 客户端协议 | [node-steam-user](https://github.com/DoctorMcKay/node-steam-user)、[steam-session](https://github.com/DoctorMcKay/node-steam-session) | 单独客户端 refresh token；禁用自动重新登录 |

商店和社区中未正式文档化的接口可能变更；格式不匹配时返回解析错误，不输出编造数据。

## 评测编辑

提交到 Steam 自身页面脚本使用的 `https://steamcommunity.com/userreviews/update/RECOMMENDATIONID`。

| CLI 字段 | POST 字段 |
| --- | --- |
| text / file | review_text |
| recommend | voted_up |
| public | is_public |
| comments | comments_disabled，取反 |
| language | language |
| received-free | received_compensation |

请求只带指定字段和当前域的 `sessionid`。编辑前读取本人 appid 对应记录，核验作者和推荐 ID；提交一次，成功后再次读取并逐字段比较。创建用商店 `friends/recommendgame`，已有评测时拒绝创建。删除用本人 recommended 操作并读回检查不存在。

源码会保留 Steam BBCode 文本。若仅能读取渲染后的网页而没有原始正文，编辑推荐状态等独立字段仍只传相应字段，不将渲染文本重新写回。

## 错误和限流

默认请求间隔 600ms，HTTP 超时 20 秒。GET/HEAD 在 429 或 5xx 时至多重试一次，Retry-After 大于 5 秒时直接退出；写入不自动重试。遇到 401/403、登录页重定向或失败的 `x-eresult` 返回明确错误。

`WRITE_UNKNOWN` 表示未能确定提交结果，需要读回核实。`AUTH_FAILED` 表示认证失败，`ACCESS_DENIED` 表示资料或权限不可访问，`RATE_LIMITED` 表示限流，`PAGINATION_ERROR` 表示分页异常。

## 输出

CLI `--json` 返回统一 envelope；SDK 返回 data 本身，抛出 `CliError`。MCP 的文本结果和 REST 返回相同 envelope。字段原样传递时标明 Steam 来源；CLI 整理的集合使用 `items`。未知值为 `null`，不把不可见当作零。

导出文件使用创建模式，权限 `0600`，目标已存在时拒绝覆盖。Cookie、API Key 和 token 字段在输出时脱敏。
