---
name: steam-cli
description: 查询 Steam 游戏价格、评价、成就、游戏库和时长，读取本机浏览器登录态，编辑本人游戏评测，管理愿望单、库存、工坊和云存档；支持本地库、Depot 下载、云同步、Steamworks、MCP、REST 和 Steam 后端衔接。
metadata:
  origin: local
  owner: aaron
---

# Steam CLI

先检查 `command -v steam-cli` 和 `steam-cli doctor --json`。诊断默认只读本地元信息；`--network` 实测商店，`--verify-login` 核验账号。

## 查资料

游戏名称先用 `steam-cli search "游戏名" --json`，得到 appid 后再查：

```bash
steam-cli app 620 --json
steam-cli price 620 --compare CN,US,JP --json
steam-cli reviews 620 --limit 5 --json
```

`store-item` 包含汇总好评率、标签、购买选项、Steam Deck 信息；`achievements APPID` 是全球成就，`achievements APPID --user me` 是个人成就。`games --sort playtime --json` 读取游戏库和时长，分钟是原始单位，`playtime_hours` 是换算小时。

## 登录

`steam-cli login --browser chrome` 读取本机 Steam Cookie；支持 edge、chromium、brave、vivaldi、opera、arc、firefox、safari。`--profile` 精确选择账号资料。无法解密时保留错误，不读取别的浏览器冒充所选来源。

`login --cookie-file PATH` 接受 JSON、Netscape 文件或请求头；`--cookie-stdin` 接受管道。不要把 Cookie、密钥或密码写在命令行里，也不要输出缓存文件内容。

浏览器登录用于 Web 功能。客户端功能需要 `steam-cli login --qr`，由用户用 Steam 手机应用扫码；不要自行扫描或代替用户确认。Web API 的部分查询可使用环境变量 `STEAM_WEB_API_KEY`，历史价格需要 `ITAD_API_KEY`。

## 编辑

只有用户明确要求具体账号写操作时才提交。创建工具、检查代码或验证读取不等于授权发表评测、评论、好友消息、领取许可证或挂机。

```bash
steam-cli review get 620 --json
steam-cli review edit 620 --file review.txt --recommend yes --dry-run --json
steam-cli review edit 620 --file review.txt --recommend yes --execute --json
```

所有写命令默认预览，`--execute` 才执行。评测编辑须核验作者、appid、记录 ID，保留没有指定的字段。`accepted` 仅表示接收，`verified` 表示读回核对；结果未知时先读取，禁止自动重发。

## 分页和扩展

列表用 `--limit`、`--cursor`、`--offset` 或 `--page` 控制。`complete=false` 或非空 `next_cursor` 表示尚未读完。旧评价接口失效时可切换社区来源；缺失字段保持 `null`，不能编造成完整 API 数据。

高层命令缺字段时先看 `steam-cli capabilities --json`，再用 `steam-cli api INTERFACE METHOD --params '{}' --json` 或只读 `request GET URL`。HTTP 入口仅接受 Steam 官方域名。

`backend steamcmd|steamctl|aurelia -- ...` 默认预览。执行需要后端已安装和显式 `--execute`；这是后端衔接，不能表述成已实现或已验证全部原生功能。覆盖表见源码或安装包 `docs/coverage.md`。

认证失败立即汇报并停止相关账号写入。不要修改系统代理、DNS、hosts 或 Steam 客户端配置来通过验证。


## 本地与客户端功能

先用 `local accounts`、`local games` 确认目录和账号；多账号时显式 `--account`，指定安装目录用 `--root`。`local disk-report`、`local saves`、`local launch-options APPID` 都可读取本地资料。修改配置、快捷方式或移动游戏前预览，执行要求 Steam 退出，并保留工具返回的备份路径。

```bash
steam-cli local saves-backup --out /path/to/new-backup --dry-run --json
steam-cli insights completion --limit 50 --json
steam-cli cloud sync 620 --directory /path/to/saves --dry-run --json
```

`content download` 的 depot、manifest、out 都要显式提供；目录已存在时只允许匹配任务加 `--resume yes`。`cloud list/download` 是 Web 路径，`cloud files/fetch/upload/delete/sync` 是客户端协议，需要客户端登录。同步有冲突即停，不自动删除。遇到加密格式不支持，不把失败改成空成功。

开发者命令需要 `STEAM_PUBLISHER_API_KEY`，财务查询用 `STEAM_FINANCIAL_API_KEY`；不会因拥有普通游戏就自动获得发行商权限。`sdk guide` 只输出集成步骤，不能当作创建大厅、发布工坊或上传视频的成功记录。

用 `steam-cli coverage --json` 读取冻结版本的逐项差异。不能把直接实现入口、客户端分发、后端转发和 SDK 指引合并成“全部原生且已实测”。`doctor` 显示 Web token 已过期时先重新导入登录态，保留失败和旧缓存，不反复发送已知过期 token。
