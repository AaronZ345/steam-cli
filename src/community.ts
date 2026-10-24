import { load } from "cheerio";
import { appid, assert, CliError, number } from "./core.js";
import { Client } from "./http.js";

const ID_BASE = 76561197960265728n;
export function steamid(input: string): string | null {
  if (/^7656119\d{10}$/.test(input)) return input;
  const url = /^https:\/\/steamcommunity\.com\/profiles\/(\d+)(?:[/?#]|$)/.exec(
    input,
  );
  if (url) return steamid(url[1]);
  const id3 = /^\[U:1:(\d+)\]$/.exec(input);
  const id2 = /^STEAM_[01]:([01]):(\d+)$/.exec(input);
  const account = id3
    ? BigInt(id3[1])
    : id2
      ? BigInt(id2[2]) * 2n + BigInt(id2[1])
      : null;
  if (account !== null && account >= 0n && account <= 0xffffffffn)
    return String(ID_BASE + account);
  return null;
}
export function idForms(input: string): object {
  const id = steamid(input);
  assert(id, "INVALID_ARGUMENT", "不是有效 SteamID");
  const account = BigInt(id) - ID_BASE;
  assert(
    account >= 0n && account <= 0xffffffffn,
    "INVALID_ARGUMENT",
    "不是个人 SteamID",
  );
  return {
    steamid64: id,
    steamid3: `[U:1:${account}]`,
    steamid2: `STEAM_0:${account % 2n}:${account / 2n}`,
    accountid: Number(account),
    url: `https://steamcommunity.com/profiles/${id}/`,
  };
}
export function parseProfile(xml: string): any {
  const $ = load(xml, { xmlMode: true });
  const err = $("error").text().trim();
  assert(!err, "ACCESS_DENIED", err || "无法读取用户");
  const id = $("steamID64").first().text().trim();
  assert(steamid(id), "PARSE_ERROR", "用户资料没有返回有效 SteamID");
  const get = (n: string) => $(n).first().text().trim() || null;
  return {
    steamid: id,
    name: get("steamID"),
    visibility: get("privacyState"),
    online_state: get("onlineState"),
    headline: get("headline"),
    summary: get("summary"),
    avatar: get("avatarFull"),
    custom_url: get("customURL"),
    member_since: get("memberSince"),
    location: get("location"),
    vac_banned: get("vacBanned") === "1",
    url: `https://steamcommunity.com/profiles/${id}/`,
  };
}
export function parseReview(html: string, id: number, owner: string): any {
  const $ = load(html),
    area = $(".review_area").first();
  const reviewID =
    /UserReview_(?:Update(?:_Visibility|_Language|_CommentStatus)?|Rate|VoteTag|ShowUpdateReviewDialog)\(\s*['"](\d+)/.exec(
      html,
    )?.[1] ||
    /(?:recommendationid|recommendationID|recommendationId|reviewid|reviewID)["'\s:=]+["']?(\d+)/i.exec(
      html,
    )?.[1] ||
    $("[data-recommendationid]").first().attr("data-recommendationid");
  if (!area.length && !reviewID) {
    if (/no review|has not written|no recommendations|尚未|还未/i.test(html))
      throw new CliError("NOT_FOUND", "此账号未发表该游戏评测");
    throw new CliError("PARSE_ERROR", "评测页面格式变化或账号不可访问");
  }
  const content = area.find(".content").first().clone();
  content.find("br").replaceWith("\n");
  const vote = area.find(".vote_header .title, .rating").first().text().trim();
  const authorURL =
    $(
      '.reviewAuthor a[href*="/profiles/"], .reviewAuthor a[href*="/id/"], .profile_small_header_name a',
    )
      .first()
      .attr("href") ?? null;
  return {
    appid: id,
    steamid: owner,
    recommendationid: reviewID ?? null,
    text: content.text().trim() || null,
    rendered_text: content.text().trim() || null,
    original_text_available: false,
    voted_up: /not recommended/i.test(vote)
      ? false
      : /^recommended$/i.test(vote)
        ? true
        : null,
    vote_label: vote || null,
    posted: area.find(".posted").text().trim() || null,
    playtime: area.find(".hours").text().trim() || null,
    author_url: authorURL,
    url: `https://steamcommunity.com/profiles/${owner}/recommended/${id}/`,
  };
}
export class Community {
  constructor(public c: Client) {}
  async resolve(input = "me"): Promise<string> {
    if (input === "me") return this.c.requireAuth().steamid;
    const id = steamid(input);
    if (id) return id;
    const name =
      /^https:\/\/steamcommunity\.com\/id\/([^/?#]+)/.exec(input)?.[1] || input;
    assert(
      /^[A-Za-z0-9_-]{1,64}$/.test(name),
      "INVALID_ARGUMENT",
      "请提供 SteamID64、个人资料地址或 vanity 名称",
    );
    return (await this.profile(name)).steamid;
  }
  async profile(input = "me"): Promise<any> {
    const id = input === "me" ? this.c.requireAuth().steamid : steamid(input);
    const name =
      /^https:\/\/steamcommunity\.com\/id\/([^/?#]+)/.exec(input)?.[1] || input;
    assert(
      id || /^[A-Za-z0-9_-]{1,64}$/.test(name),
      "INVALID_ARGUMENT",
      "无效用户标识",
    );
    const xml = await this.c.request(
      `https://steamcommunity.com/${id ? `profiles/${id}` : `id/${name}`}/`,
      { params: { xml: 1 }, text: true, auth: Boolean(this.c.session) },
    );
    return parseProfile(xml);
  }
  async games(
    input = "me",
    opts: { limit?: number; query?: string; sort?: string } = {},
  ): Promise<object> {
    const id = await this.resolve(input);
    let items: any[], source: string;
    if (process.env.STEAM_WEB_API_KEY || this.c.token()) {
      const raw = await this.c.api(
        "IPlayerService",
        "GetOwnedGames",
        {
          steamid: id,
          include_appinfo: true,
          include_played_free_games: true,
          include_free_sub: true,
        },
        true,
      );
      assert(
        Array.isArray(raw.games) || raw.game_count === 0,
        "ACCESS_DENIED",
        "游戏库不可见或认证权限不足",
      );
      items = raw.games ?? [];
      source = "web-api";
    } else {
      const xml = await this.c.request(
        `https://steamcommunity.com/profiles/${id}/games/`,
        { params: { tab: "all", xml: 1 }, text: true },
      );
      const $ = load(xml, { xmlMode: true });
      assert(
        !$("error").length && $("gamesList").length,
        "ACCESS_DENIED",
        "公开游戏库不可用；请登录或提供 STEAM_WEB_API_KEY",
      );
      items = $("game")
        .map((_, el) => {
          const node = $(el),
            hours = node.find("hoursOnRecord").text().replace(/,/g, "");
          return {
            appid: Number(node.find("appID").text()),
            name: node.find("name").text(),
            playtime_forever: hours ? Math.round(Number(hours) * 60) : null,
            playtime_2weeks: node.find("hoursLast2Weeks").text()
              ? Math.round(Number(node.find("hoursLast2Weeks").text()) * 60)
              : null,
          };
        })
        .get();
      source = "community-xml";
    }
    items = items.map((g) => ({
      ...g,
      playtime_hours:
        typeof g.playtime_forever === "number"
          ? Number((g.playtime_forever / 60).toFixed(2))
          : null,
    }));
    if (opts.query)
      items = items.filter((g) =>
        g.name?.toLowerCase().includes(opts.query!.toLowerCase()),
      );
    if (opts.sort === "playtime" || !opts.sort)
      items.sort(
        (a, b) => (b.playtime_forever ?? -1) - (a.playtime_forever ?? -1),
      );
    if (opts.sort === "name")
      items.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    const total = items.length,
      limit = number(opts.limit ?? 100, "limit", 1, 100000);
    return {
      steamid: id,
      items: items.slice(0, limit),
      total,
      complete: total <= limit,
      source,
    };
  }
  async recent(input = "me", limit = 20): Promise<object> {
    return this.c.api(
      "IPlayerService",
      "GetRecentlyPlayedGames",
      { steamid: await this.resolve(input), count: limit },
      true,
    );
  }
  async achievements(input: string | number, user = "me"): Promise<object> {
    const id = appid(input),
      owner = await this.resolve(user);
    const raw = await this.c.api(
      "IPlayerService",
      "GetUserAchievements",
      { input_json: { steamid: owner, appid: id } },
      true,
    );
    const schema = await this.c.api(
      "IPlayerService",
      "GetGameAchievements",
      { input_json: { appid: id, language: this.c.language } },
      true,
    );
    return joinAchievements(id, owner, raw, schema);
  }
  async stats(input: string | number, user = "me"): Promise<object> {
    const id = appid(input),
      owner = await this.resolve(user);
    if (process.env.STEAM_WEB_API_KEY)
      return this.c.api(
        "ISteamUserStats",
        "GetUserStatsForGame",
        { appid: id, steamid: owner },
        true,
        "v2",
      );
    return {
      appid: id,
      steamid: owner,
      source: "player-service",
      ...(await this.c.api(
        "IPlayerService",
        "GetUserStats",
        { input_json: { appid: id, steamid: owner } },
        true,
      )),
    };
  }
  async friends(user = "me"): Promise<object> {
    const id = await this.resolve(user);
    const xml = await this.c.request(
      `https://steamcommunity.com/profiles/${id}/friends/`,
      { params: { xml: 1 }, text: true, auth: Boolean(this.c.session) },
    );
    const $ = load(xml, { xmlMode: true });
    assert(
      !$("error").length && $("friendsList").length,
      "ACCESS_DENIED",
      "好友列表不可见",
    );
    return {
      steamid: id,
      items: $("friend")
        .map((_, el) => ({ steamid: $(el).text().trim() }))
        .get(),
    };
  }
  async wishlist(user = "me"): Promise<any> {
    const id = await this.resolve(user),
      raw = await this.c.api("IWishlistService", "GetWishlist", {
        steamid: id,
      });
    assert(
      Array.isArray(raw.items),
      "ACCESS_DENIED",
      "愿望单不可见或响应格式变化",
    );
    return { steamid: id, items: raw.items, total: raw.items.length };
  }
  async changeWishlist(
    input: string | number,
    remove = false,
    dryRun = true,
  ): Promise<object> {
    const id = appid(input),
      before = await this.wishlist();
    const exists = before.items.some((v: any) => v.appid === id);
    if (exists === !remove)
      return { appid: id, changed: false, verified: true };
    if (dryRun)
      return {
        dry_run: true,
        action: remove ? "wishlist.remove" : "wishlist.add",
        appid: id,
        steamid: this.c.requireAuth().steamid,
      };
    const url = `https://store.steampowered.com/api/${remove ? "removefromwishlist" : "addtowishlist"}`;
    const result = await this.c.request(url, {
      method: "POST",
      auth: true,
      form: { appid: id, sessionid: this.c.csrf(url) },
    });
    assert(
      result.success === true || result.success === 1,
      "API_ERROR",
      "愿望单操作未被接受",
    );
    try {
      const after = await this.wishlist();
      return {
        accepted: true,
        verified: after.items.some((v: any) => v.appid === id) === !remove,
        appid: id,
      };
    } catch {
      return {
        accepted: true,
        verified: false,
        appid: id,
        verification_error: "读回失败，请手动核实",
      };
    }
  }
  async inventory(
    input: string,
    app: number,
    context: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<object> {
    const id = await this.resolve(input);
    assert(/^\d+$/.test(context), "INVALID_ARGUMENT", "context 必须为数字");
    const raw = await this.c.request(
      `https://steamcommunity.com/inventory/${id}/${appid(app)}/${context}`,
      {
        params: {
          l: this.c.language,
          count: number(opts.limit ?? 100, "limit", 1, 5000),
          start_assetid: opts.cursor,
        },
        auth: Boolean(this.c.session),
      },
    );
    assert(raw.success === 1, "ACCESS_DENIED", "库存不可见或读取失败");
    return {
      steamid: id,
      appid: app,
      context,
      assets: raw.assets ?? [],
      descriptions: raw.descriptions ?? [],
      total: raw.total_inventory_count ?? null,
      next_cursor: raw.more_items ? raw.last_assetid : null,
      complete: !raw.more_items,
    };
  }
  async review(input: string | number, user = "me"): Promise<any> {
    const id = appid(input),
      owner = await this.resolve(user);
    if (process.env.STEAM_WEB_API_KEY || this.c.token()) {
      const raw = await this.c.api(
        "IUserReviewsService",
        "GetIndividualRecommendations",
        { input_json: { requests: [{ steamid: owner, appid: id }] } },
        true,
      );
      assert(
        Array.isArray(raw.recommendations),
        "PARSE_ERROR",
        "评测接口响应格式变化",
      );
      const review = raw.recommendations.find(
        (r: any) => String(r.steamid) === owner && Number(r.appid) === id,
      );
      assert(review, "NOT_FOUND", "此账号未发表该游戏评测");
      const fields = [
        "appid",
        "steamid",
        "recommendationid",
        "review",
        "time_created",
        "time_updated",
        "voted_up",
        "is_public",
        "comments_disabled",
        "language",
        "received_compensation",
        "playtime_forever",
        "playtime_at_review",
        "votes_up",
        "votes_funny",
        "comment_count",
      ];
      return {
        ...Object.fromEntries(
          fields.map((field) => [field, review[field] ?? null]),
        ),
        text: review.review,
        original_text_available: true,
        url: `https://steamcommunity.com/profiles/${owner}/recommended/${id}/`,
      };
    }
    const html = await this.c.request(
      `https://steamcommunity.com/profiles/${owner}/recommended/${id}/`,
      { params: { l: "english" }, text: true, auth: Boolean(this.c.session) },
    );
    return parseReview(html, id, owner);
  }
  async reviewList(user = "me", page = 1): Promise<object> {
    const owner = await this.resolve(user),
      html = await this.c.request(
        `https://steamcommunity.com/profiles/${owner}/recommended/`,
        {
          params: { p: number(page, "page", 1), l: "english" },
          text: true,
          auth: Boolean(this.c.session),
        },
      );
    const $ = load(html),
      items = $(".review_box")
        .map((_, el) => {
          const e = $(el),
            href =
              e.find('a[href*="/recommended/"]').first().attr("href") || "",
            id = /\/recommended\/(\d+)/.exec(href)?.[1];
          return {
            appid: id ? Number(id) : null,
            text: e.find(".content").text().trim(),
            title: e.find(".title").text().trim(),
            url: href,
          };
        })
        .get();
    assert(
      items.length ||
        /no reviews|no recommendations|hasn't written|尚未|没有评测/i.test(
          html,
        ),
      "PARSE_ERROR",
      "无法解析评测列表或资料不可见",
    );
    return {
      steamid: owner,
      items,
      page,
      next_page: $(".pagebtn").filter(
        (_, el) => $(el).text().includes(">") || $(el).text().includes("›"),
      ).length
        ? page + 1
        : null,
    };
  }
}
export function joinAchievements(
  id: number,
  owner: string,
  raw: any,
  schema: any,
): object {
  assert(
    Array.isArray(schema.achievements) && Array.isArray(raw.achievements),
    "ACCESS_DENIED",
    "个人成就不可见或游戏没有成就",
  );
  if (raw.schema_hash && schema.schema_hash)
    assert(
      raw.schema_hash === schema.schema_hash,
      "SCHEMA_CHANGED",
      "成就定义在请求期间变化，请重新读取",
    );
  const states = new Map<number, any>(
    raw.achievements.map((a: any) => [a.internal_key, a]),
  );
  const items = schema.achievements
    .filter((a: any) => !a.archived)
    .map((a: any) => {
      const state = states.get(a.internal_key);
      return {
        apiname: a.internal_name,
        name: a.localized_name ?? null,
        description: a.localized_desc ?? null,
        hidden: a.hidden ?? false,
        internal_key: a.internal_key,
        groupid: a.groupid ?? 0,
        achieved: state ? (state.unlocked ? 1 : 0) : null,
        unlocktime: state?.unlock_time ?? (state ? 0 : null),
        global_percent:
          a.player_percent_unlocked === undefined
            ? null
            : Number(a.player_percent_unlocked),
        icon: a.icon ?? null,
        progress_int: state?.progress_int ?? null,
        progress_float: state?.progress_float ?? null,
      };
    });
  return {
    appid: id,
    steamid: owner,
    items,
    unlocked: items.filter((a: any) => a.achieved === 1).length,
    total: items.length,
    complete: items.every((a: any) => a.achieved !== null),
    groups: raw.groups ?? [],
    source: "player-service",
  };
}
