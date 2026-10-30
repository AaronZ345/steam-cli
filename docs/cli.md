# 命令参考

通用参数：`--json`、`--format table|json|jsonl|csv|tsv|markdown|url`、`--output PATH`、`--fields a,b`、`--cc CN`、`--lang schinese`、`--timeout MS`、`--rate-ms MS`。

写命令默认预览；`--execute` 实际执行，`--dry-run` 明确预览，两者不能同时使用。`--help` 列出每个命令的具体参数。

| 命令 | 目标 | 类型 | 用途 |
| --- | --- | --- | --- |
| `steam-cli workshop query` | appid | 读取 | 按标签、排序和游标查询工坊，需要 Web API Key |
| `steam-cli local accounts` | 可选参数 | 读取 | 列出本机 Steam userdata 账号目录 |
| `steam-cli local games` | 可选参数 | 读取 | 按名称、大小、分页读取本地安装记录 |
| `steam-cli local game` | appid | 读取 | 本地游戏安装、构建和下载清单详情 |
| `steam-cli local status` | 可选参数 | 读取 | Steam 进程状态和下载队列快照 |
| `steam-cli local progress` | appid | 读取 | 指定游戏的下载字节数和进度 |
| `steam-cli local disk-report` | 可选参数 | 读取 | 安装、兼容前缀、着色器与工坊占用明细 |
| `steam-cli local orphans` | 可选参数 | 读取 | 查找未安装游戏遗留的缓存与兼容数据 |
| `steam-cli local cleanup-plan` | 可选参数 | 读取 | 清理建议及可释放缓存大小，标明潜在存档 |
| `steam-cli local saves` | 可选参数 | 读取 | 列出本地 Steam Cloud 存档及占用 |
| `steam-cli local saves-backup` | 可选参数 | 写入，默认预览 | 备份本地云存档至新目录并核对 |
| `steam-cli local launch-options` | appid | 读取 | 读取指定游戏启动参数 |
| `steam-cli local set-launch-options` | appid | 写入，默认预览 | 备份并修改启动参数，要求客户端退出 |
| `steam-cli local settings` | 可选参数 | 读取 | 读取允许公开的客户端设置项 |
| `steam-cli shortcuts list` | 可选参数 | 读取 | 读取本机非 Steam 游戏快捷方式 |
| `steam-cli shortcuts add` | 可选参数 | 写入，默认预览 | 保留未知 VDF 字段、备份后添加非 Steam 快捷方式 |
| `steam-cli shortcuts remove` | shortcut-appid | 写入，默认预览 | 按 appid 删除一个本机快捷方式并保留备份 |
| `steam-cli workshop installed` | 可选参数 | 读取 | 读取已安装工坊内容、清单版本和大小 |
| `steam-cli proton versions` | 可选参数 | 读取 | 本地 Proton/Steam Linux Runtime 及游戏映射 |
| `steam-cli proton info` | appid | 读取 | 游戏兼容工具、前缀大小和 Windows 注册表版本 |
| `steam-cli proton games` | 可选参数 | 读取 | 列出使用兼容前缀或兼容工具的已装游戏 |
| `steam-cli proton rating` | appid | 读取 | 读取 ProtonDB 社区兼容评分 |
| `steam-cli proton recommend` | appid | 读取 | 根据本机运行时和社区评分列出兼容工具候选 |
| `steam-cli diagnostics logs` | 可选参数 | 读取 | 读取指定类型 Steam 日志尾部并脱敏 |
| `steam-cli game wiki` | appid | 读取 | 读取 PCGamingWiki 游戏修复条目与章节 |
| `steam-cli game hltb` | 可选参数 | 读取 | 按游戏名查 HowLongToBeat 通关时长 |
| `steam-cli ref id` | reference | 读取 | 离线解析 Steam URL 和 steam:// 资源 URI |
| `steam-cli ref steamid` | steamid | 读取 | 离线转换 SteamID2/3/64 |
| `steam-cli resource read` | reference | 读取 | 通过 Steam URL 或资源 URI 读取对象 |
| `steam-cli crawl` | reference | 读取 | 有界遍历游戏、DLC、Demo、套餐和工坊合集关系 |
| `steam-cli library stats` | 可选参数 | 读取 | 完整游戏库数量、已玩/未玩、总时长汇总 |
| `steam-cli library search` | 可选参数 | 读取 | 在个人游戏库按名称或缩写搜索 |
| `steam-cli library unplayed` | 可选参数 | 读取 | 读取个人游戏库未游玩游戏 |
| `steam-cli library random` | 可选参数 | 读取 | 随机选择个人游戏库中的一款游戏 |
| `steam-cli library compare` | comma-separated-appids | 读取 | 比较多款游戏的价格、平台、配置和类别 |
| `steam-cli library value` | 可选参数 | 读取 | 按地区现价估算库中游戏价格，按币种分别求和 |
| `steam-cli insights completion` | 可选参数 | 读取 | 按游戏汇总个人成就完成度 |
| `steam-cli insights perfect` | 可选参数 | 读取 | 查找成就全部完成的游戏 |
| `steam-cli insights timeline` | 可选参数 | 读取 | 按最近游玩月份分组，不将终身时长误作月度时长 |
| `steam-cli insights year` | 可选参数 | 读取 | 指定年份最近游玩游戏的统计快照 |
| `steam-cli insights history` | 可选参数 | 读取 | 已安装与已卸载游戏的完整终身时长记录 |
| `steam-cli wishlist details` | 可选参数 | 读取 | 愿望单附带当前价格和折扣 |
| `steam-cli wishlist deals` | 可选参数 | 读取 | 筛选愿望单中正在打折的游戏 |
| `steam-cli player summary` | comma-separated-users | 读取 | 批量玩家资料、在线状态及当前游戏，需要 Web API Key |
| `steam-cli player groups` | 可选参数 | 读取 | 玩家群组 |
| `steam-cli player badge-progress` | 可选参数 | 读取 | 社区徽章任务进度 |
| `steam-cli player shared-game` | appid | 读取 | 检查玩家当前游戏是否通过家庭共享 |
| `steam-cli game schema` | appid | 读取 | 游戏成就与统计定义 |
| `steam-cli game global-stats` | appid | 读取 | 游戏全局累计统计，需要 Web API Key |
| `steam-cli game update-check` | appid | 读取 | 检查指定游戏版本是否为最新 |
| `steam-cli servers address` | address | 读取 | 查询指定 IP 地址的 Steam 游戏服务器 |
| `steam-cli economy items` | appid | 读取 | 读取 TF2/CS2/Dota 等经济物品接口，需要 Web API Key |
| `steam-cli trade list` | 可选参数 | 读取 | 交易报价列表、描述和游标，需要 Web API Key |
| `steam-cli trade get` | tradeofferid | 读取 | 按交易报价 ID 读取完整详情 |
| `steam-cli trade summary` | 可选参数 | 读取 | 待处理交易数量汇总 |
| `steam-cli trade history` | 可选参数 | 读取 | 已完成交易历史及后续游标 |
| `steam-cli coverage` | 可选参数 | 读取 | 逐项展示固定 MCP 源码版本的功能映射与未齐项 |
| `steam-cli local store-page` | appid | 写入，默认预览 | 预览或在 Steam 客户端打开游戏商店页面 |
| `steam-cli guard code` | 可选参数 | 读取 | 从权限受限的 maFile/shared-secret 文件生成 Steam Guard 代码，不输出原始密钥 |
| `steam-cli servers master` | 可选参数 | 读取 | 分页查询 Valve HL2 Master Server，限制结果数量 |
| `steam-cli assets validate` | 可选参数 | 读取 | 检查商店图片结构、尺寸、格式及透明通道 |
| `steam-cli assets audit` | 可选参数 | 读取 | 按文件名前缀核查素材目录、必需槽位和成就图标配对 |
| `steam-cli publisher asset-upload` | appid | 写入，默认预览 | 预览或保存 Steamworks 商店图片，不发布页面 |
| `steam-cli sdk guide` | lobby|workshop|trailer | 读取 | 输出 Lobby/Workshop/Trailer 集成步骤，明确不会执行 SDK |
| `steam-cli depots` | appid | 读取 | 读取 PICS Depot 和分支清单 |
| `steam-cli content manifest` | appid | 读取 | 读取和解密 Depot 文件清单，不暴露密钥 |
| `steam-cli content download` | appid | 写入，默认预览 | 下载指定 Depot 清单，断点恢复并核对 SHA1 |
| `steam-cli content verify` | appid | 读取 | 逐文件校验本地 Depot 大小与 SHA1 |
| `steam-cli cloud files` | appid | 读取 | 通过 Steam 客户端协议分页读取云存档元信息 |
| `steam-cli cloud fetch` | appid | 写入，默认预览 | 通过客户端协议下载并校验云存档 SHA1 |
| `steam-cli cloud upload` | appid | 写入，默认预览 | 分块传输云存档、提交一次并读回 SHA1 |
| `steam-cli cloud delete` | appid | 写入，默认预览 | 删除一个云存档并读回核验 |
| `steam-cli cloud sync` | appid | 写入，默认预览 | 有基线的双向存档同步，冲突即停，不自动删除 |
| `steam-cli local move` | appid | 写入，默认预览 | 校验内容后将游戏移至已登记的 Steam 库 |
| `steam-cli local presets` | 可选参数 | 读取 | 查看可用启动参数预设 |
| `steam-cli local apply-preset` | appid | 写入，默认预览 | 备份后应用一个启动参数预设 |
| `steam-cli local mangohud` | 可选参数 | 读取 | 读取 MangoHud 配置 |
| `steam-cli local set-mangohud` | 可选参数 | 写入，默认预览 | 备份后写入 MangoHud 配置 |
| `steam-cli shortcuts import-lutris` | 可选参数 | 写入，默认预览 | 从 Lutris 只读 SQLite 库或 JSON 导出导入快捷方式 |
| `steam-cli collections list` | 可选参数 | 读取 | 读取旧版 sharedconfig 合集标签，标明非现代合集 |
| `steam-cli collections set` | 可选参数 | 写入，默认预览 | 备份后更新旧版合集标签，不自动云同步 |
| `steam-cli proton crash-logs` | appid | 读取 | 读取指定游戏的 Proton 日志尾部 |
| `steam-cli publisher ownership` | appid | 读取 | Steamworks 游戏所有权查询，需要发行商密钥 |
| `steam-cli publisher betas` | appid | 读取 | 查询开发者 App 测试分支 |
| `steam-cli publisher builds` | appid | 读取 | 查询开发者 App 构建记录 |
| `steam-cli leaderboards list` | appid | 读取 | Steamworks 排行榜列表，需要发行商密钥 |
| `steam-cli leaderboards entries` | appid | 读取 | Steamworks 排名条目与玩家附近排名 |
| `steam-cli leaderboards score` | appid | 写入，默认预览 | 发行商设置排行榜分数，提交一次并读回 |
| `steam-cli publisher achievement` | appid | 写入，默认预览 | 发行商设置或清除成就并读回，需要 App 权限 |
| `steam-cli publisher grant` | appid | 写入，默认预览 | 发行商授予游戏物品，需要非零幂等 requestid |
| `steam-cli publisher workshop-update` | publishedfileid | 写入，默认预览 | 发行商修改工坊条目元信息，不上传文件 |
| `steam-cli financial changed` | 可选参数 | 读取 | 获取有销售数据变更的日期及后续水位 |
| `steam-cli financial sales` | 可选参数 | 读取 | 完整分页汇总最多 31 天销售，十进制定点美元 |
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
