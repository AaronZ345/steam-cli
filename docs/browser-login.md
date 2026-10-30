# 浏览器与 Steam App 登录

先运行 `steam-cli browsers --json`，再精确选择登录来源。工具读取当前用户的本机浏览器 Cookie，不打开或修改日常浏览器资料。

| 浏览器 | macOS | Windows | Linux | profile |
| --- | --- | --- | --- | --- |
| Chrome、Edge、Chromium、Brave | 支持 | 支持，有系统加密限制 | 支持 | 名称、目录或数据库路径 |
| Vivaldi、Opera | 支持 | 支持，有系统加密限制 | 支持 | 名称、目录或数据库路径 |
| Arc | 支持 | 支持，有系统加密限制 | 不支持 | 名称、目录或数据库路径 |
| Firefox | 支持 | 支持 | 支持 | 名称、目录或数据库路径 |
| Safari | 支持，需要系统允许读取 | 不支持 | 不支持 | 不支持 profile 选择 |

“支持”表示代码具备该系统的定位与读取适配；本次真实账号实测仅涵盖 macOS Chrome。合成测试验证了浏览器路径与 Chromium CBC 解密，不能等同于所有系统均已登录实测。

```bash
steam-cli login --browser chrome --profile Default
steam-cli login --browser brave --profile "Profile 1"
steam-cli login --browser firefox --profile /absolute/profile/path
steam-cli auth status --json
steam-cli auth verify --json
```

只读取 `steamLoginSecure`、`sessionid`、地区和年龄偏好 Cookie，并按域名发送。来自不同账号的 Cookie 不合并。登录成功前先核验 SteamID，核验失败不覆盖已有缓存。

macOS 使用系统 Keychain，Linux 使用对应 keyring 工具，Windows 使用受系统允许的解密方式。Windows App-Bound Encryption、Linux 缺少 keyring、Keychain 拒绝访问或 Safari 权限限制可能导致读取失败；请根据返回错误使用扫码或文件导入。

```bash
steam-cli login --cookie-file /private/path/cookies.json
steam-cli login --cookie-file /private/path/cookies.txt
steam-cli login --cookie-stdin < /private/path/cookie-header.txt
steam-cli login --qr
```

JSON 支持 Cookie 数组或包含 `cookies` 数组的 storage state，按 `domain`、`path`、`expires` 筛选。Netscape 支持 `#HttpOnly_` 前缀。单行请求头没有 domain 信息，导入时明确用于 Steam 社区和商店两个站点。

没有 profile 时默认使用所选浏览器的默认来源；多账号场景应显式指定 profile。Safari 不支持 profile 参数，当前版本对该参数返回错误。

## Steam App 来源

```bash
steam-cli auth steam-client --json
steam-cli login --steam-client --json
steam-cli login --steam-client --steam-path /path/to/Steam --profile Default --json
```

`auth steam-client` 默认仅发现数据库来源，不读取解密材料或更新缓存；其共享操作通过 `--execute` 才导入。显式 `login --steam-client` 则直接读取、核验并导入。可以用 profile 名称、目录或数据库路径精确选择，不能与外部浏览器、扫码和 Cookie 文件来源混用。

macOS 默认从系统钥匙串的 `Chromium Safe Storage` 项目读取解密材料，CEF 使用自定义 service 时可指定 `--keychain-service`。钥匙串拒绝访问返回 `KEYCHAIN_ACCESS_DENIED`，不切换到其他来源，也不修改系统权限。Linux 使用 basic/keyring CBC；Windows 使用当前用户的 DPAPI/GCM，App-Bound v20 明确不支持。

只查询 Steam 域名下规定的登录 Cookie，过滤过期和第三方分区记录；读取不修改 Steam 数据库。先拒绝混合账号和已知过期 token，通过社区账号核验后才更新本工具缓存。同账号既有客户端凭据会保留。Steam App Cookie 提供 Web 会话，客户端协议凭据仍独立管理。当前实机状态见[验证记录](validation.md)。

## 存储和配置

默认路径是 `~/.config/steam-cli/`，可由 `STEAM_CLI_HOME` 指定独立目录。

- `session.json`：AES-256-GCM 加密 Cookie 和可选客户端 refresh token。
- `cache.key`：本机随机缓存密钥，权限 `0600`。
- `config.json`：仅保存本工具国家、语言、本地 Steam 路径和后端路径。

目录权限为 `0700`，不接受符号链接缓存文件。加密缓存和密钥保存在同一用户目录，能读取整个目录的进程仍可解密。`steam-cli logout` 删除本工具登录缓存及密钥；不会从浏览器退出 Steam。

读取认证状态的输出仅包含账号 ID、来源、时间和权限类别。不要把缓存内容、Cookie 或 token 发给其他人。
