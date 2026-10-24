import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync, chmodSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { mcpServer } from "../src/integrations.js";
import { operations } from "../src/service.js";

const temp = mkdtempSync(path.join(os.tmpdir(), "steam-cli-mcp-"));
chmodSync(temp, 0o700);
process.env.STEAM_CLI_HOME = temp;
test.after(() => rmSync(temp, { recursive: true, force: true }));
test("MCP protocol initializes, exposes every service operation and runs a safe preview", async () => {
  const server = mcpServer(),
    client = new Client({ name: "fixture-client", version: "1.0" });
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.listTools();
    assert.equal(result.tools.length, Object.keys(operations).length);
    const doctor = (await client.callTool({
      name: "steam_doctor",
      arguments: {},
    })) as any;
    assert.equal(
      JSON.parse(doctor.content[0].text).data.network_checked,
      false,
    );
    const idle = (await client.callTool({
      name: "steam_playtime_idle",
      arguments: { target: "620", minutes: 1 },
    })) as any;
    assert.equal(JSON.parse(idle.content[0].text).data.dry_run, true);
    const error = (await client.callTool({
      name: "steam_app",
      arguments: { target: "not-an-appid" },
    })) as any;
    assert.equal(error.isError, true);
    assert.equal(
      JSON.parse(error.content[0].text).error.code,
      "INVALID_ARGUMENT",
    );
  } finally {
    await client.close();
    await server.close();
  }
});
