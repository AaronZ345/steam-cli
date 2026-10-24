import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { get } from "node:http";
import { mkdtempSync, rmSync, chmodSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const temp = mkdtempSync(path.join(os.tmpdir(), "steam-cli-server-"));
chmodSync(temp, 0o700);
test.after(() => rmSync(temp, { recursive: true, force: true }));
async function start(
  args: string[],
): Promise<{ url: string; close: () => Promise<void> }> {
  const loader = path.resolve(
    import.meta.dirname,
    "../node_modules/tsx/dist/loader.mjs",
  );
  const source = path.resolve(import.meta.dirname, "../src/cli.ts");
  const child = spawn(
    process.execPath,
    ["--import", loader, source, ...args, "--port", "0"],
    {
      env: { ...process.env, STEAM_CLI_HOME: temp },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("server startup timed out"));
    }, 10000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}`));
    });
    child.stderr.on("data", (chunk) => {
      const match = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(
        chunk.toString(),
      );
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  return {
    url,
    close: async () => {
      const done = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
      await done;
      clearTimeout(timer);
    },
  };
}
test("REST exposes reads and preview writes, rejects GET writes and foreign Hosts", async () => {
  const server = await start(["serve"]);
  try {
    const doctor = (await (
      await fetch(server.url + "/v1/doctor")
    ).json()) as any;
    assert.equal(doctor.ok, true);
    assert.equal(doctor.data.auth.logged_in, false);
    const preview = (await (
      await fetch(server.url + "/v1/playtime.idle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "620", minutes: 1 }),
      })
    ).json()) as any;
    assert.equal(preview.data.dry_run, true);
    assert.equal(
      (await fetch(server.url + "/v1/playtime.idle?target=620&minutes=1"))
        .status,
      400,
    );
    const foreignHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        get(
          server.url + "/v1/doctor",
          { headers: { Host: "evil.test" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        ).once("error", reject);
      },
    );
    assert.equal(foreignHost, 400);
  } finally {
    await server.close();
  }
});
test("Streamable HTTP MCP initializes and calls a tool across requests", async () => {
  const server = await start(["mcp", "--transport", "streamable-http"]);
  const client = new Client({ name: "http-fixture", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url + "/mcp")),
    );
    const result = (await client.callTool({
      name: "steam_doctor",
      arguments: {},
    })) as any;
    assert.equal(
      JSON.parse(result.content[0].text).data.network_checked,
      false,
    );
  } finally {
    await client.close();
    await server.close();
  }
});
