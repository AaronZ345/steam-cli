import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(import.meta.dirname, ".."),
  temp = mkdtempSync(path.join(os.tmpdir(), "steam-cli-package-")),
  consumer = path.join(temp, "consumer"),
  version = JSON.parse(readFileSync(path.join(root, "package.json"))).version;
assert(process.env.npm_execpath, "Run with npm run package:smoke");
const env = {
  ...process.env,
  STEAM_CLI_HOME: path.join(temp, "auth"),
  STEAM_WEB_API_KEY: "",
  STEAM_REFRESH_TOKEN: "",
  STEAM_PUBLISHER_API_KEY: "",
  STEAM_FINANCIAL_API_KEY: "",
  ITAD_API_KEY: "",
  STEAM_CLI_ITAD_KEY: "",
};
const npm = (args, cwd = root) =>
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
try {
  const packed = JSON.parse(
    npm(["pack", "--ignore-scripts", "--json", "--pack-destination", temp]),
  )[0];
  const forbidden =
    /(?:^|\/)(?:session\.json|cache\.key|Cookies|Login Data|\.env(?:\..*)?)$/;
  assert(
    !packed.files.some((f) => forbidden.test(f.path)),
    "Package contains a credential file",
  );
  assert(
    !packed.files.some((f) => /^(?:tmp|output|tests)\//.test(f.path)),
    "Package contains development exports",
  );
  mkdirSync(consumer);
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "steam-cli-install-check",
      private: true,
      type: "module",
    }),
  );
  npm(
    [
      "install",
      "--ignore-scripts",
      "--no-fund",
      "--no-audit",
      path.join(temp, packed.filename),
    ],
    consumer,
  );
  const audit = JSON.parse(npm(["audit", "--omit=dev", "--json"], consumer));
  assert.equal(audit.metadata.vulnerabilities.total, 0);
  npm(["ls", "--omit=dev", "--all"], consumer);
  const bin = path.join(
    consumer,
    "node_modules/@aaronz345/steam-cli/dist/cli.js",
  );
  const cli = (args) =>
    execFileSync(process.execPath, [bin, ...args], {
      cwd: temp,
      env,
      encoding: "utf8",
      timeout: 15000,
    });
  assert.equal(cli(["--version"]).trim(), version);
  assert(cli(["login", "--help"]).includes("--steam-client"));
  const doctor = JSON.parse(cli(["doctor", "--json"]));
  assert.equal(doctor.data.auth.logged_in, false);
  const caps = JSON.parse(cli(["capabilities", "--json"])).data;
  assert.equal(
    JSON.parse(cli(["ref", "id", "steam://app/620", "--json"])).data.id,
    "620",
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import assert from 'node:assert/strict';
    import {run, importSteamClient} from '@aaronz345/steam-cli';
    assert.equal(typeof importSteamClient,'function');
    assert.equal((await run('ref.id',{target:'steam://app/620'})).id,'620');
    assert.equal((await run('playtime.idle',{target:'620',minutes:1})).dry_run,true);
  `,
    ],
    { cwd: consumer, env, encoding: "utf8", timeout: 15000 },
  );
  const client = new Client({ name: "package-smoke", version: "1" }),
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin, "mcp"],
      cwd: temp,
      env,
      stderr: "pipe",
    });
  try {
    await client.connect(transport);
    assert.equal(
      (await client.listTools()).tools.length,
      caps.operations.length,
    );
    const preview = await client.callTool({
      name: "steam_auth_steam_client",
      arguments: { root: path.join(temp, "missing-steam") },
    });
    assert.equal(JSON.parse(preview.content[0].text).data.dry_run, true);
    const resource = await client.readResource({
      uri: "steam-cli://capabilities",
    });
    assert.equal(JSON.parse(resource.contents[0].text).version, version);
  } finally {
    await client.close();
  }
  const server = spawn(process.execPath, [bin, "serve", "--port", "0"], {
    cwd: temp,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("REST startup timed out")),
        15000,
      );
      server.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      server.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("REST exited before startup"));
      });
      server.stderr.on("data", (chunk) => {
        const found = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(
          chunk.toString(),
        );
        if (found) {
          clearTimeout(timer);
          resolve(found[1]);
        }
      });
    });
    const response = await fetch(
      url + "/v1/ref.id?target=steam%3A%2F%2Fapp%2F620",
    );
    assert.equal((await response.json()).data.id, "620");
  } finally {
    if (server.exitCode === null) {
      const done = once(server, "exit"),
        timer = setTimeout(() => server.kill("SIGKILL"), 2000);
      server.kill("SIGTERM");
      await done;
      clearTimeout(timer);
    }
  }
  console.log(
    JSON.stringify({
      version,
      operations: caps.operations.length,
      clean_install: true,
      vulnerabilities: 0,
      cli: true,
      sdk: true,
      mcp: true,
      rest: true,
    }),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
