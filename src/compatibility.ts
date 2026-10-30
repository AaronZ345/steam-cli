import { existsSync, readdirSync, readFileSync, lstatSync } from "node:fs";
import vdf from "./text-vdf.js";
import { load } from "cheerio";
import { fetch, EnvHttpProxyAgent, type Dispatcher } from "undici";
import { LocalData, safePath, treeSize } from "./local-data.js";
import { appid, assert, CliError } from "./core.js";

export async function publicData(
  url: string,
  opts: {
    json?: any;
    dispatcher?: Dispatcher;
    headers?: Record<string, string>;
  } = {},
): Promise<any> {
  const u = new URL(url);
  assert(
    u.protocol === "https:" &&
      [
        "www.protondb.com",
        "www.pcgamingwiki.com",
        "howlongtobeat.com",
      ].includes(u.hostname),
    "INVALID_ARGUMENT",
    "不支持的游戏资料来源",
  );
  const dispatcher = opts.dispatcher ?? new EnvHttpProxyAgent();
  try {
    const response = await fetch(u, {
      method: opts.json ? "POST" : "GET",
      headers: {
        "User-Agent": "steam-cli/0.2.0",
        Referer: u.origin + "/",
        Origin: u.origin,
        ...opts.headers,
        ...(opts.json ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.json ? JSON.stringify(opts.json) : undefined,
      dispatcher,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 429)
      throw new CliError("RATE_LIMITED", `${u.hostname} 限流`);
    assert(response.ok, "HTTP_ERROR", `${u.hostname} HTTP ${response.status}`);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response.body ?? []) {
      bytes += chunk.length;
      assert(
        bytes <= 8 * 1024 * 1024,
        "RESPONSE_TOO_LARGE",
        "外部游戏资料超过 8 MiB",
      );
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    try {
      return JSON.parse(text);
    } catch {
      throw new CliError("PARSE_ERROR", `${u.hostname} 返回格式变化`);
    }
  } finally {
    if (!opts.dispatcher) await dispatcher.close();
  }
}
export class Compatibility {
  constructor(public local: LocalData) {}
  mappings(): Record<string, any> {
    const file = safePath(this.local.root, "config", "config.vdf");
    if (!existsSync(file)) return {};
    const raw = vdf.parse(readFileSync(file, "utf8"));
    let obj = raw;
    for (const key of [
      "InstallConfigStore",
      "Software",
      "Valve",
      "Steam",
      "CompatToolMapping",
    ]) {
      const k = Object.keys(obj).find(
        (k) => k.toLowerCase() === key.toLowerCase(),
      );
      if (!k) return {};
      obj = obj[k];
    }
    return obj;
  }
  versions(): any {
    const items: any[] = [];
    for (const root of [
      safePath(this.local.root, "compatibilitytools.d"),
      ...this.local
        .libraries()
        .map((lib) => safePath(lib, "steamapps", "common")),
    ]) {
      if (!existsSync(root)) continue;
      for (const name of readdirSync(root)) {
        const dir = safePath(root, name);
        if (!lstatSync(dir).isDirectory()) continue;
        const descriptor = safePath(dir, "compatibilitytool.vdf");
        if (
          !existsSync(descriptor) &&
          !/^Proton|^SteamLinuxRuntime/i.test(name)
        )
          continue;
        items.push({
          name,
          path: dir,
          descriptor: existsSync(descriptor) ? descriptor : null,
          kind: name.startsWith("SteamLinuxRuntime")
            ? "steam-runtime"
            : "proton",
        });
      }
    }
    return { items, mappings: this.mappings() };
  }
  info(id: string): any {
    const app = appid(id),
      mappings = this.mappings(),
      prefixes = [];
    for (const library of this.local.libraries()) {
      const dir = safePath(library, "steamapps", "compatdata", String(app));
      if (existsSync(dir)) {
        const reg = safePath(dir, "pfx", "system.reg");
        let windows_version = null;
        if (existsSync(reg) && lstatSync(reg).size <= 16 * 1024 * 1024)
          windows_version =
            /"(?:ProductName|CurrentVersion)"="([^"]+)"/.exec(
              readFileSync(reg, "utf8"),
            )?.[1] ?? null;
        prefixes.push({
          library,
          path: dir,
          ...treeSize(dir),
          windows_version,
        });
      }
    }
    return {
      appid: app,
      mapping: mappings[String(app)] ?? mappings["0"] ?? null,
      prefixes,
      has_prefix: prefixes.length > 0,
      platform: process.platform,
    };
  }
  games(): any {
    return {
      items: this.local
        .manifests()
        .map((g) => ({
          appid: g.appid,
          name: g.name,
          ...this.info(String(g.appid)),
        }))
        .filter((g) => g.has_prefix || g.mapping),
    };
  }
  async rating(id: string): Promise<any> {
    return protonRating(id);
  }
  async recommend(id: string): Promise<any> {
    const info = this.info(id),
      versions = this.versions();
    let rating: any = null,
      error: any = null;
    try {
      rating = await this.rating(id);
    } catch (e: any) {
      error = { code: e.code, message: e.message };
    }
    const choices = versions.items.filter((p: any) => p.kind === "proton");
    const chosen =
      choices.find((p: any) => /Experimental/i.test(p.name)) ??
      choices.at(-1) ??
      null;
    return {
      ...info,
      installed_versions: choices,
      community_rating: rating,
      rating_error: error,
      suggested_installed_runtime: chosen,
      verified_compatibility: false,
      basis:
        "installed runtime inventory and community rating; no game launch test",
    };
  }
}
export async function wiki(id: string): Promise<any> {
  const app = appid(id),
    url = new URL("https://www.pcgamingwiki.com/w/api.php");
  for (const [k, v] of Object.entries({
    action: "idlookup",
    field: "steamappid",
    value: String(app),
    format: "json",
  }))
    url.searchParams.set(k, v);
  const result = await publicData(url.href),
    pages = result.idlookup ?? [];
  assert(
    !result.error,
    result.error?.code === "permissiondenied" ? "ACCESS_DENIED" : "API_ERROR",
    "PCGamingWiki ID 查询失败",
  );
  assert(
    pages.length === 1,
    pages.length ? "AMBIGUOUS" : "NOT_FOUND",
    "PCGamingWiki 没有唯一匹配页面",
  );
  const title = pages[0].title.Page;
  const endpoint = new URL("https://www.pcgamingwiki.com/w/api.php");
  for (const [k, v] of Object.entries({
    action: "parse",
    page: title,
    prop: "text|sections",
    format: "json",
  }))
    endpoint.searchParams.set(k, v);
  const raw = await publicData(endpoint.href);
  assert(raw.parse, "PARSE_ERROR", "Wiki 页面读取失败");
  const $ = load(raw.parse.text?.["*"] ?? "");
  $("script,style").remove();
  return {
    appid: app,
    title,
    sections: raw.parse.sections ?? [],
    text: $.text().trim(),
    url: `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
  };
}
export async function howLong(query: string): Promise<any> {
  assert(query.trim(), "INVALID_ARGUMENT", "请输入游戏名称");
  const init = await publicData(
    `https://howlongtobeat.com/api/search/site/init?t=${Date.now()}`,
  );
  assert(
    typeof init.token === "string",
    "PARSE_ERROR",
    "HowLongToBeat 搜索初始化响应变化",
  );
  const authHeaders: Record<string, string> = { "x-auth-token": init.token };
  if (typeof init.hpKey === "string" && typeof init.hpVal === "string") {
    authHeaders["x-hp-key"] = init.hpKey;
    authHeaders["x-hp-val"] = init.hpVal;
  }
  const raw = await publicData("https://howlongtobeat.com/api/search/site", {
    headers: authHeaders,
    json: {
      searchType: "games",
      searchTerms: query.trim().split(/\s+/),
      searchPage: 1,
      size: 20,
      searchOptions: {
        games: {
          userId: 0,
          platform: "",
          sortCategory: "popular",
          rangeCategory: "main",
          rangeTime: { min: 0, max: 0 },
          gameplay: { perspective: "", flow: "", genre: "" },
          modifier: "",
        },
        users: { sortCategory: "postcount" },
        filter: "",
        sort: 0,
        randomizer: 0,
      },
    },
  });
  assert(Array.isArray(raw.data), "PARSE_ERROR", "HowLongToBeat 搜索接口变化");
  return {
    query,
    items: raw.data.map((g: any) => ({
      id: g.game_id,
      name: g.game_name,
      main_hours: g.comp_main ? g.comp_main / 3600 : null,
      extras_hours: g.comp_plus ? g.comp_plus / 3600 : null,
      completionist_hours: g.comp_100 ? g.comp_100 / 3600 : null,
      url: `https://howlongtobeat.com/game/${g.game_id}`,
    })),
    source: "howlongtobeat",
  };
}

export async function protonRating(id: string): Promise<any> {
  const app = appid(id),
    raw = await publicData(
      `https://www.protondb.com/api/v1/reports/summaries/${app}.json`,
    );
  assert(typeof raw.tier === "string", "PARSE_ERROR", "ProtonDB 没有返回评分");
  return {
    appid: app,
    ...raw,
    source: `https://www.protondb.com/app/${app}`,
  };
}
