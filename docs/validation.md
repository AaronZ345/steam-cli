# 验证记录

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
