# 功能覆盖

版本 0.2.1，盘点于 2026-10-30。159 个共享操作。实现、模拟测试和真实账号验收分别记录，后端转发不算原生实现。

## MCP 源码对照

[逐项覆盖表](parity.md) 和 [机器可读清单](parity.json) 固定了三个源码版本，共 145 个功能点：118 项有直接实现入口，19 项有明确差异，5 项交给本机 Steam 客户端，3 项输出 SDK 集成步骤。这些数量表示映射类型，不表示全部字段等价或每项均已通过真实写入验收。

源码实际注册了 Praeses 69 个 action、sharkusmanch 34 个 tool、TMHS 42 个 tool；与项目 README 的宣传计数可能不同。`steam-cli coverage --json` 可读取相同清单，回归测试检查每条映射均指向真实操作。

## CLI 与后端对照

| 来源 | 对应能力与差异 |
| --- | --- |
| [tamnd/steam-cli](https://github.com/tamnd/steam-cli/tree/36c8ca826ac829148479d39b4be816fd6ba4f01f) | 商店、社区、格式、REST、MCP、SteamID、资源 URI、有界图遍历均有实现。图遍历目前覆盖 App/DLC/Demo/套餐/工坊合集，不包含全部评价作者与新闻关系；未复制模板输出或所有交互形式。 |
| [nickxudotme/steam-cli](https://github.com/nickxudotme/steam-cli/tree/0c52c37fbdf70a33378d7d41b7b0072545650c9f) | 商店、地区价格、评价、媒体、DLC、活动、资料、愿望单、ITAD 历史/跨店查询已有。未完整复刻全部媒体探测、商店筛选、别名、双语 UI 与 ITAD 商店筛选。 |
| [SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD) | Depot 清单/下载/恢复/SHA1 校验新增原生入口；安装、更新和开发者命令仍可显式衔接已安装的 SteamCMD。 |
| [ValvePython/steamctl](https://github.com/ValvePython/steamctl) | SteamID、Web API、Guard 代码、HL2 Master 查询已有直接实现；其余特殊命令仍可转发后端。 |
| [Drackrath/Aurelia](https://github.com/Drackrath/Aurelia) | 新增直接云上传与有基线的冲突同步、Depot、快捷方式、Proton 读取和旧版合集标签。本工具仍未原生复刻现代 Collections 云同步、全部运行时管理、重链接、分支切换和自定义脚本管理。 |
| [steam-tui](https://github.com/dmadisetti/steam-tui) | 启动、安装、校验、卸载可交给本机 Steam 客户端或后端；没有复刻 TUI。 |

## 本轮直接增加

- 完整库统计、缩写搜索、未玩/随机游戏、游戏比较、按币种分别估算库现价、愿望单折扣。
- 成就完成度、完美游戏、最近游玩月份/年份快照。快照明确不等同于逐月或逐次会话时长。
- 玩家群组、徽章任务、家庭共享状态、全局统计、经济物品、交易报价和历史查询。
- 本地下载进度、占用与遗留数据、带内容校验的存档备份、游戏移动、启动参数和预设、MangoHud、快捷方式、Lutris 只读数据库/JSON 导入。
- Proton 版本、映射、前缀、日志、ProtonDB、PCGamingWiki、HowLongToBeat。
- Depot 清单、下载、恢复及逐文件 SHA1 校验；云存档协议读写、提交后读回和冲突同步。
- Steamworks 构建/分支/所有权、排行榜、发行商成就/物品/工坊修改、销售报表、素材检查及保存。
- 原生 MCP Resources 与 `steam://` 模板；新操作的参数定义在 CLI、SDK、MCP、REST 共用。

## 仍有边界

Cloud 协议文件支持最大 256 MiB；加密文件明确返回不支持，上传使用不加密传输配置。同步没有自动删除或无人确认的冲突覆盖。Depot 默认总量上限 20 GiB，可显式调整；拒绝目录穿越和符号链接。移动仅支持已登记的目标库，不移动工坊内容；Steam 必须退出。

合集修改仅处理旧版 sharedconfig 标签，输出 `modern_collections=false`、`cloud_synced=false`。开发者 API 需要发行商权限和 IP 放行，不能代替普通用户的自有成就读取。素材检查不判断文字、Logo 布局等内容合规；JPEG 只检查结构头和尺寸，不解码全部像素。Lobby、Workshop 创建和 Trailer 仍是 SDK/网页工作流指引，绝不报告已上传或已创建。

新增 Steam App CEF Cookie 来源，支持显式安装目录和 profile；macOS 实机已发现数据库，但钥匙串尚未授权解密。浏览器适配保留原有九种浏览器和 profile 选择；Windows App-Bound Encryption 等系统限制不绕过。跨系统浏览器和真实写入的验收状态见 [validation.md](validation.md)。
