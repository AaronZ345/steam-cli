import { randomInt } from "node:crypto";
import { appid, assert, number } from "./core.js";
import { Client } from "./http.js";
import { Community } from "./community.js";
import { Store } from "./store.js";
import { installed } from "./local.js";

export class Insights {
  community: Community;
  constructor(public c: Client) {
    this.community = new Community(c);
  }
  async library(user = "me"): Promise<any> {
    const r: any = await this.community.games(user, { limit: 100000 });
    assert(r.complete, "INCOMPLETE", "游戏库未读取完整");
    return r;
  }
  async stats(user = "me"): Promise<any> {
    const r = await this.library(user),
      games = r.items;
    return {
      steamid: r.steamid,
      total: games.length,
      played: games.filter((g: any) => g.playtime_forever > 0).length,
      unplayed: games.filter((g: any) => g.playtime_forever === 0).length,
      unknown_playtime: games.filter((g: any) => g.playtime_forever === null)
        .length,
      lifetime_minutes: games.reduce(
        (n: number, g: any) => n + (g.playtime_forever ?? 0),
        0,
      ),
      recent_minutes: games.reduce(
        (n: number, g: any) => n + (g.playtime_2weeks ?? 0),
        0,
      ),
      source: r.source,
    };
  }
  async backlog(user = "me", limit = 20, query?: string): Promise<any> {
    const r = await this.library(user),
      items = r.items.filter(
        (g: any) =>
          g.playtime_forever === 0 &&
          (!query || g.name?.toLowerCase().includes(query.toLowerCase())),
      );
    return {
      steamid: r.steamid,
      items: items.slice(0, number(limit, "limit", 1, 10000)),
      total: items.length,
      complete: items.length <= limit,
    };
  }
  async random(user = "me", unplayed = false): Promise<any> {
    const r = await this.library(user),
      pool = r.items.filter((g: any) => !unplayed || g.playtime_forever === 0);
    assert(pool.length, "NOT_FOUND", "没有符合条件的游戏");
    return {
      steamid: r.steamid,
      pool_size: pool.length,
      game: pool[randomInt(pool.length)],
    };
  }
  async compare(ids: string): Promise<any> {
    const targets = [...new Set(ids.split(",").map(appid))];
    assert(
      targets.length >= 2 && targets.length <= 10,
      "INVALID_ARGUMENT",
      "比较需要 2–10 个 appid",
    );
    const items = [];
    for (const id of targets) {
      const g = await new Store(this.c).app(id);
      items.push({
        appid: id,
        name: g.name,
        type: g.type,
        price: g.price_overview ?? null,
        release_date: g.release_date,
        genres: g.genres,
        platforms: g.platforms,
        requirements: {
          windows: g.pc_requirements,
          mac: g.mac_requirements,
          linux: g.linux_requirements,
        },
        metacritic: g.metacritic ?? null,
        categories: g.categories,
        controller_support: g.controller_support ?? null,
      });
    }
    return { items, country: this.c.country };
  }
  async search(query: string, user = "me", limit = 20): Promise<any> {
    assert(query.trim(), "INVALID_ARGUMENT", "query 不能为空");
    const r = await this.library(user);
    const compact = (s: string) =>
      s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const needle = compact(query);
    const items = r.items
      .map((g: any) => {
        const name = String(g.name ?? "");
        const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        const abbreviation = words
          .map((s: string) => (/^\d+$/.test(s) ? s : s[0]))
          .join("")
          .toLowerCase();
        return {
          ...g,
          match: compact(name).includes(needle)
            ? "name"
            : abbreviation === needle
              ? "abbreviation"
              : null,
        };
      })
      .filter((g: any) => g.match);
    return {
      steamid: r.steamid,
      items: items.slice(0, number(limit, "limit", 1, 10000)),
      total: items.length,
      complete: items.length <= limit,
    };
  }
  async completion(user = "me", limit = 50, perfect = false): Promise<any> {
    const r = await this.library(user),
      games = r.items
        .filter((g: any) => g.has_community_visible_stats)
        .slice(0, number(limit, "limit", 1, 500));
    const progress: any[] = [];
    for (let i = 0; i < games.length; i += 50) {
      const raw = await this.c.api(
        "IPlayerService",
        "GetAchievementsProgress",
        {
          input_json: {
            steamid: r.steamid,
            language: this.c.language,
            appids: games.slice(i, i + 50).map((g: any) => g.appid),
            include_unvetted_apps: true,
          },
        },
        true,
      );
      assert(
        Array.isArray(raw.achievement_progress) ||
          Object.keys(raw).length === 0,
        "PARSE_ERROR",
        "成就汇总响应格式变化",
      );
      progress.push(...(raw.achievement_progress ?? []));
    }
    const byId = new Map<number, any>(progress.map((p) => [p.appid, p]));
    let items = games.map((g: any) => {
      const p = byId.get(g.appid);
      return {
        appid: g.appid,
        name: g.name,
        unlocked: p ? (p.unlocked ?? 0) : null,
        total: p ? (p.total ?? 0) : null,
        percentage: p ? (p.percentage ?? 0) : null,
        perfect: p ? Boolean(p.all_unlocked && (p.total ?? 0) > 0) : null,
      };
    });
    const allKnown = items.every((g: any) => g.total !== null);
    if (perfect) items = items.filter((g: any) => g.perfect === true);
    return {
      steamid: r.steamid,
      items,
      scanned: games.length,
      complete:
        games.length ===
          r.items.filter((g: any) => g.has_community_visible_stats).length &&
        allKnown,
      source: "player-service",
    };
  }
  async wishlist(user = "me", limit = 20, discounted = false): Promise<any> {
    const r = await this.community.wishlist(user),
      items = [];
    for (const row of r.items.slice(0, number(limit, "limit", 1, 500))) {
      const game = await new Store(this.c).app(row.appid);
      const item = {
        ...row,
        name: game.name,
        price: game.price_overview ?? null,
        is_free: game.is_free,
        url: game.url,
      };
      if (!discounted || (item.price?.discount_percent ?? 0) > 0)
        items.push(item);
    }
    return {
      steamid: r.steamid,
      items,
      total: r.total,
      scanned: Math.min(limit, r.total),
      complete: r.total <= limit,
      country: this.c.country,
    };
  }
  async value(user = "me", limit = 20): Promise<any> {
    const r = await this.library(user),
      prices = new Map<string, number>(),
      items = [];
    for (const g of r.items.slice(0, number(limit, "limit", 1, 500))) {
      const game = await new Store(this.c).app(g.appid),
        price = game.price_overview;
      items.push({
        appid: g.appid,
        name: g.name,
        price: price ?? null,
        is_free: game.is_free,
        available: true,
      });
      if (price)
        prices.set(
          price.currency,
          (prices.get(price.currency) ?? 0) + price.final,
        );
    }
    return {
      steamid: r.steamid,
      items,
      totals: [...prices].map(([currency, minor_units]) => ({
        currency,
        minor_units,
      })),
      scanned: items.length,
      total: r.total,
      complete: items.length === r.total,
      basis: "current storefront price; not purchase cost or resale value",
    };
  }
  async timeline(user = "me", year?: number): Promise<any> {
    const r = await this.library(user),
      groups = new Map<string, any>();
    for (const g of r.items) {
      if (!g.rtime_last_played) continue;
      const date = new Date(g.rtime_last_played * 1000);
      if (
        year !== undefined &&
        date.getUTCFullYear() !== number(year, "year", 1970, 2100)
      )
        continue;
      const month = date.toISOString().slice(0, 7),
        row = groups.get(month) ?? {
          month,
          games_last_played: 0,
          lifetime_minutes_for_group: 0,
          appids: [],
        };
      row.games_last_played++;
      row.lifetime_minutes_for_group += g.playtime_forever ?? 0;
      row.appids.push(g.appid);
      groups.set(month, row);
    }
    return {
      steamid: r.steamid,
      items: [...groups.values()].sort((a, b) =>
        b.month.localeCompare(a.month),
      ),
      basis: "latest-played-date snapshot",
      historical_monthly_playtime_available: false,
      timezone: "UTC",
      year: year ?? null,
    };
  }
  async history(user = "me", limit = 100): Promise<any> {
    const r = await this.library(user);
    let localIds = new Set<number>();
    try {
      localIds = new Set(installed().items.map((g: any) => g.appid));
    } catch {}
    return {
      steamid: r.steamid,
      items: r.items
        .slice(0, number(limit, "limit", 1, 100000))
        .map((g: any) => ({ ...g, installed: localIds.has(g.appid) })),
      total: r.total,
      complete: r.total <= limit,
      basis: "Steam lifetime totals including uninstalled games",
      session_history_available: false,
    };
  }
}
