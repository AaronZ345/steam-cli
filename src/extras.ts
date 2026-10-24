import { load } from "cheerio";
import { createWriteStream, linkSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import path from "node:path";
import { fetch, EnvHttpProxyAgent } from "undici";
import { appid, assert, number } from "./core.js";
import { Client } from "./http.js";
import { Community } from "./community.js";

export class Extras {
  constructor(public c: Client) {}
  async marketSearch(
    query: string,
    opts: { appid?: number; limit?: number; offset?: number } = {},
  ): Promise<object> {
    const raw = await this.c.request(
      "https://steamcommunity.com/market/search/render/",
      {
        params: {
          query,
          start: opts.offset ?? 0,
          count: number(opts.limit ?? 20, "limit", 1, 100),
          appid: opts.appid,
          norender: 1,
          search_descriptions: 1,
        },
      },
    );
    assert(raw.success, "API_ERROR", "市场搜索失败");
    return {
      items: raw.results ?? [],
      total: raw.total_count,
      offset: raw.start,
      next_offset:
        raw.start + raw.pagesize < raw.total_count
          ? raw.start + raw.pagesize
          : null,
    };
  }
  async marketPrice(
    app: string | number,
    name: string,
    currency = 23,
  ): Promise<object> {
    const raw = await this.c.request(
      "https://steamcommunity.com/market/priceoverview/",
      {
        params: {
          appid: appid(app),
          market_hash_name: name,
          currency: number(currency, "currency", 1, 100),
        },
      },
    );
    assert(raw.success, "NOT_FOUND", "市场物品没有价格数据");
    return { appid: appid(app), market_hash_name: name, currency, ...raw };
  }
  async marketListings(): Promise<object> {
    const raw = await this.c.request(
      "https://steamcommunity.com/market/mylistings",
      { auth: true, params: { norender: 1, count: 100 } },
    );
    assert(raw.success, "API_ERROR", "无法读取市场挂单");
    return raw;
  }
  async workshopInfo(id: string): Promise<object> {
    assert(/^\d+$/.test(id), "INVALID_ARGUMENT", "创意工坊 ID 必须是数字");
    const raw = await this.c.request(
      "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
      { method: "POST", form: { itemcount: 1, "publishedfileids[0]": id } },
    );
    const item = raw.response?.publishedfiledetails?.[0];
    assert(item?.result === 1, "NOT_FOUND", "创意工坊条目不可用");
    return item;
  }
  async workshopBrowse(
    input: string | number,
    opts: { query?: string; page?: number; sort?: string } = {},
  ): Promise<object> {
    const id = appid(input),
      html = await this.c.request(
        "https://steamcommunity.com/workshop/browse/",
        {
          params: {
            appid: id,
            searchtext: opts.query,
            p: opts.page ?? 1,
            browsesort: opts.sort ?? "trend",
          },
          text: true,
        },
      );
    const $ = load(html),
      items = $(".workshopItem")
        .map((_, el) => {
          const row = $(el),
            href =
              row.find("a.workshopItemPreviewHolder").attr("href") ||
              row.find('a[href*="filedetails"]').attr("href") ||
              "";
          return {
            publishedfileid: /[?&]id=(\d+)/.exec(href)?.[1] ?? null,
            title: row.find(".workshopItemTitle").text().trim(),
            author: row.find(".workshopItemAuthorName").text().trim(),
            url: href,
          };
        })
        .get();
    assert(
      items.length || /No items matching|没有符合/i.test(html),
      "PARSE_ERROR",
      "创意工坊页面格式变化",
    );
    return {
      appid: id,
      items,
      page: opts.page ?? 1,
      next_page: $(".pagebtn").last().attr("href")
        ? (opts.page ?? 1) + 1
        : null,
    };
  }
  async workshopSubscribe(
    id: string,
    remove = false,
    dryRun = true,
  ): Promise<object> {
    const item: any = await this.workshopInfo(id);
    this.c.requireAuth();
    if (dryRun)
      return {
        dry_run: true,
        action: remove ? "workshop.unsubscribe" : "workshop.subscribe",
        publishedfileid: id,
        appid: item.consumer_app_id,
      };
    const url = `https://steamcommunity.com/sharedfiles/${remove ? "unsubscribe" : "subscribe"}`;
    const raw = await this.c.request(url, {
      method: "POST",
      auth: true,
      form: { id, appid: item.consumer_app_id, sessionid: this.c.csrf(url) },
    });
    assert(
      raw.success === 1,
      raw.success === 21 ? "AUTH_FAILED" : "API_ERROR",
      "工坊订阅操作失败",
    );
    return { accepted: true, verified: false, publishedfileid: id };
  }
  async comments(
    type: string,
    owner: string,
    feature = "-1",
    limit = 20,
    offset = 0,
  ): Promise<object> {
    assert(
      ["Profile", "PublishedFile_Public", "Recommendation"].includes(type) &&
        /^\d+$/.test(owner) &&
        /^-?\d+$/.test(feature),
      "INVALID_ARGUMENT",
      "评论类型或 ID 无效",
    );
    const raw = await this.c.request(
      `https://steamcommunity.com/comment/${type}/render/${owner}/${feature}/`,
      {
        params: { start: offset, count: number(limit, "limit", 1, 100) },
        auth: Boolean(this.c.session),
      },
    );
    assert(
      raw.success && typeof raw.comments_html === "string",
      "API_ERROR",
      "评论读取失败",
    );
    const $ = load(raw.comments_html),
      items = $(".commentthread_comment")
        .map((_, el) => {
          const row = $(el);
          return {
            id: row.attr("id")?.replace("comment_", ""),
            author: row.find(".commentthread_author_link").text().trim(),
            author_url: row.find(".commentthread_author_link").attr("href"),
            text: row.find(".commentthread_comment_text").text().trim(),
            timestamp:
              row.find("[data-timestamp]").attr("data-timestamp") ?? null,
          };
        })
        .get();
    return {
      items,
      total: raw.total_count ?? raw.total_comments ?? null,
      offset,
      next_offset: items.length === limit ? offset + items.length : null,
    };
  }
  async comment(
    type: string,
    owner: string,
    feature: string,
    text: string,
    dryRun = true,
  ): Promise<object> {
    assert(
      ["Profile", "PublishedFile_Public", "Recommendation"].includes(type) &&
        /^\d+$/.test(owner) &&
        /^-?\d+$/.test(feature),
      "INVALID_ARGUMENT",
      "评论类型或 ID 无效",
    );
    assert(
      text.trim() && text.length <= 10000,
      "INVALID_ARGUMENT",
      "评论正文为空或过长",
    );
    this.c.requireAuth();
    if (dryRun)
      return {
        dry_run: true,
        action: "comment.create",
        type,
        owner,
        feature,
        text,
      };
    const url = `https://steamcommunity.com/comment/${type}/post/${owner}/${feature}/`;
    const result = await this.c.request(url, {
      method: "POST",
      auth: true,
      form: { comment: text, count: 6, sessionid: this.c.csrf(url) },
    });
    assert(result.success, "API_ERROR", "评论未被接受");
    return { accepted: true, verified: false };
  }
  async cloudList(input: string | number, includeLinks = false): Promise<any> {
    const id = appid(input),
      html = await this.c.request(
        "https://store.steampowered.com/account/remotestorageapp/",
        { params: { appid: id }, auth: true, text: true },
      );
    const $ = load(html),
      table = $("table").first();
    assert(
      table.length || /no files|没有文件/i.test(html),
      "PARSE_ERROR",
      "云存档页面不可用",
    );
    const items = table
      .find("tr")
      .slice(1)
      .map((_, el) => {
        const row = $(el),
          cells = row
            .find("td")
            .map((_, td) => $(td).text().trim())
            .get(),
          href = row.find("a[href]").attr("href");
        return {
          platform: cells[0] ?? null,
          name: cells[1] ?? null,
          size: cells[2] ?? null,
          modified: cells[3] ?? null,
          ...(includeLinks && href ? { download_url: href } : {}),
        };
      })
      .get();
    return { appid: id, items };
  }
  async cloudDownload(
    input: string | number,
    name: string,
    output: string,
  ): Promise<object> {
    const raw = await this.cloudList(input, true),
      matches = raw.items.filter((f: any) => f.name === name);
    assert(
      matches.length === 1,
      matches.length ? "AMBIGUOUS" : "NOT_FOUND",
      "请使用 cloud list 返回的唯一完整文件名",
    );
    const url = new URL(matches[0].download_url);
    assert(
      url.protocol === "https:" &&
        /(?:^|\.)(?:steamusercontent\.com|steamcontent\.com|steampowered\.com)$/.test(
          url.hostname,
        ),
      "INVALID_ARGUMENT",
      "云存档下载地址不在 Steam 域名内",
    );
    const dispatcher = new EnvHttpProxyAgent();
    const target = path.resolve(output),
      temp = `${target}.${randomBytes(8).toString("hex")}.part`;
    try {
      const res = await fetch(url, {
        dispatcher,
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
      assert(res.ok && res.body, "HTTP_ERROR", "云存档下载失败");
      let size = 0;
      const guard = new Transform({
        transform(chunk, _enc, cb) {
          size += chunk.length;
          cb(
            size <= 256 * 1024 * 1024 ? null : new Error("下载超过 256 MiB"),
            chunk,
          );
        },
      });
      await pipeline(
        Readable.fromWeb(res.body as any),
        guard,
        createWriteStream(temp, { flags: "wx", mode: 0o600 }),
      );
      linkSync(temp, target);
      return { appid: appid(input), name, path: target, bytes: size };
    } finally {
      rmSync(temp, { force: true });
      await dispatcher.close();
    }
  }
  async badges(user = "me"): Promise<object> {
    return this.c.api(
      "IPlayerService",
      "GetBadges",
      { steamid: await new Community(this.c).resolve(user) },
      true,
    );
  }
  async bans(user = "me"): Promise<object> {
    return this.c.api(
      "ISteamUser",
      "GetPlayerBans",
      { steamids: await new Community(this.c).resolve(user) },
      true,
    );
  }
  async level(user = "me"): Promise<object> {
    return this.c.api(
      "IPlayerService",
      "GetSteamLevel",
      { steamid: await new Community(this.c).resolve(user) },
      true,
    );
  }
}
