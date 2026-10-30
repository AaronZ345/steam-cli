import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { assert, errorPayload, redact } from "./core.js";
import { operations, run, capabilities } from "./service.js";
import { argumentSchema } from "./arguments.js";
import { VERSION } from "./version.js";

export function mcpServer(): McpServer {
  const server = new McpServer({ name: "steam-cli", version: VERSION });
  server.registerResource(
    "capabilities",
    "steam-cli://capabilities",
    { mimeType: "application/json" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(capabilities()),
        },
      ],
    }),
  );
  for (const kind of ["app", "package", "bundle", "user", "workshop"])
    server.registerResource(
      `steam-${kind}`,
      new ResourceTemplate(`steam://${kind}/{id}`, { list: undefined }),
      { mimeType: "application/json" },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              redact(await run("resource.read", { target: uri.href })),
            ),
          },
        ],
      }),
    );
  for (const [name, op] of Object.entries(operations)) {
    server.registerTool(
      `steam_${name.replaceAll(".", "_").replaceAll("-", "_")}`,
      {
        description:
          op.description +
          (op.write ? "；默认预览，execute=true 才实际执行。" : ""),
        inputSchema: {
          ...(op.target
            ? { target: z.string().describe(op.target) }
            : { target: z.string().optional() }),
          query: z.string().optional(),
          user: z.string().optional(),
          sort: z.string().optional(),
          limit: z.number().int().min(1).max(10000).optional(),
          offset: z.number().int().min(0).optional(),
          page: z.number().int().min(1).optional(),
          cursor: z.string().optional(),
          compare: z.string().optional(),
          filter: z.string().optional(),
          type: z.string().optional(),
          language: z.string().optional(),
          purchaseType: z.string().optional(),
          maxPages: z.number().int().min(1).max(100).optional(),
          name: z.string().optional(),
          appid: z.number().int().optional(),
          context: z.string().optional(),
          feature: z.string().optional(),
          currency: z.number().int().optional(),
          minutes: z.number().int().min(1).max(1440).optional(),
          days: z.number().int().optional(),
          out: z.string().optional(),
          text: z.string().optional(),
          changes: z
            .object({
              text: z.string().optional(),
              recommend: z.boolean().optional(),
              public: z.boolean().optional(),
              comments: z.boolean().optional(),
              language: z.string().optional(),
              receivedFree: z.boolean().optional(),
            })
            .optional(),
          cc: z.string().optional(),
          lang: z.string().optional(),
          up: z.boolean().optional(),
          funny: z.boolean().optional(),
          client: z.boolean().optional(),
          network: z.boolean().optional(),
          verifyLogin: z.boolean().optional(),
          ...(op.write ? { execute: z.boolean().default(false) } : {}),
          ...argumentSchema(op.options ?? []),
        },
        annotations: {
          readOnlyHint: !op.write,
          destructiveHint: /delete|remove|uninstall/.test(name),
          idempotentHint: !op.write,
          openWorldHint: true,
        },
      },
      async (params: any) => {
        try {
          const data = redact(await run(name, params, params));
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ ok: true, data }),
              },
            ],
          };
        } catch (e) {
          return {
            isError: true,
            content: [
              { type: "text" as const, text: JSON.stringify(errorPayload(e)) },
            ],
          };
        }
      },
    );
  }
  return server;
}
async function body(req: IncomingMessage): Promise<any> {
  let text = "";
  for await (const chunk of req) {
    text += chunk.toString();
    assert(
      Buffer.byteLength(text) <= 1024 * 1024,
      "INVALID_ARGUMENT",
      "请求正文过大",
    );
  }
  return text ? JSON.parse(text) : {};
}
function localRequest(req: IncomingMessage): boolean {
  const host = req.headers.host || "";
  return (
    /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) &&
    (!req.headers.origin ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin))
  );
}
function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(redact(data)));
}
export async function serve(port = 7731, mcp = false): Promise<void> {
  const http = createServer(async (req, res) => {
    try {
      assert(localRequest(req), "ACCESS_DENIED", "仅允许本机来源");
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (mcp) {
        assert(
          url.pathname === "/mcp" && req.method === "POST",
          "INVALID_ARGUMENT",
          "Streamable HTTP 使用 POST /mcp",
        );
        const server = mcpServer(),
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, await body(req));
        return;
      }
      if (url.pathname === "/v1/capabilities" && req.method === "GET") {
        json(res, 200, { ok: true, data: capabilities() });
        return;
      }
      const operation = url.pathname.replace(/^\/v1\//, ""),
        op = operations[operation];
      assert(op, "NOT_FOUND", "未找到操作；查看 GET /v1/capabilities");
      assert(
        req.method === "POST" || (req.method === "GET" && !op.write),
        "INVALID_ARGUMENT",
        "写操作仅接受 POST",
      );
      const params: any =
        req.method === "POST"
          ? await body(req)
          : Object.fromEntries(url.searchParams);
      for (const name of [
        "limit",
        "offset",
        "page",
        "maxPages",
        "minutes",
        "days",
        "currency",
        "appid",
      ])
        if (typeof params[name] === "string")
          params[name] = Number(params[name]);
      for (const name of ["network", "verifyLogin", "client", "funny", "up"])
        if (typeof params[name] === "string") {
          assert(
            ["true", "false"].includes(params[name]),
            "INVALID_ARGUMENT",
            `${name} 必须为 true|false`,
          );
          params[name] = params[name] === "true";
        }
      json(res, 200, { ok: true, data: await run(operation, params, params) });
    } catch (e) {
      if (!res.headersSent) json(res, 400, errorPayload(e));
      else res.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, "127.0.0.1", resolve);
  });
  const address = http.address();
  const boundPort =
    typeof address === "object" && address ? address.port : port;
  process.stderr.write(
    `steam-cli ${mcp ? "MCP" : "REST"} listening on http://127.0.0.1:${boundPort}${mcp ? "/mcp" : "/v1/capabilities"}\n`,
  );
  const close = () => http.close();
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
export async function mcp(transport = "stdio", port = 7732): Promise<void> {
  assert(
    ["stdio", "streamable-http"].includes(transport),
    "INVALID_ARGUMENT",
    "transport 支持 stdio|streamable-http",
  );
  if (transport === "stdio")
    await mcpServer().connect(new StdioServerTransport());
  else await serve(port, true);
}
