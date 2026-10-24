import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  lstatSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  CliError,
  appid,
  saveSession,
  loadSession,
  logout,
  redact,
  errorPayload,
} from "../src/core.js";
import { sessionFromCookies, parseCookies } from "../src/auth.js";
import { cookieHeader, steamURL, Client } from "../src/http.js";
import { idForms, parseProfile, joinAchievements } from "../src/community.js";
import { reviewPatch, Reviews } from "../src/reviews.js";
import { format } from "../src/output.js";
import { MockAgent } from "undici";
import { Store, parseCommunityReviews } from "../src/store.js";
import { chromiumProfileRoots } from "../src/browser-platform.js";
import { decryptChromiumCookie } from "../src/browser-cookies.js";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";

const temp = mkdtempSync(path.join(os.tmpdir(), "steam-cli-test-"));
chmodSync(temp, 0o700);
process.env.STEAM_CLI_HOME = temp;
test.after(() => rmSync(temp, { recursive: true, force: true }));
const sid = "76561198000000001";
const session = sessionFromCookies(
  [
    {
      name: "steamLoginSecure",
      value: `${sid}%7C%7Cfixture`,
      domain: "steamcommunity.com",
      path: "/",
    },
  ],
  "fixture",
);
function mock(): { agent: MockAgent; c: Client } {
  const agent = new MockAgent();
  agent.disableNetConnect();
  return { agent, c: new Client({ session, interval: 0, dispatcher: agent }) };
}
test("encrypted sessions roundtrip, enforce permissions, fail closed on tampering", () => {
  saveSession(session as any);
  assert.equal(loadSession().steamid, sid);
  const file = path.join(temp, "session.json"),
    bytes = readFileSync(file, "utf8");
  assert(!bytes.includes("fixture"));
  assert.equal(lstatSync(file).mode & 0o077, 0);
  const raw = JSON.parse(bytes);
  raw.tag = Buffer.alloc(16).toString("base64");
  writeFileSync(file, JSON.stringify(raw), { mode: 0o600 });
  assert.throws(() => loadSession(), /解密/);
  assert(existsSync(file));
  logout();
});
test("identifiers round trip SteamID2 and SteamID3 and reject unrelated URLs", () => {
  const forms = idForms(sid) as any;
  assert.deepEqual(idForms(forms.steamid2), forms);
  assert.deepEqual(idForms(forms.steamid3), forms);
  assert.equal(appid("https://store.steampowered.com/app/620/Portal_2/"), 620);
  assert.throws(() => appid("https://example.com/app/620"));
  assert.throws(() => appid("-1"));
});
test("cookie imports isolate domains, profiles and expiry without leaking unrelated cookies", () => {
  const rows = parseCookies(
    JSON.stringify([
      {
        name: "steamLoginSecure",
        value: `${sid}%7C%7Cfixture`,
        domain: "steamcommunity.com",
      },
      { name: "password", value: "never", domain: "steamcommunity.com" },
      {
        name: "sessionid",
        value: "expired",
        domain: "steamcommunity.com",
        expires: 1,
      },
    ]),
  );
  assert(!rows.some((c) => c.value === "expired" || c.value === "never"));
  assert(
    cookieHeader(rows, new URL("https://steamcommunity.com/")).includes(
      "steamLoginSecure=",
    ),
  );
  assert(
    !cookieHeader(rows, new URL("https://store.steampowered.com/")).includes(
      "steamLoginSecure=",
    ),
  );
  assert(
    !cookieHeader(rows, new URL("https://evilsteamcommunity.com/")).includes(
      "steamLoginSecure=",
    ),
  );
  assert.throws(
    () =>
      parseCookies(
        JSON.stringify([
          ...rows,
          {
            name: "steamLoginSecure",
            value: "76561198000000002%7C%7Cfixture",
            domain: "steamcommunity.com",
          },
        ]),
      ),
    /多个账号/,
  );
  assert.throws(() => steamURL("https://store.steampowered.com.evil.test/"));
});
test("Netscape and header import keep only Steam credentials", () => {
  assert.equal(
    parseCookies(
      `.steamcommunity.com\tTRUE\t/\tTRUE\t0\tsteamLoginSecure\t${sid}%7C%7Cfixture`,
    )[0].domain,
    ".steamcommunity.com",
  );
  assert.equal(
    sessionFromCookies(
      parseCookies(`steamLoginSecure=${sid}%7C%7Cfixture; unrelated=ignore`),
      "fixture",
    ).steamid,
    sid,
  );
});
test("redaction removes nested secret fields, JWT and inline cookies", () => {
  const value = redact({
    access_token: "never",
    nested: { steamLoginSecure: "never" },
    stdout: "sessionid=never key=never eyJabc.abc.abc",
  });
  assert(!JSON.stringify(value).includes("never"));
  assert(!JSON.stringify(value).includes("eyJabc"));
  assert(
    !redact(
      '{"shared_secret":"hidden value","password":"hidden value","access_token":"hidden value"} Bearer hiddenvalue',
    ).includes("hidden"),
  );
  assert.equal(
    (errorPayload(new CliError("AUTH_FAILED", "failed")) as any).error.code,
    "AUTH_FAILED",
  );
});
test("review patch changes only specified fields and preserves BBCode and false booleans", () => {
  assert.deepEqual(reviewPatch({ recommend: false }), { voted_up: "false" });
  assert.deepEqual(
    reviewPatch({ text: "[b]原文[/b]\n第二行", comments: false }),
    { review_text: "[b]原文[/b]\n第二行", comments_disabled: "true" },
  );
  assert.throws(() => reviewPatch({}));
  assert.throws(() => reviewPatch({ text: "" }));
  assert.throws(() => reviewPatch({ recommend: "false" } as any), /布尔值/);
});
test("review editing refuses a foreign author before any write", async () => {
  const { c } = mock();
  const reviews = new Reviews(c, {
    review: async () => ({
      appid: 620,
      steamid: "76561198000000002",
      recommendationid: "123",
    }),
  } as any);
  await assert.rejects(() => reviews.edit(620, { text: "hi" }, false), /作者/);
  await c.close();
});
test("review write submits exactly once, preserves fields and verifies readback", async () => {
  const { agent, c } = mock(),
    before = {
      appid: 620,
      steamid: sid,
      recommendationid: "123",
      review: "原文",
      voted_up: true,
    };
  let reads = 0;
  const reviews = new Reviews(c, {
    review: async () =>
      ++reads === 1 ? before : { ...before, voted_up: false },
  } as any);
  agent
    .get("https://steamcommunity.com")
    .intercept({
      path: "/userreviews/update/123",
      method: "POST",
      body: (body: string) => {
        const p = new URLSearchParams(body);
        return (
          p.get("voted_up") === "false" &&
          !p.has("review_text") &&
          !p.has("is_public")
        );
      },
    })
    .reply(200, { success: 1 });
  const result = (await reviews.edit(620, { recommend: false }, false)) as any;
  assert.equal(result.verified, true);
  assert.equal(reads, 2);
  agent.assertNoPendingInterceptors();
  await c.close();
});
test("write error is unknown and is never retried", async () => {
  const { agent, c } = mock();
  agent
    .get("https://steamcommunity.com")
    .intercept({ path: "/write", method: "POST" })
    .reply(503, "down");
  await assert.rejects(
    () =>
      c.request("https://steamcommunity.com/write", {
        method: "POST",
        form: { value: "fixture" },
      }),
    (e: any) => e.code === "WRITE_UNKNOWN",
  );
  agent.assertNoPendingInterceptors();
  await c.close();
});
test("login redirect and x-eresult failure are not empty success", async () => {
  const { agent, c } = mock();
  agent
    .get("https://steamcommunity.com")
    .intercept({ path: "/my/" })
    .reply(302, "", { headers: { location: "/login/home/" } });
  await assert.rejects(
    () => c.request("https://steamcommunity.com/my/", { auth: true }),
    (e: any) => e.code === "AUTH_FAILED",
  );
  agent
    .get("https://api.steampowered.com")
    .intercept({ path: "/test" })
    .reply(200, {}, { headers: { "x-eresult": "15" } });
  await assert.rejects(
    () => c.request("https://api.steampowered.com/test"),
    (e: any) => e.code === "ACCESS_DENIED",
  );
  await c.close();
});
test("429 retry is bounded and honors a long Retry-After by stopping", async () => {
  const { agent, c } = mock();
  agent
    .get("https://api.steampowered.com")
    .intercept({ path: "/test" })
    .reply(429, {}, { headers: { "Retry-After": "90" } });
  await assert.rejects(
    () => c.request("https://api.steampowered.com/test"),
    (e: any) => e.code === "RATE_LIMITED",
  );
  agent.assertNoPendingInterceptors();
  await c.close();
});
test("review cursor is encoded once and partial reads report next cursor", async () => {
  const { agent, c } = mock();
  const cursor = "abc+/= 测试";
  agent
    .get("https://store.steampowered.com")
    .intercept({
      path: (p: string) =>
        new URL(p, "https://store.steampowered.com").searchParams.get(
          "cursor",
        ) === cursor,
    })
    .reply(200, {
      success: 1,
      reviews: [{ recommendationid: "1" }],
      cursor: "next",
      query_summary: { total_reviews: 2 },
    });
  const result = (await new Store(c).reviews(620, { limit: 1, cursor })) as any;
  assert.equal(result.complete, false);
  assert.equal(result.next_cursor, "next");
  await c.close();
});
test("repeated pagination cursor fails instead of duplicating reviews", async () => {
  const { agent, c } = mock();
  agent
    .get("https://store.steampowered.com")
    .intercept({ path: () => true })
    .reply(200, {
      success: 1,
      reviews: [{ recommendationid: "1" }],
      cursor: "*",
    });
  await assert.rejects(
    () => new Store(c).reviews(620, { limit: 2, maxPages: 2 }),
    /游标/,
  );
  await c.close();
});
test("public review fallback retains full text, date, vote and author", () => {
  const result = parseCommunityReviews(
    `<div class="apphub_Card" data-modal-content-url="https://steamcommunity.com/profiles/${sid}/recommended/620/"><div class="vote_header"><div class="title">Not Recommended</div></div><div class="apphub_CardTextContent"><div class="date_posted">Posted: Today</div>first &amp; second<br>line</div></div>`,
  );
  assert.equal(result[0].review, "first & second\nline");
  assert.equal(result[0].voted_up, false);
  assert.equal(result[0].author.steamid, sid);
});
test("private profile is an access error instead of missing data", () => {
  assert.throws(
    () => parseProfile("<profile><error>private</error></profile>"),
    /private/,
  );
});
test("CSV escaping, unicode and machine envelopes remain stable", () => {
  const csv = format(
    { items: [{ name: '中文,"quote"', text: "line\nnext" }] },
    { format: "csv" },
  );
  assert(csv.includes('"中文,""quote"""'));
  assert(csv.includes('"line\nnext"'));
  assert.deepEqual(JSON.parse(format({ empty: null }, { json: true })), {
    ok: true,
    data: { empty: null },
  });
});
test("browser roots preserve selected brand across macOS Windows and Linux", () => {
  assert(
    chromiumProfileRoots("vivaldi", {
      platform: "darwin",
      home: "/Users/demo",
      env: {},
    })[0].endsWith("/Vivaldi"),
  );
  assert(
    chromiumProfileRoots("opera", {
      platform: "win32",
      home: "C:\\Users\\demo",
      env: {},
    })[0].includes("Roaming"),
  );
  assert(
    chromiumProfileRoots("brave", {
      platform: "linux",
      home: "/home/demo",
      env: {},
    })[0].includes("Brave-Browser"),
  );
});
test("Chromium v24 cookies check host hash and selected Keychain password", () => {
  const host = ".steamcommunity.com",
    secret = "fixture-key",
    key = pbkdf2Sync(secret, "saltysalt", 1003, 16, "sha1"),
    cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const encrypted = Buffer.concat([
    Buffer.from("v10"),
    cipher.update(
      Buffer.concat([
        createHash("sha256").update(host).digest(),
        Buffer.from("fixture-cookie"),
      ]),
    ),
    cipher.final(),
  ]);
  assert.equal(
    decryptChromiumCookie(encrypted, host, 24, "darwin", secret),
    "fixture-cookie",
  );
  assert.equal(
    decryptChromiumCookie(encrypted, ".evil.test", 24, "darwin", secret),
    null,
  );
});
test("achievement states join by internal key and keep unknown distinct from locked", () => {
  const raw = {
    schema_hash: 123,
    achievements: [
      { internal_key: 1, unlocked: true, unlock_time: 10 },
      { internal_key: 2, unlocked: false },
    ],
  };
  const schema = {
    schema_hash: 123,
    achievements: [
      { internal_key: 2, internal_name: "locked" },
      { internal_key: 1, internal_name: "unlocked", localized_name: "成就" },
      { internal_key: 3, internal_name: "unknown" },
    ],
  };
  const result = joinAchievements(620, sid, raw, schema) as any;
  assert.equal(result.items[0].achieved, 0);
  assert.equal(result.items[1].achieved, 1);
  assert.equal(result.items[2].achieved, null);
  assert.equal(result.complete, false);
  assert.throws(
    () => joinAchievements(620, sid, raw, { ...schema, schema_hash: 999 }),
    /定义/,
  );
});
