# 验证记录

## 0.2.4 — 2026-10-31

新增四项合成回归：XDG 符号链接与常规路径合并同一数据库、不同资料继续拒绝自动选择、空明文和空 BLOB／NULL 保留未登录诊断、CBC 解密得到空值时跳过并保留有效登录 Cookie，以及损坏密文继续返回解密失败。新用例先在 0.2.3 复现三个失败，修复后浏览器导入的九项测试通过。验证只使用临时目录和合成 SQLite，不读取真实浏览器、钥匙串或账号。

`npm run verify` 的 lint、类型检查、66 项测试和构建全部通过。`npm run package:smoke` 验证 0.2.4 干净安装、159 个共享操作及 CLI／SDK／MCP／REST 调用，发行包依赖审计为零漏洞。

## 0.2.3 — 2026-10-31

对照旧豆瓣 0.4.0+chromium.6 源码，补齐 Linux 的 XDG 与常规根目录回退，以及 Profile N 元数据发现。合成测试覆盖重定向根目录、唯一 Profile N 自动选择、多资料拒绝、跨根目录同名资料拒绝及显式路径选择。`npm run verify`（lint/typecheck、62 项测试、build）以及独立干净安装的 CLI/SDK/MCP/REST 包冒烟全部通过，159 个操作及零漏洞审计通过。当前原生终端重现旧路径探测仍未发现已登录资料；真实账号导入等待该浏览器的明确 profile 路径，不将路径修复与在线登录成功混同。

## 0.2.2 — 2026-10-31

云端 Linux / Node.js 24.22.1：`npm run verify`（lint、typecheck、60 项合成测试、build）通过。新增测试覆盖缺失资料的安全诊断、显式资料与 Cookies 文件选择、嵌套 Default 隔离，以及 Linux/macOS 不支持加密在请求密钥前拒绝。测试 runner 改用 `node --import tsx --test`，避免 tsx CLI 的 IPC 管道依赖。

独立发行包干净安装、159 个操作、CLI / SDK / MCP / REST 冒烟及零漏洞审计通过。云端 wrapper 报告 0.2.2；标准 Chromium 来源导入返回 `BROWSER_COOKIE_IMPORT_FAILED` / `PROFILE_NOT_FOUND`。网页登录与 CLI 可读浏览器资料分离，尚无受支持的会话传递或已知可读 profile 路径；本轮未完成真实账号导入，未改写登录缓存，不将合成测试当作真实账号验收。

## 0.2.1 — 2026-10-30

新增 Steam App Cookie 导入的八项测试：来源发现及 profile 隔离、仅选 Steam 字段、过滤过期/分区 Cookie、macOS CBC 和 host hash、拒绝钥匙串后保留缓存、Linux basic CBC、Windows GCM/当前用户密钥解包、App-Bound 拒绝、核验后保存与同账号凭据保留、过期及多账号拒绝、CLI 来源冲突与预览。全套共 57 项，lint、类型检查、测试和构建均通过。发行包干净安装后 CLI 跨目录调用、SDK 导入、MCP 的 159 个工具和 Steam App 来源预览均通过；源码及发行包审计为零漏洞，依赖树检查通过。Windows/Linux 密码格式测试使用模拟材料，未在对应系统的真实 Steam 安装上验收。

本机只读检查已找到 Steam 正在使用的 CEF Cookie 数据库，schema 23，商店及社区的登录 Cookie 为 v10 加密。系统钥匙串读取返回认证失败（security 退出码 51），已立即报告；没有继续扫描其他钥匙串或其他浏览器，没有更新旧缓存，没有修改 Steam 配置或系统权限。真实解密及账号在线核验待系统授权。

## 0.2.0 — 2026-10-30

`npm run verify` 包含 lint、TypeScript 类型检查、49 项测试与构建。测试使用虚构账号、临时目录、模拟 HTTP/客户端传输和本机临时服务，未修改真实 Steam 配置。

新增测试覆盖文本/二进制 VDF 保真、参数校验、备份与并发拒绝、快捷方式未知字段、库间移动、Lutris SQLite 只读导入、旧版合集、图遍历边界、Depot 路径拒绝与下载恢复、Cloud 传输/提交顺序和冲突、成就未知状态、过期 token 提前拒绝、发行商参数、销售定点金额、工坊标签/游标、Guard/UDP 编解码、素材结构校验、MCP 参数和资源模板，以及 145 条功能映射的完整性。

本轮实际只读查询通过：本机安装库、下载队列、资源 URI 的 Portal 2 商店详情、ProtonDB 评分、PCGamingWiki 页面、HowLongToBeat 搜索。HowLongToBeat 与 Wiki 按实时接口变更修正后复测通过。

账号实时验收遇到过期缓存 token（过期时间 2026-10-25）。Chrome 默认资料未找到可用 Cookie；原缓存保留，没有覆盖。账号库统计/完成度的本轮在线验收未通过，不能沿用旧记录宣称本轮成功；代码现在会在发送已过期 token 前返回 `AUTH_FAILED`，doctor 显示过期状态。

