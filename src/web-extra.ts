import { assert, appid, number } from "./core.js";
import { Client } from "./http.js";
import { Community } from "./community.js";

export class SteamQueries {
  community: Community;
  constructor(public c: Client) {
    this.community = new Community(c);
  }
  async keyed(
    iface: string,
    method: string,
    params: Record<string, any>,
    version = "v1",
  ): Promise<any> {
    assert(
      process.env.STEAM_WEB_API_KEY,
      "AUTH_REQUIRED",
      "此接口需要 STEAM_WEB_API_KEY",
    );
    return this.c.api(iface, method, params, true, version);
  }
  async summary(users: string): Promise<any> {
    const ids = users.split(",");
    assert(ids.length <= 100, "INVALID_ARGUMENT", "一次最多 100 个用户");
    const resolved = [];
    for (const user of ids) resolved.push(await this.community.resolve(user));
    const raw = await this.keyed(
      "ISteamUser",
      "GetPlayerSummaries",
      { steamids: resolved.join(",") },
      "v2",
    );
    assert(Array.isArray(raw.players), "PARSE_ERROR", "玩家资料响应无效");
    return { items: raw.players };
  }
  async groups(user = "me"): Promise<any> {
    return this.c.api(
      "ISteamUser",
      "GetUserGroupList",
      { steamid: await this.community.resolve(user) },
      true,
    );
  }
  async badge(user = "me", badge?: number): Promise<any> {
    return this.c.api(
      "IPlayerService",
      "GetCommunityBadgeProgress",
      { steamid: await this.community.resolve(user), badgeid: badge },
      true,
    );
  }
  async sharing(id: string, user = "me"): Promise<any> {
    return this.c.api(
      "IPlayerService",
      "IsPlayingSharedGame",
      { steamid: await this.community.resolve(user), appid_playing: appid(id) },
      true,
    );
  }
  async schema(id: string): Promise<any> {
    if (process.env.STEAM_WEB_API_KEY)
      return this.keyed(
        "ISteamUserStats",
        "GetSchemaForGame",
        { appid: appid(id), l: this.c.language },
        "v2",
      );
    return this.c.api(
      "IPlayerService",
      "GetGameAchievements",
      { input_json: { appid: appid(id), language: this.c.language } },
      true,
    );
  }
  async globalStats(
    id: string,
    names: string,
    start?: number,
    end?: number,
  ): Promise<any> {
    const stats = names.split(",").map((n) => n.trim());
    assert(
      stats.length > 0 && stats.length <= 100 && stats.every(Boolean),
      "INVALID_ARGUMENT",
      "需要 1–100 个统计名称",
    );
    const params: Record<string, any> = {
      appid: appid(id),
      count: stats.length,
      startdate: start,
      enddate: end,
    };
    stats.forEach((name, i) => (params[`name[${i}]`] = name));
    return this.keyed("ISteamUserStats", "GetGlobalStatsForGame", params);
  }
  async servers(address: string): Promise<any> {
    assert(
      /^[a-zA-Z0-9.:[\]-]{1,255}$/.test(address),
      "INVALID_ARGUMENT",
      "无效服务器地址",
    );
    return this.c.api("ISteamApps", "GetServersAtAddress", { addr: address });
  }
  async update(id: string, version: string): Promise<any> {
    number(version, "version", 0);
    return this.c.api("ISteamApps", "UpToDateCheck", {
      appid: appid(id),
      version,
    });
  }
  async inventory(user: string, app: string): Promise<any> {
    const result = await this.keyed(
      `IEconItems_${appid(app)}`,
      "GetPlayerItems",
      { steamid: await this.community.resolve(user) },
    );
    assert(
      result.result?.status === 1,
      "ACCESS_DENIED",
      "物品接口不可见或不受此游戏支持",
    );
    return {
      appid: appid(app),
      items: result.result.items ?? [],
      num_backpack_slots: result.result.num_backpack_slots ?? null,
    };
  }
  async workshop(id: string, p: any): Promise<any> {
    const types: Record<string, number> = {
      vote: 0,
      date: 1,
      trend: 3,
      subscriptions: 9,
      text: 12,
      playtime: 14,
      updated: 21,
    };
    const params: Record<string, any> = {
      appid: appid(id),
      query_type: types[p.sort ?? (p.query ? "text" : "date")],
      cursor: p.cursor ?? "*",
      numperpage: number(p.limit ?? 20, "limit", 1, 100),
      search_text: p.query,
      return_tags: true,
      return_previews: p.previews === true,
      return_short_description: true,
    };
    assert(
      params.query_type !== undefined,
      "INVALID_ARGUMENT",
      "工坊排序方式无效",
    );
    if (p.sort === "trend") params.days = number(p.days ?? 7, "days", 1, 7);
    for (const name of ["requiredTags", "excludedTags"])
      if (p[name] !== undefined) {
        assert(
          Array.isArray(p[name]) &&
            p[name].length <= 100 &&
            p[name].every((t: any) => typeof t === "string"),
          "INVALID_ARGUMENT",
          "工坊标签需要字符串数组",
        );
        p[name].forEach(
          (tag: string, i: number) =>
            (params[
              `${name === "requiredTags" ? "requiredtags" : "excludedtags"}[${i}]`
            ] = tag),
        );
      }
    if (p.requiredTags?.length) params.match_all_tags = p.matchAll !== false;
    const raw = await this.keyed("IPublishedFileService", "QueryFiles", params);
    assert(
      Array.isArray(raw.publishedfiledetails) || raw.total === 0,
      "PARSE_ERROR",
      "工坊查询响应格式变化",
    );
    return {
      appid: appid(id),
      items: raw.publishedfiledetails ?? [],
      total: raw.total ?? null,
      next_cursor: raw.next_cursor ?? null,
      complete:
        raw.total === 0 ||
        !raw.next_cursor ||
        raw.next_cursor === params.cursor,
    };
  }
  async tradeOffers(p: Record<string, any>): Promise<any> {
    const raw = await this.keyed("IEconService", "GetTradeOffers", {
      get_sent_offers: p.sent !== false,
      get_received_offers: p.received !== false,
      active_only: p.active !== false,
      get_descriptions: true,
      language: this.c.language,
      cursor: p.cursor,
    });
    return {
      ...raw,
      next_cursor: raw.next_cursor ?? null,
      complete: !raw.next_cursor,
    };
  }
  async tradeOffer(id: string): Promise<any> {
    assert(/^\d+$/.test(id), "INVALID_ARGUMENT", "交易 ID 必须为数字");
    return this.keyed("IEconService", "GetTradeOffer", {
      tradeofferid: id,
      language: this.c.language,
    });
  }
  async tradeSummary(): Promise<any> {
    return this.keyed("IEconService", "GetTradeOffersSummary", {});
  }
  async tradeHistory(p: Record<string, any>): Promise<any> {
    const raw = await this.keyed("IEconService", "GetTradeHistory", {
      max_trades: number(p.limit ?? 30, "limit", 1, 100),
      get_descriptions: true,
      include_failed: p.failed === true,
      include_total: true,
      start_after_time: p.afterTime,
      start_after_tradeid: p.afterId,
      language: this.c.language,
    });
    return {
      ...raw,
      complete: raw.more !== true,
      next_tradeid: raw.more
        ? ((raw.trades ?? []).at(-1)?.tradeid ?? null)
        : null,
      next_time: raw.more
        ? ((raw.trades ?? []).at(-1)?.time_init ?? null)
        : null,
    };
  }
  async ownership(id: string, user = "me"): Promise<any> {
    return this.keyed("ISteamUser", "CheckAppOwnership", {
      appid: appid(id),
      steamid: await this.community.resolve(user),
    });
  }
}
