# Changelog

## 0.2.1 — 2026-10-30

- 新增 `login --steam-client`，读取 Steam CEF Cookie，核验账号后才更新加密缓存；保留同账号已有客户端凭据。
- 新增共享的 `auth.steam-client` 发现/导入操作与 doctor 来源诊断，操作总数为 159。
- 加入 macOS Keychain、Linux CBC 和 Windows 当前用户 DPAPI/GCM 适配；App-Bound v20 明确不支持。
- 新增八项认证回归测试，总计 57 项；实机解密仍受系统钥匙串授权阻挡，未标为真实登录成功。

## 0.2.0 — 2026-10-30

- 共享操作从 65 个扩展至 158 个；新增库统计、本地管理、Depot/Cloud、交易查询、Steamworks 与资源 URI。
- 冻结三套 MCP 源码的 145 条对照记录，逐项标明直接实现、差异、客户端分发和 SDK 指引。
- 新参数校验用于 CLI、SDK、MCP、REST；MCP 增加资源与 URI 模板。
- 以可保留字段和转义的文本/二进制 VDF 替换旧依赖；本地写入备份、并发拒绝，下载及备份校验内容。
- 修正 HLTB/Wiki 当前接口；提前拒绝已过期 Web token。
- 回归测试扩展到 49 项；真实账号写入与跨系统浏览器验收仍分开记录。

## 0.1.0 — 2026-10-25

- 新增 Steam 商店、游戏记录、评测、成就和社区查询命令。
- 新增多浏览器 Cookie、手机扫码和加密本地缓存。
- 新增评测创建、编辑、删除及预览和读回核验。
- 新增外部后端衔接、本地 Steam 安装清单、MCP、REST、SDK 和 Agent Skill。
- 验证范围及已知缺口见 `docs/validation.md` 与 `docs/coverage.md`。