尚未以真实账号执行评测/评论/愿望单/好友写入、游戏下载与移动、云上传与同步、发行商写入及素材上传。缺少客户端登录或发行商密钥时不进行替代验证。协议上传和下载的模拟测试不能等同于真实 CDN、分支权限和全部 Cloud 文件格式的验收。

源目录完成 `npm ci --ignore-scripts` 重建；构建后 `npm ls --omit=dev --all` 无无效依赖，`npm audit --omit=dev` 为零漏洞。独立临时项目安装 0.2.0 发行包后，同样通过依赖树与审计检查。安装后的版本、帮助、doctor、158 个操作和 145 条覆盖清单均从 `/tmp` 调用通过；安装包 SDK、MCP stdio/资源模板、REST 读取及模拟预览均通过。源码还通过 MCP Streamable HTTP 测试。全局 `steam-cli --version` 为 0.2.0，Skill 已更新并通过格式校验。0.1.0 的旧记录如下，保留其日期边界。

## 0.1.0 — 2026-10-25

日期：2026-10-25。环境：macOS arm64，Node.js 26.12.0。Node.js 最低声明版本为 22.13.0；本次没有在其他 Node 版本或其他操作系统上实机运行。

## 自动检查

`npm run verify` 包含 ESLint、TypeScript 检查、26 项自动测试和构建，全部通过。

测试覆盖：

- 登录缓存加密、权限、篡改拒绝，SteamID 和 Cookie 导入。
- Cookie 域隔离、过期过滤、多账号拒绝、浏览器路径及 Chromium CBC 主机校验。
- 评测作者核验、仅提交指定字段、一次提交和读回比较。
- 写入失败不自动重试，登录重定向与 EResult 失败不视为空结果。
- 限流退出、评价游标只编码一次、重复游标拒绝和后备正文解析。
- 成就按 internal_key 合并、未知状态保留为 null、schema 变化拒绝。
- JSON/CSV 输出，根命令和子命令帮助，从其他目录调用，错误退出码。
- MCP 工具覆盖全部 65 个操作、默认写预览、协议初始化和错误结果。
- 本机 REST 读写约束、Host 校验，MCP Streamable HTTP 跨请求调用。

默认测试使用虚构数据，不读取真实浏览器或账号，不联系 Steam。MCP/REST 协议测试只连接临时本机服务。

## Steam 只读实测

| 项目 | 结果 |
| --- | --- |
| macOS Chrome Cookie 提取及账号核验 | 通过，保存加密登录态 |
| 新版 StoreQuery 名称搜索 | 通过 |
| 游戏详情及 CN、US 地区价格 | 通过 |
| 社区评价正文与汇总评分 | 通过，旧 JSON 接口重定向时使用明确标注的社区来源 |
| 游戏库、总时长及换算小时 | 通过 |
| 愿望单读取 | 通过 |
| 本人评测列表、完整原文和推荐状态 | 通过 |
| 本人评测编辑预览 | 通过，只预览推荐字段修改，没有提交 |
| 个人成就及名称说明 | 通过，使用新版 PlayerService 合并定义和用户状态 |
| 全球成就、新闻、在线人数、相似游戏、优惠列表 | 通过 |
| Steamworks 活动日历 | 通过 |
| 库存单页读取和本地安装清单 | 通过 |

## 安装和依赖

- `/opt/homebrew/bin/steam-cli` 已安装，从 `/tmp` 调用版本、帮助、诊断和编辑预览通过。
- Companion Skill 已安装至当前 Codex home，并通过 `skill-creator` 格式验证。
- 发行包包含编译结果、声明文件、技能、文档、许可、依赖锁及固定版本的 Steam 客户端运行依赖，不包含账号缓存、Cookie、浏览器数据库或测试导出。
- 使用 `npm-shrinkwrap.json` 和 bundledDependencies 固定修复后的客户端运行依赖；单靠源码 overrides 或 shrinkwrap 不能阻止消费项目重新解析不兼容的旧依赖范围。构建脚本同步调整打包副本中 steam-user 的 adm-zip 范围与 steam-appticket 的 protobufjs 范围，保留上游许可和修改说明。源码与干净安装的发行包分别运行依赖审计。
- SteamCMD 的 `+quit` 启动退出自检通过；steamctl 0.9.5 和 Aurelia 0.1.40 的版本及帮助入口通过。SteamCMD 自检会按自身默认设置写入 Steam 日志目录。

## 未测试的边界

没有提交真实评测、评论、愿望单修改、好友消息、许可证领取，也没有执行挂机、游戏下载、卸载、云存档上传或同步。以上写路径通过虚构数据检查，不能等同于真实账号成功。

没有完成 Steam 手机扫码认证、客户端游戏状态、全部浏览器及 Windows/Linux 登录实测。只有 Chrome 的本机 Cookie 路径经过真实账号验证。IsThereAnyDeal 路径依照官方接口定义实现，尚未配置真实 API Key 进行实测。

外部后端的启动成功不代表其全部业务命令已测试。当前版本仍有 [coverage.md](coverage.md) 所列的原生缺口和功能差异，不能称为市面上全部 Steam CLI 的功能等价替代。
