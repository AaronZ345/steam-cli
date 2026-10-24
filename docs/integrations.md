# MCP、REST 和 SDK

CLI、MCP 和 REST 共享 `service.ts` 的操作表；`steam-cli capabilities --json` 给出当前完整清单。写操作默认预览，只有布尔参数 `execute=true` 才执行。

## MCP

stdio 配置示例：

```json
{
  "mcpServers": {
    "steam": { "command": "steam-cli", "args": ["mcp"] }
  }
}
```

```bash
steam-cli mcp --transport streamable-http --port 7732
```

HTTP 地址是 `http://127.0.0.1:7732/mcp`，采用无会话模式。只接收本机 Host 和 Origin。stdio 的 stdout 专用于协议，诊断信息在 stderr。

工具名采用 `steam_` 加操作名，点和连字符转为下划线，例如 `steam_review_get`、`steam_review_edit`。操作目标 ID 使用 `target`，评测修改字段使用 `changes`：

```json
{
  "target": "620",
  "changes": { "text": "正文", "recommend": true },
  "execute": false
}
```

所有工具返回包含 `ok` 的 JSON 文本；工具失败设置 `isError=true`。调用方必须检查业务结果中的 `accepted` 和 `verified`。

## REST

```bash
steam-cli serve --port 7731
curl http://127.0.0.1:7731/v1/capabilities
curl 'http://127.0.0.1:7731/v1/app?target=620'
curl 'http://127.0.0.1:7731/v1/games?limit=10'
curl -X POST http://127.0.0.1:7731/v1/review.edit \
  -H 'Content-Type: application/json' \
  -d '{"target":"620","changes":{"recommend":true},"execute":false}'
```

读操作可用 GET 或 POST；写操作仅接受 POST。无效请求或操作失败返回 HTTP 400 和 `ok=false`。REST 服务使用启动账号可读取的本地登录缓存，适合可信本机程序调用，不应通过转发代理暴露到公网。

## SDK

```js
import { run, Client, Store, Community, Reviews } from '@aaronz345/steam-cli';

const game = await run('app', { target: '620' }, { cc: 'CN', lang: 'schinese' });
const client = new Client({ country: 'CN' });
try {
  const games = await new Community(client).games('me', { limit: 10 });
  const preview = await new Reviews(client).edit(620, { recommend: true }, true);
} finally {
  await client.close();
}
```

`run` 自动关闭 HTTP dispatcher。直接构造 `Client` 时应在 `finally` 中关闭；不要输出 `client.session`。

## 原始接口

```bash
steam-cli api ISteamNews GetNewsForApp --api-version v2 --params '{"appid":620,"count":2}' --json
steam-cli request GET https://store.steampowered.com/api/appdetails --params '{"appids":620}' --json
```

原始 HTTP 仅允许官方 Steam HTTPS 主机。认证 Cookie 按域名选择；Web API 密钥从 `STEAM_WEB_API_KEY` 读取。非 GET/HEAD 请求须显式 `--execute`，不自动重试。
