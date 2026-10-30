# MCP 逐项对照

盘点日期：2026-10-30。功能映射不等于字段完全等价或真实写入验收通过；参见 [验证记录](validation.md)。

- [Praeses0/steam-mcp](https://github.com/Praeses0/steam-mcp/tree/8b7307a5ec845612e9e2e58bd23135b6563ec154)：69 项，源码版本 `8b7307a5ec845612e9e2e58bd23135b6563ec154`。
- [sharkusmanch/steam-mcp-server](https://github.com/sharkusmanch/steam-mcp-server/tree/ce8c8d60ffeb7701b50b102c8d11fe6afe7b9c78)：34 项，源码版本 `ce8c8d60ffeb7701b50b102c8d11fe6afe7b9c78`。
- [TMHSDigital/Steam-MCP](https://github.com/TMHSDigital/Steam-MCP/tree/fce291842eb162bc241f63228dc1c29b7202860c)：42 项，源码版本 `fce291842eb162bc241f63228dc1c29b7202860c`。

native 为直接实现入口，partial 有差异，client-dispatch 交给 Steam 客户端，guide 只输出集成步骤。后端转发没有归入 native。

| 来源功能点 | 对应操作 | 类型 | 边界 |
| --- | --- | --- | --- |
| Praeses0/steam-mcp / deals.check_sale | `price` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / deals.wishlist_deals | `wishlist.deals` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / deals.wishlist | `wishlist.details` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / deals.library_value | `library.value` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / diagnostics.compat_log | `diagnostics.logs` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / diagnostics.shader_log | `diagnostics.logs` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / game_config.get_launch_opts | `local.launch-options` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / game_config.set_launch_opts | `local.set-launch-options` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / game_config.presets | `local.presets` | partial | 已有八个显式替换预设；不自动合并已有 shell 片段。 |
| Praeses0/steam-mcp / game_config.mangohud | `local.set-mangohud` | partial | 可读取和备份写入完整配置；未实现逐项设置和 reset 语法。 |
| Praeses0/steam-mcp / game_config.steam_settings | `local.settings` | partial | 只返回白名单设置，避免导出认证字段。 |
| Praeses0/steam-mcp / game_control.install | `local.install` | client-dispatch | 交给本机 Steam 客户端；不表示安装/校验已经完成。 |
| Praeses0/steam-mcp / game_control.uninstall | `local.uninstall` | client-dispatch | 交给本机 Steam 客户端；不表示安装/校验已经完成。 |
| Praeses0/steam-mcp / game_control.launch | `local.play` | client-dispatch | 交给本机 Steam 客户端；不表示安装/校验已经完成。 |
| Praeses0/steam-mcp / game_control.verify | `local.verify` | client-dispatch | 交给本机 Steam 客户端；不表示安装/校验已经完成。 |
| Praeses0/steam-mcp / game_control.move | `local.move` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / game_control.store_page | `local.store-page` | client-dispatch | 交给本机 Steam 客户端；不表示安装/校验已经完成。 |
| Praeses0/steam-mcp / game_info.reviews | `reviews` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / game_info.news | `news` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / game_info.media | `media` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / game_info.hltb | `game.hltb` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / game_info.pcgamingwiki | `game.wiki` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / games.list | `local.games` | partial | 本地安装读取、大小/名称排序已有；离线全库时长排序未齐。 |
| Praeses0/steam-mcp / games.get | `local.game` | partial | 本地清单详情已有；不包含全部 Proton/远端融合字段。 |
| Praeses0/steam-mcp / games.search | `library.search` | partial | 支持个人库缩写搜索和本地名称/首字母检索；完整远端库需认证。 |
| Praeses0/steam-mcp / games.compare | `library.compare` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / games.random | `library.random` | partial | 从已拥有的完整远端游戏库随机选择；远端库需认证。 |
| Praeses0/steam-mcp / games.unplayed | `library.unplayed` | partial | 远端游戏库未玩筛选已有；离线库的时长不完整时不推断为未玩。 |
| Praeses0/steam-mcp / insights.completion | `insights.completion` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / insights.timeline | `insights.timeline` | partial | 最近游玩月份快照；不将终身时长伪装成月度时长。 |
| Praeses0/steam-mcp / insights.year_review | `insights.year` | partial | 最近游玩年份快照；没有 Steam 年度回顾的会话时长数据。 |
| Praeses0/steam-mcp / insights.play_history | `insights.history` | partial | 终身时长与安装状态；不声称拥有逐次会话历史。 |
| Praeses0/steam-mcp / insights.export | `games` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / library.list | `local.libraries` | partial | 库目录可读取；缺少离线盘挂载状态和完整分区容量。 |
| Praeses0/steam-mcp / library.stats | `local.disk-report` | partial | 安装占用可统计；未复刻原工具离线时长和所有排行字段。 |
| Praeses0/steam-mcp / player.summary | `player.summary` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / player.level | `level` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / player.bans | `bans` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / player.friends | `friends.list` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / player.achievements | `achievements` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / player.global_achievements | `achievements` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / player.schema | `game.schema` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / player.owned | `games` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / player.recent | `recent` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / proton.list_games | `proton.games` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / proton.info | `proton.info` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / proton.versions | `proton.versions` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / proton.db_rating | `proton.rating` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / proton.recommend | `proton.recommend` | partial | 提供已安装版本和社区评分候选；缺少完整硬件/驱动规则。 |
| Praeses0/steam-mcp / proton.prefix | `proton.info` | partial | 读取前缀大小及 Windows 版本；不包含全部 Wine 注册表摘要。 |
| Praeses0/steam-mcp / proton.crash_logs | `proton.crash-logs` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / shortcuts.list | `shortcuts.list` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / shortcuts.add | `shortcuts.add` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / shortcuts.remove | `shortcuts.remove` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / shortcuts.import_lutris | `shortcuts.import-lutris` | native | 读取 Lutris pga.db 中已安装游戏，或 JSON 导出；不执行 runner 配置。 |
| Praeses0/steam-mcp / steam_status.status | `local.status` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / steam_status.queue | `local.status` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / steam_status.progress | `local.progress` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / storage.disk_report | `local.disk-report` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / storage.orphaned | `local.orphans` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / storage.cleanup | `local.cleanup-plan` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / storage.shader_cache | `local.disk-report` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / storage.shader_stats | `local.disk-report` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / storage.saves_list | `local.saves` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / storage.saves_stats | `local.saves` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / storage.backup | `local.saves-backup` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / workshop.list | `workshop.installed` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / workshop.stats | `workshop.installed` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| Praeses0/steam-mcp / workshop.search | `workshop.browse` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_player_summary | `player.summary` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_friends_list | `friends.list` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_steam_level | `level` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / resolve_vanity_url | `resolve` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_owned_games | `games` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_recently_played | `recent` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_game_details | `app` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_achievements | `achievements` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_game_stats | `stats` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_global_achievement_percentages | `achievements` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_perfect_games | `insights.perfect` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_achievement_summary | `insights.completion` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_inventory | `inventory` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_tf2_inventory | `economy.items` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_csgo_inventory | `economy.items` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_dota2_inventory | `economy.items` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_badges | `badges` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_player_bans | `bans` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_game_news | `news` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_player_count | `players` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_game_schema | `game.schema` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_user_groups | `player.groups` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_badge_progress | `player.badge-progress` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / is_playing_shared_game | `player.shared-game` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_global_game_stats | `game.global-stats` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / search_apps | `search` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_servers_at_address | `servers.address` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / check_app_update | `game.update-check` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_wishlist | `wishlist.list` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_wishlist_item_count | `wishlist.list` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_trade_offers | `trade.list` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_trade_offers_summary | `trade.summary` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_trade_history | `trade.history` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| sharkusmanch/steam-mcp-server / get_trade_offer | `trade.get` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_checkAppOwnership | `publisher.ownership` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_clearAchievement | `publisher.achievement` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_compareApps | `library.compare` | partial | 比较价格、配置、类别等；尚未复刻全部社区/媒体融合字段。 |
| TMHSDigital/Steam-MCP / steam_createLobby | `sdk.guide` | guide | SDK 集成步骤，不执行 SDK。 |
| TMHSDigital/Steam-MCP / steam_getAchievementStats | `achievements` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getAppBetas | `publisher.betas` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getAppBuilds | `publisher.builds` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getAppDetails | `app` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getAppReviewSummary | `store-item` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getChangedSalesDates | `financial.changed` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getDeckCompatibility | `store-item` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getFeatured | `featured` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getGlobalStatsForGame | `game.global-stats` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getInventory | `inventory` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getLeaderboardEntries | `leaderboards.entries` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getLeaderboardsForGame | `leaderboards.list` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getNewsForApp | `news` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getOwnedGames | `games` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getPlayerAchievements | `achievements` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getPlayerBans | `bans` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getPlayerCount | `players` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getPlayerSummary | `player.summary` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getPriceOverview | `price` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getRegionalPricing | `price` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getReviews | `reviews` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getSalesSummary | `financial.sales` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getSchemaForGame | `game.schema` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getUserStatsForGame | `stats` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_getWorkshopItem | `workshop.info` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_grantInventoryItem | `publisher.grant` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_partnerLogin | `publisher.asset-upload` | partial | 上传支持独立 Partner Cookie 文件；尚无交互式 Partner 浏览器登录。 |
| TMHSDigital/Steam-MCP / steam_queryWorkshop | `workshop.query` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_resolveVanityURL | `resolve` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_searchApps | `search` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_setAchievement | `publisher.achievement` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_updateWorkshopItem | `publisher.workshop-update` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_uploadLeaderboardScore | `leaderboards.score` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_uploadStoreImage | `publisher.asset-upload` | native | 功能入口直接实现；实际验收边界见 validation.md。 |
| TMHSDigital/Steam-MCP / steam_uploadTrailer | `sdk.guide` | guide | SDK 集成步骤，不执行 SDK。 |
| TMHSDigital/Steam-MCP / steam_uploadWorkshopItem | `sdk.guide` | guide | SDK 集成步骤，不执行 SDK。 |
| TMHSDigital/Steam-MCP / steam_validateStoreAsset | `assets.validate` | partial | 实现结构、尺寸、格式和透明通道；未实现图像内容启发式。 |
| TMHSDigital/Steam-MCP / steam_validateStoreAssetDir | `assets.audit` | partial | 目录槽位和成就图标配对已有；不判断文字/拼接线等视觉内容。 |
