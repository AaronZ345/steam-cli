import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  readChromiumCookies,
  resolveCookieDatabases,
} from "../src/browser-cookies.js";
import { sessionFromBrowserCookies } from "../src/auth.js";
import { CliError } from "../src/core.js";
const home = mkdtempSync(path.join(os.tmpdir(), "steam-browser-test-"));
test.after(() => rmSync(home, { recursive: true, force: true }));
const target = {
  platform: "linux" as const,
  home,
  env: { XDG_CONFIG_HOME: path.join(home, "config") },
};

test("missing browser profile is not misreported as a logged-out account", async () => {
  const result = await readChromiumCookies("chromium", undefined, 100, target);
  assert.deepEqual(result.issues, ["PROFILE_NOT_FOUND"]);
  assert.throws(
    () => sessionFromBrowserCookies(result, "chromium"),
    (error: unknown) => {
      assert(error instanceof CliError);
      assert.equal(error.code, "BROWSER_COOKIE_IMPORT_FAILED");
      assert.match(error.message, /--profile/);
      assert(!error.message.includes("--launch"));
      assert(!error.message.includes(home));
      return true;
    },
  );
});

test("explicit profile and database selection never merges nested Default", () => {
  const profile = path.join(home, "selected");
  mkdirSync(path.join(profile, "Default"), { recursive: true });
  writeFileSync(path.join(profile, "Cookies"), "fixture");
  writeFileSync(path.join(profile, "Default", "Cookies"), "fixture");
  assert.deepEqual(resolveCookieDatabases("chromium", profile, target), [
    { path: path.join(profile, "Cookies"), profile: "selected" },
  ]);
  assert.equal(
    resolveCookieDatabases("chromium", path.join(profile, "Cookies"), target)
      .length,
    1,
  );
  const root = path.join(home, "root");
  mkdirSync(path.join(root, "Default", "Network"), { recursive: true });
  writeFileSync(path.join(root, "Default", "Network", "Cookies"), "fixture");
  assert.equal(
    resolveCookieDatabases("chromium", root, target)[0].profile,
    "Default",
  );
});

test("unsupported encryption is distinguished from an empty signed-out profile", async () => {
  const file = path.join(home, "encrypted.sqlite");
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE meta(key TEXT,value TEXT); INSERT INTO meta VALUES('version','24'); CREATE TABLE cookies(host_key TEXT,name TEXT,value TEXT,encrypted_value BLOB,path TEXT,expires_utc INTEGER)",
  );
  db.prepare("INSERT INTO cookies VALUES(?,?,?,?,?,?)").run(
    ".steamcommunity.com",
    "steamLoginSecure",
    "",
    Buffer.from("v20synthetic-only"),
    "/",
    0,
  );
  db.close();
  const result = await readChromiumCookies(
    "chromium",
    file,
    100,
    target,
    async () => {
      throw new Error("must not request a key for unsupported encryption");
    },
  );
  assert.deepEqual(result.issues, ["COOKIE_FORMAT_UNSUPPORTED"]);
  const macResult = await readChromiumCookies(
    "vivaldi",
    file,
    100,
    { ...target, platform: "darwin" },
    async () => {
      throw new Error("must not request a key for unsupported encryption");
    },
  );
  assert.deepEqual(macResult.issues, ["COOKIE_FORMAT_UNSUPPORTED"]);
  assert.throws(
    () => sessionFromBrowserCookies(result, "chromium"),
    /不支持的加密格式/,
  );
  assert.throws(
    () =>
      sessionFromBrowserCookies(
        { cookies: [], warnings: [], issues: [] },
        "chromium",
      ),
    (e: unknown) => e instanceof CliError && e.code === "AUTH_REQUIRED",
  );
});

test("redirected XDG retains conventional home profiles and selects sole Profile N", () => {
  const isolatedHome = path.join(home, "xdg-fallback");
  const redirected = path.join(isolatedHome, "redirected");
  const profile = path.join(isolatedHome, ".config", "chromium", "Profile 2");
  mkdirSync(profile, { recursive: true });
  writeFileSync(path.join(profile, "Cookies"), "fixture");
  const env = {
    platform: "linux" as const,
    home: isolatedHome,
    env: { XDG_CONFIG_HOME: redirected },
  };
  assert.deepEqual(resolveCookieDatabases("chromium", undefined, env), [
    { path: path.join(profile, "Cookies"), profile: "Profile 2" },
  ]);
  const other = path.join(redirected, "chromium", "Default");
  mkdirSync(other, { recursive: true });
  writeFileSync(path.join(other, "Cookies"), "fixture");
  assert.throws(
    () => resolveCookieDatabases("chromium", undefined, env),
    (e: unknown) =>
      e instanceof CliError && e.code === "BROWSER_PROFILE_AMBIGUOUS",
  );
  assert.equal(resolveCookieDatabases("chromium", profile, env).length, 1);
});

test("named profiles duplicated across roots require an explicit path", () => {
  const h = path.join(home, "duplicate-names");
  const xdg = path.join(h, "xdg");
  for (const root of [xdg, path.join(h, ".config")]) {
    const p = path.join(root, "chromium", "Default");
    mkdirSync(p, { recursive: true });
    writeFileSync(path.join(p, "Cookies"), "fixture");
  }
  assert.throws(
    () =>
      resolveCookieDatabases("chromium", "Default", {
        platform: "linux",
        home: h,
        env: { XDG_CONFIG_HOME: xdg },
      }),
    (e: unknown) =>
      e instanceof CliError && e.code === "BROWSER_PROFILE_AMBIGUOUS",
  );
});
