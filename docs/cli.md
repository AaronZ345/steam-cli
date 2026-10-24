# 命令参考

通用参数：`--json`、`--format table|json|jsonl|csv|tsv|markdown|url`、`--output PATH`、`--fields a,b`、`--cc CN`、`--lang schinese`、`--timeout MS`、`--rate-ms MS`。

写命令默认预览；`--execute` 实际执行，`--dry-run` 明确预览，两者不能同时使用。`--help` 列出每个命令的具体参数。

| 命令 | 目标 | 类型 | 用途 |
| --- | --- | --- | --- |
| `steam-cli search` | 可选参数 | 读取 | 搜索 Steam 游戏名称 |
| `steam-cli browse` | 可选参数 | 读取 | 分页浏览商店目录 |
| `steam-cli app` | appid | 读取 | 游戏详情、发行信息、配置需求和售价 |
| `steam-cli appinfo` | appid | 读取 | 客户端 PICS 元数据、depots、branches、launch 配置 |
| `steam-cli store-item` | appid | 读取 | StoreBrowse 评分、标签、Deck 兼容性及购买选项 |
| `steam-cli price` | appid | 读取 | 当前价格与地区比价，保留原币种 |
| `steam-cli history` | appid | 读取 | IsThereAnyDeal 历史价格，需要 ITAD_API_KEY |
| `steam-cli cross-store` | appid | 读取 | 跨店当前报价，需要 ITAD_API_KEY |
| `steam-cli deals` | 可选参数 | 读取 | 优惠、畅销、新游和即将推出列表 |
| `steam-cli featured` | 可选参数 | 读取 | 商店特色栏目 |
| `steam-cli dlc` | appid | 读取 | 游戏 DLC 列表 |
| `steam-cli media` | appid | 读取 | 封面、截图和预告片 |
| `steam-cli similar` | appid | 读取 | 相似游戏 |
| `steam-cli package` | package-id | 读取 | 套餐详情 |
| `steam-cli reviews` | appid | 读取 | 游戏社区评价、汇总评分、游标分页 |
| `steam-cli news` | appid | 读取 | 游戏新闻公告 |
| `steam-cli events` | 可选参数 | 读取 | Steamworks 即将举行的活动日历 |
| `steam-cli players` | appid | 读取 | 当前在线人数 |
| `steam-cli achievements` | appid | 读取 | 全球成就或指定用户成就 |
| `steam-cli stats` | appid | 读取 | 用户游戏统计 |
| `steam-cli user` | 可选参数 | 读取 | 用户资料 |
| `steam-cli resolve` | user | 读取 | 解析 SteamID、vanity 和个人资料地址 |
| `steam-cli games` | 可选参数 | 读取 | 游戏库和时长，支持筛选排序 |
| `steam-cli recent` | 可选参数 | 读取 | 最近游玩记录 |
| `steam-cli friends list` | 可选参数 | 读取 | 好友列表 |
| `steam-cli friends add` | steamid64 | 写入，默认预览 | 发送好友申请 |
| `steam-cli friends remove` | steamid64 | 写入，默认预览 | 移除好友 |
| `steam-cli chat history` | steamid64 | 读取 | 读取好友聊天历史 |
| `steam-cli chat send` | steamid64 | 写入，默认预览 | 发送好友消息，默认预览 |
| `steam-cli wishlist list` | 可选参数 | 读取 | 读取愿望单 |
| `steam-cli wishlist add` | appid | 写入，默认预览 | 加入愿望单 |
| `steam-cli wishlist remove` | appid | 写入，默认预览 | 移出愿望单 |
| `steam-cli review list` | 可选参数 | 读取 | 用户评测列表 |
| `steam-cli review get` | appid | 读取 | 读取个人完整评测和推荐状态 |
| `steam-cli review edit` | appid | 写入，默认预览 | 编辑本人评测，保留未指定字段，提交后读回 |
| `steam-cli review create` | appid | 写入，默认预览 | 创建本人评测 |
| `steam-cli review delete` | appid | 写入，默认预览 | 删除本人评测 |
| `steam-cli review vote` | review-id | 写入，默认预览 | 评价投票或有趣标记 |
| `steam-cli inventory` | 可选参数 | 读取 | 库存物品和描述，支持分页 |
| `steam-cli market search` | 可选参数 | 读取 | 社区市场搜索 |
| `steam-cli market price` | appid | 读取 | 市场物品最低价、中位价和成交量 |
| `steam-cli market listings` | 可选参数 | 读取 | 本人市场挂单及买单 |
| `steam-cli workshop info` | file-id | 读取 | 创意工坊条目及合集详情 |
| `steam-cli workshop browse` | appid | 读取 | 分页浏览创意工坊 |
| `steam-cli workshop subscribe` | file-id | 写入，默认预览 | 订阅创意工坊条目 |
| `steam-cli workshop unsubscribe` | file-id | 写入，默认预览 | 取消创意工坊订阅 |
| `steam-cli comment list` | owner-id | 读取 | 读取个人资料、评测或工坊评论 |
| `steam-cli comment create` | owner-id | 写入，默认预览 | 发表个人资料、评测或工坊评论 |
| `steam-cli cloud list` | appid | 读取 | 列出 Steam Cloud 文件 |
| `steam-cli cloud download` | appid | 写入，默认预览 | 下载一个云存档到指定文件，不覆盖已有文件 |
| `steam-cli badges` | 可选参数 | 读取 | 用户徽章 |
| `steam-cli bans` | 可选参数 | 读取 | 公开封禁状态 |
| `steam-cli level` | 可选参数 | 读取 | Steam 等级 |
| `steam-cli licenses list` | 可选参数 | 读取 | 客户端账号许可证和钱包信息 |
| `steam-cli licenses free` | appid | 写入，默认预览 | 领取免费游戏许可证 |
| `steam-cli playtime idle` | appid | 写入，默认预览 | 限时运行 gamesPlayed 状态，结束自动清理 |
| `steam-cli local libraries` | 可选参数 | 读取 | 本地 Steam 游戏库目录及剩余空间 |
| `steam-cli local installed` | 可选参数 | 读取 | 读取本地安装清单 |
| `steam-cli local backends` | 可选参数 | 读取 | 外部后端依赖状态 |
| `steam-cli local play` | appid | 写入，默认预览 | 交给 Steam 客户端启动游戏 |
| `steam-cli local install` | appid | 写入，默认预览 | 交给 Steam 客户端安装游戏 |
| `steam-cli local verify` | appid | 写入，默认预览 | 交给 Steam 客户端校验游戏 |
| `steam-cli local uninstall` | appid | 写入，默认预览 | 交给 Steam 客户端卸载游戏 |
| `steam-cli auth status` | 可选参数 | 读取 | 本地登录状态，不联系 Steam |
| `steam-cli doctor` | 可选参数 | 读取 | 诊断运行环境、配置、认证和后端 |

