import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import vdf from "../src/text-vdf.js";
import { parseArguments, argumentSchema, arg } from "../src/arguments.js";
import {
  LocalData,
  replaceLocal,
  safePath,
  copyTree,
} from "../src/local-data.js";
import {
  moveGame,
  localCollections,
  importLutris,
} from "../src/local-tools.js";
import {
  atom,
  decodeBinary,
  encodeBinary,
  value,
  dictionary,
} from "../src/binary-vdf.js";
import { reference, crawl } from "../src/graph.js";
import { Client } from "../src/http.js";
import { Content } from "../src/content.js";
import { Cloud, cloudURL, type CloudTransport } from "../src/cloud.js";
import { Publisher, cents, dateRange } from "../src/publisher.js";
import { Insights } from "../src/insights.js";
import { coverage } from "../src/coverage.js";
import { operations } from "../src/service.js";
import { SteamQueries } from "../src/web-extra.js";

function temp(t: any): string {
  const dir = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "steam-features-")),
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(file: string, data: string | Buffer): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
}
const sha = (text: string | Buffer) =>
  createHash("sha1").update(text).digest("hex");
function fixture(t: any): LocalData {
  const root = temp(t);
  mkdirSync(path.join(root, "steamapps"));
  put(
    path.join(root, "steamapps", "appmanifest_620.acf"),
    vdf.stringify({
      AppState: {
        appid: "620",
        name: "Portal 2",
        installdir: "Portal2",
        SizeOnDisk: "3",
        StateFlags: "4",
        BytesToDownload: "100",
        BytesDownloaded: "30",
      },
    }),
  );
  put(path.join(root, "steamapps", "common", "Portal2", "game.txt"), "abc");
  put(
    path.join(root, "userdata", "42", "config", "localconfig.vdf"),
    vdf.stringify({
      UserLocalConfigStore: {
        Software: {
          Valve: {
            Steam: {
              apps: { "620": { LaunchOptions: "old", Other: "retain" } },
            },
          },
        },
      },
    }),
  );
  const local = new LocalData(root, "42");
  local.assertStopped = () => {};
  return local;
}
test("shared schemas reject malformed booleans, JSON and out of range values", () => {
  const specs = [
    arg("count", "n", "integer", { min: 1, max: 3 }),
    arg("active", "b", "boolean"),
    arg("data", "json", "json", { required: true }),
  ];
  assert.deepEqual(
    parseArguments({ count: "2", active: "no", data: "[1]" }, specs),
    { count: 2, active: false, data: [1] },
  );
  for (const p of [
    { data: [], count: 4 },
    { data: [], active: "0" },
    { data: "invalid" },
    {},
  ])
    assert.throws(() => parseArguments(p, specs));
  assert.equal(argumentSchema(specs).count.safeParse(4).success, false);
});
test("frozen benchmark accounts for every tool/action and references real shared operations", () => {
  const data = coverage();
  assert.equal(data.entries.length, 145);
  const counts: Record<string, number> = {};
  const seen = new Set();
  for (const row of data.entries) {
    assert(operations[row.operation], row.operation);
    assert.match(row.revision, /^[a-f0-9]{40}$/);
    const key = row.source + ":" + row.action;
    assert(!seen.has(key));
    seen.add(key);
    counts[row.source] = (counts[row.source] ?? 0) + 1;
  }
  assert.deepEqual(
    Object.values(counts).sort((a, b) => a - b),
    [34, 42, 69],
  );
  assert.equal(data.exhaustive_market_parity, false);
});
test("Lutris SQLite import is read-only and only imports installed games", async (t) => {
  const { DatabaseSync } = await import("node:sqlite"),
    local = fixture(t),
    file = path.join(local.root, "pga.db"),
    db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE games(name TEXT,slug TEXT,installed INTEGER); INSERT INTO games VALUES('A','game-a',1),('B','game-b',0)",
  );
  db.close();
  const before = readFileSync(file);
  const r = await importLutris(local, file, true);
  assert.equal(r.items.length, 1);
  assert(readFileSync(file).equals(before));
  assert.equal(local.shortcutList().items[0].name, "A");
});
test("workshop query encodes indexed tags and exposes pagination rather than hiding it", async () => {
  const c = new Client({ session: null }),
    q = new SteamQueries(c);
  let params: any;
  q.keyed = async (_i, _m, p) => {
    params = p;
    return {
      publishedfiledetails: [{ publishedfileid: "1" }],
      total: 10,
      next_cursor: "next",
    };
  };
  try {
    const r = await q.workshop("620", {
      requiredTags: ["A&B", "中文"],
      query: "portal",
      limit: 1,
    });
    assert.equal(params["requiredtags[0]"], "A&B");
    assert.equal(params.query_type, 12);
    assert.equal(r.complete, false);
    assert.equal(r.next_cursor, "next");
  } finally {
    await c.close();
  }
});
test("expired API tokens fail before making an authenticated network request", async () => {
  const expired =
    "e30." +
    Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url") +
    ".fixture";
  const c = new Client({
    session: {
      steamid: "76561198000000001",
      source: "fixture",
      updated_at: "",
      cookies: [
        {
          name: "steamLoginSecure",
          value: "76561198000000001%7C%7C" + expired,
          domain: "steamcommunity.com",
        },
      ],
    },
  });
  let calls = 0;
  c.request = async () => {
    calls++;
    return {};
  };
  const previous = process.env.STEAM_WEB_API_KEY;
  delete process.env.STEAM_WEB_API_KEY;
  try {
    await assert.rejects(c.api("IPlayerService", "GetOwnedGames", {}, true), {
      code: "AUTH_FAILED",
    });
    assert.equal(calls, 0);
  } finally {
    if (previous !== undefined) process.env.STEAM_WEB_API_KEY = previous;
    await c.close();
  }
});
test("binary VDF preserves strings, 64-bit IDs, colors and unknown fields", () => {
  const obj = {
    Shortcuts: {
      "0": {
        AppName: atom("中文"),
        Unknown64: { type: 7, value: 18446744073709551615n },
        Color: { type: 6, value: Buffer.from([1, 2, 3, 4]) },
        Wide: { type: 5, value: "九尾" },
      },
    },
  };
  const bytes = encodeBinary(obj);
  assert.deepEqual(encodeBinary(decodeBinary(bytes)), bytes);
  assert.throws(() => decodeBinary(bytes.subarray(0, bytes.length - 3)));
  assert.throws(() => decodeBinary(Buffer.from([99, 0, 0, 8])));
});
test("local edits preview, preserve fields, backup and reject stale snapshots", (t) => {
  const local = fixture(t),
    file = path.join(local.root, "userdata/42/config/localconfig.vdf"),
    before = readFileSync(file);
  assert.equal(local.launchOptions("620", "new", false).dry_run, true);
  assert.deepEqual(readFileSync(file), before);
  const result = local.launchOptions("620", "new", true);
  assert.equal(result.verified, true);
  assert.deepEqual(readFileSync(result.backup), before);
  assert.equal(
    vdf.parse(readFileSync(file, "utf8")).UserLocalConfigStore.Software.Valve
      .Steam.apps["620"].Other,
    "retain",
  );
  assert.throws(() => replaceLocal(file, before, Buffer.from("stale"), true), {
    code: "CONFLICT",
  });
  assert.equal(local.status("620").items[0].progress, 0.3);
});
test("shortcut changes retain capitalization and unknown binary fields", (t) => {
  const local = fixture(t),
    file = path.join(local.root, "userdata/42/config/shortcuts.vdf");
  put(
    file,
    encodeBinary({
      Shortcuts: {
        "0": {
          appid: atom(123),
          AppName: atom("Old"),
          Extra: { type: 7, value: 777n },
        },
      },
    }),
  );
  const result = local.shortcutAdd("New", "/bin/true", undefined, "", true);
  assert.equal(result.verified, true);
  const saved = decodeBinary(readFileSync(file));
  assert.equal(value(dictionary(dictionary(saved.Shortcuts)["0"]).Extra), 777n);
  assert.equal(saved.shortcuts, undefined);
  assert.equal(local.shortcutList().items.length, 2);
  local.shortcutRemove(String(result.appid), true);
  assert.equal(local.shortcutList().items.length, 1);
});
test("path confinement, backup hashes and local move operate only inside fixtures", (t) => {
  const local = fixture(t),
    other = temp(t);
  mkdirSync(path.join(other, "steamapps"));
  put(
    path.join(local.root, "steamapps/libraryfolders.vdf"),
    vdf.stringify({
      libraryfolders: { "0": { path: local.root }, "1": { path: other } },
    }),
  );
  assert.throws(() => safePath(local.root, "../escape"));
  symlinkSync(other, path.join(local.root, "linked"));
  assert.throws(() => safePath(local.root, "linked", "x"));
  const copy = path.join(other, "copied");
  copyTree(path.join(local.root, "steamapps/common/Portal2"), copy);
  assert.equal(readFileSync(path.join(copy, "game.txt"), "utf8"), "abc");
  const plan = moveGame(local, "620", other, false);
  assert.equal(plan.dry_run, true);
  const moved = moveGame(local, "620", other, true);
  assert.equal(moved.verified, true);
  assert.equal(local.game("620").library, other);
  assert.equal(existsSync(moved.source), false);
});
test("legacy collections declare scope and Lutris import uses safe slugs", async (t) => {
  const local = fixture(t);
  const r = localCollections(local, {
    name: "test",
    apps: [620],
    execute: true,
  });
  assert.equal(r.verified, true);
  assert.equal(r.cloud_synced, false);
  assert.deepEqual(localCollections(local, {}).items, [
    { name: "test", apps: [620] },
  ]);
  const file = path.join(local.root, "lutris.json");
  put(file, JSON.stringify([{ name: "Example", slug: "example-game" }]));
  assert.equal((await importLutris(local, file, true)).verified, true);
  assert.equal((await importLutris(local, file, false)).skipped.length, 1);
  put(file, JSON.stringify([{ name: "bad", slug: "bad;rm" }]));
  await assert.rejects(importLutris(local, file, true));
});
test("Steam graph traversal is bounded, deduplicates cycles and reports omissions", async () => {
  assert.equal(reference("steam://package/10").kind, "package");
  assert.equal(
    reference("https://steamcommunity.com/id/example").id,
    "example",
  );
  assert.throws(() => reference("https://evil.example/app/620"));
  const c = new Client({ session: null });
  try {
    const read = async (input: string) => {
      const ref = reference(input);
      return {
        reference: ref,
        data:
          ref.id === "620"
            ? { name: "base", dlc: [621, 622] }
            : { name: "dlc", fullgame: { appid: 620 } },
      };
    };
    const limited = await crawl("620", c, { depth: 3, limit: 2 }, read);
    assert.equal(limited.complete, false);
    assert.deepEqual(limited.pending, ["app:622"]);
    const all = await crawl("620", c, { depth: 3, limit: 10 }, read);
    assert.equal(all.items.length, 3);
    assert.equal(all.complete, true);
  } finally {
    await c.close();
  }
});
test("Depot download checks paths before transfer and supports verified resume", async (t) => {
  const root = temp(t),
    out = path.join(root, "depot"),
    payload = "fixture",
    files = [
      { filename: "dir/", flags: 64, size: "0" },
      {
        filename: "dir/file",
        flags: 0,
        size: String(payload.length),
        sha_content: sha(payload),
      },
    ];
  let calls = 0;
  const content = new Content({
    getProductInfo: async () => ({
      apps: { 620: { appinfo: { depots: { "621": {} } } } },
    }),
    getManifest: async () => ({ manifest: { files } }),
    downloadFile: async (_a, _d, _f, file) => {
      calls++;
      writeFileSync(file, payload);
    },
  });
  const p = { depot: 621, manifest: "123", out };
  assert.equal((await content.download("620", p)).dry_run, true);
  assert.equal(existsSync(out), false);
  assert.equal(
    (await content.download("620", { ...p, execute: true })).verified,
    true,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await content.download("620", { ...p, execute: true, resume: true }))
      .resumed,
    1,
  );
  assert.equal(calls, 1);
  assert.equal((await content.verify("620", p)).verified, true);
  files[1].filename = "../escape";
  await assert.rejects(
    content.download("620", { ...p, execute: true, resume: true }),
    { code: "INVALID_MANIFEST" },
  );
  assert.equal(calls, 1);
});
function cloudFixture(): {
  cloud: Cloud;
  files: Map<string, Buffer>;
  calls: string[];
  fail: () => void;
} {
  const files = new Map<string, Buffer>(),
    pending = new Map<string, Buffer>(),
    calls: string[] = [];
  let broken = false;
  const t: CloudTransport = {
    call: async (method, p) => {
      calls.push(method);
      if (method.includes("Enumerate"))
        return {
          total_files: files.size,
          files: [...files].map(([filename, data]) => ({
            filename,
            file_size: data.length,
            file_sha: sha(data),
          })),
        };
      if (method.includes("Begin"))
        return {
          block_requests: [
            {
              url_host: "test.steamusercontent.com",
              url_path: "/" + p.filename,
              http_method: 4,
              block_offset: "0",
              block_length: p.file_size,
            },
          ],
        };
      if (method.includes("Commit")) {
        files.set(p.filename, pending.get(p.filename)!);
        return { file_committed: true };
      }
      if (method.includes("Delete")) {
        files.delete(p.filename);
        return {};
      }
      if (method.includes("Download")) {
        const b = files.get(p.filename)!;
        return {
          url_host: "test.steamusercontent.com",
          url_path: "/" + p.filename,
          sha_file: Buffer.from(sha(b), "hex"),
          raw_file_size: b.length,
        };
      }
      throw Error("unexpected method");
    },
    transfer: async (url, p) => {
      if (broken) throw Error("fixture transfer interruption");
      const name = new URL(url).pathname.slice(1);
      if (p.method === "PUT") pending.set(name, p.body!);
      return p.method === "PUT" ? Buffer.alloc(0) : files.get(name)!;
    },
  };
  return {
    cloud: new Cloud(t),
    files,
    calls,
    fail: () => {
      broken = true;
    },
  };
}
test("Cloud upload commits only after transfer; download verifies SHA; errors do not retry", async (t) => {
  const f = cloudFixture(),
    dir = temp(t),
    file = path.join(dir, "save");
  put(file, "data");
  assert.equal((await f.cloud.upload("620", file, "save")).dry_run, true);
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.cloud.upload("620", file, "save", true)).verified,
    true,
  );
  assert.equal((await f.cloud.downloadBytes("620", "save")).toString(), "data");
  f.calls.length = 0;
  f.fail();
  await assert.rejects(f.cloud.upload("620", file, "save", true));
  assert.equal(f.calls.filter((x) => x.includes("Begin")).length, 1);
  assert(!f.calls.some((x) => x.includes("Commit")));
  assert.throws(() => cloudURL("steamusercontent.com.evil.example", "/file"));
  assert.throws(() => cloudURL("127.0.0.1", "/file"));
});
test("Cloud sync stops before any write on conflicts and preserves changed local files", async (t) => {
  const f = cloudFixture(),
    dir = temp(t);
  put(path.join(dir, "save"), "local");
  f.files.set("save", Buffer.from("remote"));
  assert.equal((await f.cloud.sync("620", dir)).conflicts.length, 1);
  await assert.rejects(f.cloud.sync("620", dir, true), {
    code: "SYNC_CONFLICT",
  });
  assert(!f.calls.some((x) => x.includes("Begin")));
  f.files.clear();
  assert.equal((await f.cloud.sync("620", dir, true)).verified, true);
  put(path.join(dir, "save"), "local-v2");
  assert.equal((await f.cloud.sync("620", dir, true)).verified, true);
  assert.equal(f.files.get("save")!.toString(), "local-v2");
  f.files.set("save", Buffer.from("remote-v3"));
  assert.equal((await f.cloud.sync("620", dir, true)).verified, true);
  assert.equal(readFileSync(path.join(dir, "save"), "utf8"), "remote-v3");
});
test("Cloud previews do not require client login and post-commit read failures stay unknown", async (t) => {
  const { cloudOperation } = await import("../src/cloud.js"),
    dir = temp(t),
    file = path.join(dir, "save");
  put(file, "data");
  assert.equal(
    (await cloudOperation("upload", "620", { file, name: "save" })).dry_run,
    true,
  );
  const f = cloudFixture();
  f.cloud.all = async () => {
    throw new Error("fixture read interruption");
  };
  await assert.rejects(
    f.cloud.upload("620", file, "save", true),
    (e: any) => e.code === "WRITE_UNKNOWN" && e.details.accepted === true,
  );
  assert.equal(f.calls.filter((x) => x.includes("Commit")).length, 1);
  assert.equal(f.files.get("save")?.toString(), "data");
});
test("publisher sales retain six-place amounts and fail on pagination reversal", async () => {
  const c = new Client({ session: null }),
    p = new Publisher(c);
  let page = 0;
  p.call = async () => ({
    max_id: "1",
    results:
      page++ === 0
        ? [
            {
              country_code: "US",
              gross_sales_usd: "0.000001",
              net_sales_usd: "1.234567",
            },
          ]
        : [],
  });
  try {
    const r = await p.sales({ start: "2026-10-30" });
    assert.equal(r.items[0].gross_sales_usd, "0.000001");
    assert.equal(r.items[0].net_sales_usd, "1.234567");
    page = 0;
    p.call = async () => ({ max_id: page++ === 0 ? "2" : "1", results: [] });
    await assert.rejects(p.sales({ start: "2026-10-30" }), {
      code: "PAGINATION_ERROR",
    });
  } finally {
    await c.close();
  }
});
test("completion distinguishes missing progress and does not invent month playtime", async () => {
  const c = new Client({ session: null });
  const i = new Insights(c);
  i.library = async () => ({
    steamid: "76561198000000001",
    complete: true,
    items: [
      {
        appid: 620,
        name: "Portal 2",
        playtime_forever: 120,
        has_community_visible_stats: true,
        rtime_last_played: 1793400000,
      },
      {
        appid: 621,
        name: "Unknown",
        playtime_forever: 0,
        has_community_visible_stats: true,
      },
    ],
  });
  c.api = async () => ({
    achievement_progress: [
      {
        appid: 620,
        total: 10,
        unlocked: 10,
        percentage: 100,
        all_unlocked: true,
      },
    ],
  });
  try {
    const r = await i.completion();
    assert.equal(r.complete, false);
    assert.equal(r.items[1].total, null);
    assert.equal((await i.completion("me", 50, true)).items.length, 1);
    const timeline = await i.timeline();
    assert.equal(timeline.historical_monthly_playtime_available, false);
  } finally {
    await c.close();
  }
});
test("publisher preview needs no key, request uses publisher host without cookies, sales uses exact decimals", async () => {
  assert.equal(cents("0.10") + cents("0.20"), 30n);
  assert.throws(() => dateRange("2026-02-30"));
  assert.throws(() => dateRange("2026-01-01", "2026-03-01"));
  const c = new Client({ session: null }),
    pub = new Publisher(c),
    calls: any[] = [];
  const old = process.env.STEAM_PUBLISHER_API_KEY;
  process.env.STEAM_PUBLISHER_API_KEY = "fixture-only";
  c.request = async (url, p) => {
    calls.push({ url, p });
    return { response: { ownsapp: true } };
  };
  try {
    assert.equal(
      (
        await pub.score("620", {
          board: 1,
          steamid: "76561198000000001",
          score: 100,
        })
      ).dry_run,
      true,
    );
    assert.equal(calls.length, 0);
    await pub.ownership("620", "76561198000000001");
    assert.equal(new URL(calls[0].url).hostname, "partner.steam-api.com");
    assert.equal(calls[0].p.auth, undefined);
    let page = 0;
    pub.call = async () => ({
      max_id: page++ === 0 ? "1" : "1",
      results:
        page === 1
          ? [
              {
                country_code: "US",
                gross_sales_usd: "0.10",
                net_sales_usd: "0.20",
              },
              {
                country_code: "US",
                gross_sales_usd: "0.20",
                net_sales_usd: "0.10",
              },
            ]
          : [],
    });
    const r = await pub.sales({ start: "2026-10-30" });
    assert.equal(r.items[0].gross_sales_usd, "0.30");
    assert.equal(r.items[0].net_units_sold, null);
  } finally {
    if (old === undefined) delete process.env.STEAM_PUBLISHER_API_KEY;
    else process.env.STEAM_PUBLISHER_API_KEY = old;
    await c.close();
  }
});
