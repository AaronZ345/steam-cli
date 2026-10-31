import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";
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

test("XDG aliases select one physical profile but still reject distinct profiles", () => {
  const h = path.join(home, "alias-roots");
  const config = path.join(h, ".config");
  const profile = path.join(config, "chromium", "Default");
  const redirected = path.join(h, "xdg");
  mkdirSync(profile, { recursive: true });
  writeFileSync(path.join(profile, "Cookies"), "fixture");
  symlinkSync(
    config,
    redirected,
    process.platform === "win32" ? "junction" : "dir",
  );
  const env = {
    platform: "linux" as const,
    home: h,
    env: { XDG_CONFIG_HOME: redirected },
  };
  for (const selection of [undefined, "Default"]) {
    const selected = resolveCookieDatabases("chromium", selection, env);
    assert.equal(selected.length, 1);
    assert.equal(
      realpathSync(selected[0].path),
      realpathSync(path.join(profile, "Cookies")),
    );
  }
  const other = path.join(config, "chromium", "Profile 2");
  mkdirSync(other);
  writeFileSync(path.join(other, "Cookies"), "fixture");
  assert.throws(
    () => resolveCookieDatabases("chromium", undefined, env),
    (e: unknown) => {
      assert(e instanceof CliError);
      assert.equal(e.code, "BROWSER_PROFILE_AMBIGUOUS");
      assert.deepEqual(e.details, { profiles_found: 2 });
      return true;
    },
  );
});

function cookieFixture(name: string) {
  const file = path.join(home, name);
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE meta(key TEXT,value TEXT); INSERT INTO meta VALUES('version','24'); CREATE TABLE cookies(host_key TEXT,name TEXT,value TEXT,encrypted_value BLOB,path TEXT,expires_utc INTEGER)",
  );
  return { file, db };
}

const rejectSecretRead = async (): Promise<never> => {
  throw new Error("synthetic Linux basic/empty cookies must not request a key");
};

test("empty plaintext cookies retain signed-out diagnostics without decryption errors", async () => {
  const { file, db } = cookieFixture("empty-plain.sqlite");
  try {
    const insert = db.prepare("INSERT INTO cookies VALUES(?,?,?,?,?,?)");
    for (const name of ["lastagecheckage", "sessionid", "steamLoginSecure"])
      for (const encrypted of [Buffer.alloc(0), null])
        insert.run(".steamcommunity.com", name, "", encrypted, "/", 0);
  } finally {
    db.close();
  }
  const result = await readChromiumCookies(
    "chromium",
    file,
    100,
    target,
    rejectSecretRead,
  );
  assert.deepEqual(result.cookies, []);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.warnings, []);
  assert.throws(
    () => sessionFromBrowserCookies(result, "chromium"),
    (e: unknown) => e instanceof CliError && e.code === "AUTH_REQUIRED",
  );
});

test("successfully decrypted empty cookies are skipped without hiding valid login", async () => {
  const { file, db } = cookieFixture("empty-encrypted.sqlite");
  const host = ".steamcommunity.com";
  const key = pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const encrypted = Buffer.concat([
    Buffer.from("v10"),
    cipher.update(createHash("sha256").update(host).digest()),
    cipher.final(),
  ]);
  try {
    db.prepare("INSERT INTO cookies VALUES(?,?,?,?,?,?)").run(
      host,
      "lastagecheckage",
      "",
      encrypted,
      "/",
      0,
    );
  } finally {
    db.close();
  }
  const empty = await readChromiumCookies(
    "chromium",
    file,
    100,
    target,
    rejectSecretRead,
  );
  assert.deepEqual(empty.issues, []);
  assert.deepEqual(empty.warnings, []);
  assert.throws(
    () => sessionFromBrowserCookies(empty, "chromium"),
    (e: unknown) => e instanceof CliError && e.code === "AUTH_REQUIRED",
  );
  const update = new DatabaseSync(file);
  try {
    update
      .prepare("INSERT INTO cookies VALUES(?,?,?,?,?,?)")
      .run(
        host,
        "steamLoginSecure",
        "76561198000000000||synthetic-test-only",
        Buffer.alloc(0),
        "/",
        0,
      );
  } finally {
    update.close();
  }
  const loggedIn = await readChromiumCookies(
    "chromium",
    file,
    100,
    target,
    rejectSecretRead,
  );
  assert.deepEqual(loggedIn.issues, []);
  assert.deepEqual(loggedIn.warnings, []);
  assert.equal(
    sessionFromBrowserCookies(loggedIn, "chromium").steamid,
    "76561198000000000",
  );
});

test("nonempty malformed encrypted cookies still report decryption failure", async () => {
  const { file, db } = cookieFixture("broken-encrypted.sqlite");
  try {
    db.prepare("INSERT INTO cookies VALUES(?,?,?,?,?,?)").run(
      ".steamcommunity.com",
      "steamLoginSecure",
      "",
      Buffer.concat([Buffer.from("v10"), Buffer.alloc(1)]),
      "/",
      0,
    );
  } finally {
    db.close();
  }
  const result = await readChromiumCookies(
    "chromium",
    file,
    100,
    target,
    rejectSecretRead,
  );
  assert.deepEqual(result.issues, ["COOKIE_DECRYPTION_FAILED"]);
  assert.throws(
    () => sessionFromBrowserCookies(result, "chromium"),
    (e: unknown) =>
      e instanceof CliError && e.code === "BROWSER_COOKIE_IMPORT_FAILED",
  );
});