## 登录与工具

登录：`login --browser NAME [--profile PROFILE]`、`login --cookie-file PATH`、`login --cookie-stdin`、`login --qr`。另有 `logout`、`browsers`、`auth verify`。

配置：`config show`、`config set KEY VALUE`。允许 country、language、steam_path、steamcmd_path、steamctl_path、aurelia_path。修改配置的命令会返回文件路径与修改项。

接口：`api INTERFACE METHOD --params JSON`、`request METHOD URL --params JSON`。原始写入须 `--execute`。

后端：`backend steamcmd|steamctl|aurelia [--execute] -- ARGS`。`--` 后是后端参数，全局选项应放在前面。

接入：`mcp`、`mcp --transport streamable-http --port 7732`、`serve --port 7731`、`skill install`。

## 分页与筛选

- `search QUERY --limit N --offset N`：名称搜索最多前 100 项。
- `games --query TEXT --sort playtime|name --limit N`：游戏库筛选。
- `reviews APPID --type all|positive|negative --filter all|recent|updated --language all --limit N --max-pages N --cursor CURSOR`：评价游标分页。默认最多一页；后备社区来源不支持 purchase-type 过滤。
- `inventory --appid ID --context ID --limit N --cursor CURSOR`：库存游标。
- `review list --page N`、`workshop browse APPID --page N`：页码。
- `market search --query TEXT --appid ID --limit N --offset N`：市场搜索。

## 错误

`AUTH_REQUIRED` 缺少认证；`AUTH_FAILED` 认证失败；`ACCESS_DENIED` 权限或可见性限制；`NOT_FOUND` 目标不存在；`RATE_LIMITED` 限流；`PARSE_ERROR` 返回格式变化；`PAGINATION_ERROR` 分页异常；`WRITE_UNKNOWN` 写入结果未知；`DEPENDENCY_MISSING` 缺少外部后端。

失败退出码为 1。JSON 错误写 stdout，普通错误写 stderr。没有结果只在能确认查询成功时返回空集合。
