import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readSteamClientCookies,
  steamCookieStores,
  steamClientSources,
  decryptSteamGCM,
  type SteamCookieStore,
} from "../src/steam-client-cookies.js";
import { importSteamClient, login } from "../src/auth.js";
import { saveSession, loadSession, CliError } from "../src/core.js";
import type { Session, Cookie } from "../src/http.js";

const home = realpathSync(
  mkdtempSync(path.join(os.tmpdir(), "steam-client-auth-")),
);
mkdirSync(path.join(home, "auth"), { mode: 0o700 });
process.env.STEAM_CLI_HOME = path.join(home, "auth");
test.after(() => rmSync(home, { recursive: true, force: true }));
const sid = "76561198000000001";
const jwt = (exp = Math.floor(Date.now() / 1000) + 3600) =>
  "e30." +
  Buffer.from(JSON.stringify({ exp })).toString("base64url") +
  ".fixture";
const loginCookie = (id = sid, exp?: number): Cookie => ({
  name: "steamLoginSecure",
  value: `${id}%7C%7C${jwt(exp)}`,
  domain: "steamcommunity.com",
  path: "/",
});
const row = (
  cookie: Cookie,
  encrypted = Buffer.alloc(0),
  expiry = 0n,
  partition = "",
) => [
  cookie.domain,
  cookie.name,
  encrypted.length ? "" : cookie.value,
  encrypted,
  "/",
  expiry,
  partition,
];
function database(
  t: any,
  rows: any[][],
  version = 23,
): { root: string; store: SteamCookieStore; hash: string } {
  const root = mkdtempSync(path.join(home, "fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cache = path.join(root, "config/htmlcache"),
    dir = path.join(cache, "Default");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "Cookies"),
    db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE meta(key TEXT,value TEXT); CREATE TABLE cookies(host_key TEXT,name TEXT,value TEXT,encrypted_value BLOB,path TEXT,expires_utc INTEGER,top_frame_site_key TEXT)",
  );
  db.prepare("INSERT INTO meta VALUES(?,?)").run("version", String(version));
  const stmt = db.prepare("INSERT INTO cookies VALUES(?,?,?,?,?,?,?)");
  for (const r of rows) stmt.run(...r);
  db.close();
  return {
    root,
    store: { path: file, cache_root: cache, profile: "Default" },
    hash: createHash("sha256").update(readFileSync(file)).digest("hex"),
  };
}
const env = (home: string, platform: NodeJS.Platform = "darwin") => ({
  home,
  platform,
  env: {},
});
const cbc = (
  cookie: Cookie,
  password: string,
  version = 23,
  platform: NodeJS.Platform = "darwin",
) => {
  const key = pbkdf2Sync(
      password,
      "saltysalt",
      platform === "darwin" ? 1003 : 1,
      16,
      "sha1",
    ),
    cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 32));
  const plain = Buffer.concat([
    ...(version >= 24
      ? [createHash("sha256").update(cookie.domain).digest()]
      : []),
    Buffer.from(cookie.value),
  ]);
  return Buffer.concat([
    Buffer.from(platform === "linux" ? "v10" : "v10"),
    cipher.update(plain),
    cipher.final(),
  ]);
};
test("Steam source discovery selects CEF databases and explicit profiles without a browser fallback", (t) => {
  const f = database(t, [row(loginCookie())]);
  assert.equal(
    steamCookieStores({ root: f.root }, env(f.root))[0].path,
    f.store.path,
  );
  assert.equal(
    steamCookieStores({ profile: f.store.path }, env(f.root))[0].path,
    f.store.path,
  );
  assert.equal(
    steamCookieStores({ root: f.root, profile: "Other" }, env(f.root)).length,
    0,
  );
  const metadata = steamClientSources({ root: f.root }, env(f.root));
  assert.equal(metadata.source, "steam-client");
  assert.equal(metadata.read_only, true);
  assert(!JSON.stringify(metadata).includes("steamLoginSecure"));
});
test("plaintext import selects only Steam login fields and excludes expired or partitioned rows", async (t) => {
  const f = database(t, [
    row(loginCookie()),
    row({
      name: "sessionid",
      value: "fixture-csrf",
      domain: "steamcommunity.com",
    }),
    row({
      name: "steamLoginSecure",
      value: "wrong-host",
      domain: "steamcommunity.com.evil.example",
    }),
    row({ name: "unrelated", value: "excluded", domain: "steamcommunity.com" }),
    row(loginCookie("76561198000000002"), Buffer.alloc(0), 1n),
    row(
      loginCookie("76561198000000003"),
      Buffer.alloc(0),
      0n,
      "https://other.example",
    ),
  ]);
  let secretReads = 0;
  const r = await readSteamClientCookies({ root: f.root }, env(f.root), {
    macSecret: async () => {
      secretReads++;
      throw Error("must not read");
    },
  });
  assert.equal(r.cookies.length, 2);
  assert.equal(secretReads, 0);
  assert.equal(r.cookies[0].name, "steamLoginSecure");
  assert.equal(
    createHash("sha256").update(readFileSync(f.store.path)).digest("hex"),
    f.hash,
  );
});
test("macOS Steam CBC decryption uses its selected Keychain service and validates host hashes", async (t) => {
  const cookie = loginCookie(),
    f = database(t, [row(cookie, cbc(cookie, "fixture-key", 24))], 24);
  let service = "";
  const result = await readSteamClientCookies(
    { root: f.root, keychainService: "Steam Test Safe Storage" },
    env(f.root),
    {
      macSecret: async (s) => {
        service = s;
        return "fixture-key";
      },
    },
  );
  assert.equal(service, "Steam Test Safe Storage");
  assert.equal(result.cookies[0].value, cookie.value);
  const bad = database(
    t,
    [
      row(
        { ...cookie, domain: "store.steampowered.com" },
        cbc(cookie, "fixture-key", 24),
      ),
    ],
    24,
  );
  await assert.rejects(
    readSteamClientCookies({ root: bad.root }, env(bad.root), {
      macSecret: async () => "fixture-key",
    }),
    { code: "COOKIE_DECRYPT_FAILED" },
  );
});
test("Keychain rejection stops once, never falls back to a different source, and preserves cache", async (t) => {
  const cookie = loginCookie(),
    f = database(t, [row(cookie, cbc(cookie, "fixture-key"))]);
  let requests = 0;
  saveSession({
    steamid: sid,
    source: "previous",
    updated_at: "",
    cookies: [loginCookie()],
  });
  const cache = path.join(home, "auth/session.json"),
    before = readFileSync(cache);
  const read = () =>
    readSteamClientCookies({ root: f.root }, env(f.root), {
      macSecret: async () => {
        requests++;
        throw new CliError("KEYCHAIN_ACCESS_DENIED", "fixture denial");
      },
    });
  await assert.rejects(importSteamClient({}, { read }), {
    code: "KEYCHAIN_ACCESS_DENIED",
  });
  assert.equal(requests, 1);
  assert(readFileSync(cache).equals(before));
});
test("Linux basic CEF cookies decrypt without a Keychain and Windows GCM uses current-user unwrap", async (t) => {
  const cookie = loginCookie(),
    linux = database(t, [row(cookie, cbc(cookie, "peanuts", 23, "linux"))]);
  const a = await readSteamClientCookies(
    { root: linux.root },
    env(linux.root, "linux"),
  );
  assert.equal(a.cookies[0].value, cookie.value);
  const key = Buffer.alloc(32, 7),
    iv = Buffer.alloc(12, 3),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    plain = Buffer.concat([
      createHash("sha256").update(cookie.domain).digest(),
      Buffer.from(cookie.value),
    ]),
    encrypted = Buffer.concat([
      Buffer.from("v10"),
      iv,
      cipher.update(plain),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
  const win = database(t, [row(cookie, encrypted)], 24);
  writeFileSync(
    path.join(win.store.cache_root, "Local State"),
    JSON.stringify({
      os_crypt: {
        encrypted_key: Buffer.concat([
          Buffer.from("DPAPI"),
          Buffer.from("fixture-wrapped"),
        ]).toString("base64"),
      },
    }),
  );
  let unwraps = 0;
  const b = await readSteamClientCookies({}, env(win.root, "win32"), {
    stores: [win.store],
    unprotect: async (bytes) => {
      unwraps++;
      assert.equal(bytes.toString(), "fixture-wrapped");
      return Buffer.from(key);
    },
  });
  assert.equal(b.cookies[0].value, cookie.value);
  assert.equal(unwraps, 1);
  assert.equal(decryptSteamGCM(encrypted, "wrong.host", 24, key), null);
});
test("App-Bound cookies report unsupported before any OS credential request", async (t) => {
  const f = database(t, [row(loginCookie(), Buffer.from("v20fixture"))]);
  let calls = 0;
  await assert.rejects(
    readSteamClientCookies({}, env(f.root, "win32"), {
      stores: [f.store],
      unprotect: async () => {
        calls++;
        return Buffer.alloc(32);
      },
    }),
    { code: "UNSUPPORTED_ENCRYPTION" },
  );
  assert.equal(calls, 0);
});
test("import verifies first, preserves same-account client credentials and rejects stale/mixed accounts", async () => {
  const old: Session = {
    steamid: sid,
    source: "qr",
    updated_at: "",
    cookies: [loginCookie()],
    refreshToken: "fixture-refresh",
  };
  let written: Session | undefined,
    verifications = 0;
  const read = async () => ({
    cookies: [loginCookie()],
    stores: [],
    warnings: [],
  });
  const result: any = await importSteamClient(
    {},
    {
      read,
      previous: () => old,
      verify: async (s) => {
        verifications++;
        assert.equal(s.source, "steam-client");
        return { verified: true };
      },
      save: (s) => {
        written = s as unknown as Session;
      },
    },
  );
  assert.equal(result.verified, true);
  assert.equal(result.client_auth, true);
  assert.equal(written?.refreshToken, "fixture-refresh");
  assert.equal(verifications, 1);
  let saves = 0;
  const save = () => {
    saves++;
  };
  await assert.rejects(
    importSteamClient(
      {},
      {
        read,
        previous: () => old,
        verify: async () => {
          throw new CliError("AUTH_FAILED", "fixture");
        },
        save,
      },
    ),
    { code: "AUTH_FAILED" },
  );
  await assert.rejects(
    importSteamClient(
      {},
      {
        read: async () => ({
          cookies: [loginCookie(sid, 1)],
          stores: [],
          warnings: [],
        }),
        save,
      },
    ),
    { code: "AUTH_FAILED" },
  );
  await assert.rejects(
    importSteamClient(
      {},
      {
        read: async () => ({
          cookies: [
            loginCookie(),
            {
              ...loginCookie("76561198000000002"),
              domain: "store.steampowered.com",
            },
          ],
          stores: [],
          warnings: [],
        }),
        save,
      },
    ),
  );
  assert.equal(saves, 0);
});
test("login selection and installed-style CLI preview are explicit and machine readable", async (t) => {
  const f = database(t, [row(loginCookie())]);
  await assert.rejects(login({ steamClient: true, browser: "chrome" }), {
    code: "INVALID_ARGUMENT",
  });
  await assert.rejects(login({ steamPath: f.root }), {
    code: "INVALID_ARGUMENT",
  });
  const source = path.resolve("src/cli.ts"),
    loader = path.resolve("node_modules/tsx/dist/loader.mjs"),
    args = ["--import", loader, source];
  const output = execFileSync(
    process.execPath,
    [...args, "auth", "steam-client", "--root", f.root, "--json"],
    { cwd: "/tmp", env: process.env, encoding: "utf8" },
  );
  assert.equal(JSON.parse(output).data.dry_run, true);
  assert.equal(JSON.parse(output).data.found, true);
  const conflict = spawnSync(
    process.execPath,
    [...args, "login", "--steam-client", "--qr", "--json"],
    { encoding: "utf8", env: process.env },
  );
  assert.equal(conflict.status, 1);
  assert.equal(JSON.parse(conflict.stdout).error.code, "INVALID_ARGUMENT");
  assert.equal(loadSession().source, "previous");
});
