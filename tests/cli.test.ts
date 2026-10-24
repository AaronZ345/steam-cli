import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, chmodSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const source = path.resolve(import.meta.dirname, "../src/cli.ts"),
  loader = path.resolve(
    import.meta.dirname,
    "../node_modules/tsx/dist/loader.mjs",
  );
const temp = mkdtempSync(path.join(os.tmpdir(), "steam-cli-command-"));
chmodSync(temp, 0o700);
test.after(() => rmSync(temp, { recursive: true, force: true }));
const env = {
  ...process.env,
  STEAM_CLI_HOME: temp,
  STEAM_WEB_API_KEY: "",
  STEAM_REFRESH_TOKEN: "",
  ITAD_API_KEY: "",
};
function command(args: string[]): any {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", loader, source, "--json", ...args],
      { env, cwd: os.tmpdir(), encoding: "utf8", timeout: 10000 },
    ),
  );
}
test("root and nested help discover command families from a different directory", () => {
  const result = execFileSync(
    process.execPath,
    ["--import", loader, source, "--help"],
    { env, cwd: os.tmpdir(), encoding: "utf8" },
  );
  for (const name of [
    "review",
    "wishlist",
    "achievements",
    "playtime",
    "market",
    "backend",
    "mcp",
  ])
    assert(result.includes(name));
  const nested = execFileSync(
    process.execPath,
    ["--import", loader, source, "review", "edit", "--help"],
    { env, cwd: os.tmpdir(), encoding: "utf8" },
  );
  assert(nested.includes("--execute"));
  assert(nested.includes("--recommend"));
  assert(nested.includes("--file"));
});
test("doctor runs offline with no credentials and returns pure JSON", () => {
  const result = command(["doctor"]);
  assert.equal(result.ok, true);
  assert.equal(result.data.auth.logged_in, false);
  assert.equal(result.data.network_checked, false);
});
test("invalid command exits nonzero and has a machine readable error", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", loader, source, "--json", "not-a-command"],
    { env, cwd: os.tmpdir(), encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.equal(result.stderr, "");
});
test("write preview needs no account mutation or network connection", () => {
  const result = command([
    "playtime",
    "idle",
    "620",
    "--minutes",
    "1",
    "--dry-run",
  ]);
  assert.equal(result.data.dry_run, true);
  assert.equal(result.data.minutes, 1);
  assert.equal(
    command([
      "backend",
      "steamcmd",
      "--",
      "+login",
      "anonymous",
      "+app_info_print",
      "620",
      "+quit",
    ]).data.dry_run,
    true,
  );
});
