import { load } from "cheerio";
import { appid, assert, CliError, number } from "./core.js";
import { Client } from "./http.js";

export function parseSearch(html: string): any[] {
  const $ = load(html);
  return $("a.search_result_row")
    .map((_, el) => {
      const row = $(el),
        href = row.attr("href") || "";
      const id = /\/app\/(\d+)/.exec(href)?.[1];
      return {
        id: row.attr("data-ds-appid") || row.attr("data-ds-packageid") || null,
        appid: id ? Number(id) : null,
        name: row.find(".title").text().trim(),
        url: href,
        release_date: row.find(".search_released").text().trim() || null,
        price:
          row
            .find(".discount_final_price, .search_price")
            .first()
            .text()
            .trim() || null,
        discount_percent: row.find(".discount_pct").text().trim() || null,
        review_summary:
          row
            .find(".search_review_summary")
            .attr("data-tooltip-html")
            ?.replace(/<[^>]*>/g, " ") || null,
      };
    })
    .get();
}
export class Store {
  constructor(public c: Client) {}
  async search(
    query = "",
    opts: {
      limit?: number;
      offset?: number;
      sort?: string;
      specials?: boolean;
      filter?: string;
      tags?: string;
    } = {},
  ): Promise<object> {
    const limit = number(opts.limit ?? 20, "limit", 1, 100),
      offset = number(opts.offset ?? 0, "offset");
    if (query && !opts.specials && !opts.filter && !opts.sort && !opts.tags) {
      assert(
        offset + limit <= 100,
        "INVALID_ARGUMENT",
        "名称搜索目前支持前 100 项；使用更精确名称或 appid",
      );
      const raw = await this.c.api("IStoreQueryService", "SearchSuggestions", {
        input_json: {
          search_term: query,
          max_results: offset + limit,
          context: {
            country_code: this.c.country,
            language: this.c.language,
            steam_realm: 1,
          },
          data_request: { include_assets: true, include_reviews: true },
        },
      });
      assert(
        Array.isArray(raw.store_items),
        "PARSE_ERROR",
        "StoreQuery 搜索响应格式变化",
      );
      const total = raw.metadata?.total_matching_records ?? null;
      return {
        items: raw.store_items.slice(offset, offset + limit),
        total,
        offset,
        next_offset:
          typeof total === "number" && offset + limit < Math.min(total, 100)
            ? offset + limit
            : null,
        source: "store-query-suggestions",
        complete: typeof total === "number" && offset + limit >= total,
      };
    }
    if (
      opts.filter &&
      ["topsellers", "specials", "newreleases", "comingsoon"].includes(
        opts.filter,
      )
    ) {
      const raw: any = await this.featured(),
        key = {
          topsellers: "top_sellers",
          specials: "specials",
          newreleases: "new_releases",
          comingsoon: "coming_soon",
        }[opts.filter]!;
      const category = raw[key];
      assert(Array.isArray(category?.items), "PARSE_ERROR", "精选榜单结构变化");
      return {
        items: category.items.slice(offset, offset + limit),
        total: category.items.length,
        offset,
        next_offset:
          offset + limit < category.items.length ? offset + limit : null,
        source: "steam-featured-categories",
        scope: "featured-list",
      };
    }
    const raw = await this.c.request(
      "https://store.steampowered.com/search/results/",
      {
        params: {
          term: query,
          start: offset,
          count: limit,
          cc: this.c.country,
          l: this.c.language,
          json: 1,
          sort_by: opts.sort,
          specials: opts.specials ? 1 : undefined,
          filter: opts.filter,
          tags: opts.tags,
          ignore_preferences: 1,
        },
      },
    );
    if (typeof raw.results_html !== "string") {
      assert(
        !query,
        "UNSUPPORTED_FILTER",
        "旧搜索接口不可用，当前名称搜索请使用 query 和 limit/offset",
      );
      const result = await this.c.api("IStoreQueryService", "Query", {
        input_json: {
          query: {
            start: offset,
            count: limit,
            sort:
              opts.sort === undefined ? 0 : number(opts.sort, "sort", 0, 100),
            filters: {
              ...(opts.specials
                ? { price_filters: { min_discount_percent: 1 } }
                : {}),
              ...(opts.tags
                ? {
                    tagids_must_match: [
                      { tagids: opts.tags.split(",").map(Number) },
                    ],
                  }
                : {}),
              ...(opts.filter === "comingsoon"
                ? { coming_soon_only: true }
                : {}),
            },
          },
          context: {
            country_code: this.c.country,
            language: this.c.language,
            steam_realm: 1,
          },
          data_request: { include_assets: true, include_reviews: true },
        },
      });
      assert(
        Array.isArray(result.store_items),
        "PARSE_ERROR",
        "StoreQuery 列表响应格式变化",
      );
      return {
        items: result.store_items,
        metadata: result.metadata,
        offset,
        next_offset:
          result.store_items.length === limit ? offset + limit : null,
        source: "store-query",
      };
    }
    assert(
      Number.isFinite(Number(raw.total_count)),
      "PARSE_ERROR",
      "商店搜索缺少结果总数",
    );
    const items = parseSearch(raw.results_html);
    assert(
      items.length > 0 ||
        Number(raw.total_count) === 0 ||
        offset >= Number(raw.total_count),
      "PARSE_ERROR",
      "商店返回了无法解析的搜索结果",
    );
    return {
      items,
      total: Number(raw.total_count),
      offset,
      next_offset:
        offset + items.length < Number(raw.total_count)
          ? offset + items.length
          : null,
      source: "steam-store",
    };
  }
  async app(input: string | number): Promise<any> {
    const id = appid(input),
      raw = await this.c.request(
        "https://store.steampowered.com/api/appdetails",
        { params: { appids: id, cc: this.c.country, l: this.c.language } },
      );
    assert(
      raw[id]?.success && raw[id]?.data,
      "NOT_FOUND",
      "游戏不存在或在所选地区不可用",
    );
    return {
      ...raw[id].data,
      url: `https://store.steampowered.com/app/${id}/`,
      country: this.c.country,
      language: this.c.language,
    };
  }
  async browseItem(id: number): Promise<any> {
    const raw = await this.c.api("IStoreBrowseService", "GetItems", {
      input_json: {
        ids: [{ appid: id }],
        context: {
          country_code: this.c.country,
          language: this.c.language,
          steam_realm: 1,
        },
        data_request: {
          include_assets: true,
          include_release: true,
          include_platforms: true,
          include_all_purchase_options: true,
          include_reviews: true,
          include_tag_count: 20,
        },
      },
    });
    assert(raw.store_items?.length, "NOT_FOUND", "StoreBrowse 没有返回游戏");
    return raw.store_items[0];
  }
  async price(input: string | number, compare?: string): Promise<object> {
    const id = appid(input),
      countries = compare
        ? [...new Set(compare.split(",").map((s) => s.trim().toUpperCase()))]
        : [this.c.country];
    assert(
      countries.length <= 20 && countries.every((cc) => /^[A-Z]{2}$/.test(cc)),
      "INVALID_ARGUMENT",
      "compare 接受最多 20 个两字母国家代码",
    );
    const items = [];
    for (const country of countries) {
      const c = new Client({
        session: null,
        country,
        language: this.c.language,
        timeout: this.c.timeout,
        interval: this.c.interval,
      });
      try {
        const game = await new Store(c).app(id);
        items.push({
          appid: id,
          name: game.name,
          country,
          is_free: game.is_free,
          available: true,
          price: game.price_overview ?? null,
          packages: game.package_groups ?? [],
        });
      } catch (e) {
        if (e instanceof CliError && e.code === "NOT_FOUND")
          items.push({ appid: id, country, available: false, price: null });
        else throw e;
      } finally {
        await c.close();
      }
    }
    return { items, currency_conversion: false };
  }
  async reviews(
    input: string | number,
    opts: {
      limit?: number;
      cursor?: string;
      filter?: string;
      type?: string;
      language?: string;
      purchaseType?: string;
      maxPages?: number;
    } = {},
  ): Promise<object> {
    const id = appid(input),
      limit = number(opts.limit ?? 20, "limit", 1, 10000),
      maxPages = number(opts.maxPages ?? 1, "max-pages", 1, 100);
    let cursor = opts.cursor ?? "*",
      summary: any = null,
      pages = 0,
      complete = false;
    const items: any[] = [],
      seen = new Set<string>();
    while (items.length < limit && pages < maxPages) {
      assert(!seen.has(cursor), "PAGINATION_ERROR", "Steam 重复返回相同游标");
      seen.add(cursor);
      let raw;
      try {
        if (cursor.startsWith("community:"))
          return this.communityReviews(id, opts);
        raw = await this.c.request(
          `https://store.steampowered.com/appreviews/${id}`,
          {
            params: {
              json: 1,
              cursor,
              num_per_page: Math.min(100, limit - items.length),
              filter: opts.filter ?? "all",
              review_type: opts.type ?? "all",
              language: opts.language ?? "all",
              purchase_type: opts.purchaseType ?? "all",
            },
          },
        );
      } catch (e) {
        if (
          e instanceof CliError &&
          e.code === "PARSE_ERROR" &&
          pages === 0 &&
          cursor === "*"
        )
          return this.communityReviews(id, opts);
        throw e;
      }
      assert(
        raw.success === 1 && Array.isArray(raw.reviews),
        "API_ERROR",
        "评价列表请求失败",
      );
      summary ??= raw.query_summary;
      pages++;
      items.push(...raw.reviews);
      if (raw.reviews.length === 0) {
        complete = true;
        break;
      }
      assert(
        typeof raw.cursor === "string",
        "PAGINATION_ERROR",
        "评价列表缺少后续游标",
      );
      cursor = raw.cursor;
    }
    return {
      appid: id,
      items,
      summary,
      pages,
      next_cursor: complete ? null : cursor,
      complete,
    };
  }
  async communityReviews(
    id: number,
    opts: {
      limit?: number;
      cursor?: string;
      filter?: string;
      type?: string;
      language?: string;
      purchaseType?: string;
      maxPages?: number;
    },
  ): Promise<object> {
    assert(
      !opts.purchaseType || opts.purchaseType === "all",
      "UNSUPPORTED_FILTER",
      "Steam 旧评价接口不可用；社区后备读取不支持 purchase-type",
    );
    const limit = number(opts.limit ?? 20, "limit", 1, 10000),
      maxPages = number(opts.maxPages ?? 1, "max-pages", 1, 100);
    let offset = opts.cursor?.startsWith("community:")
        ? number(opts.cursor.slice(10), "cursor-offset")
        : 0,
      pages = 0,
      complete = false;
    const items: any[] = [],
      seen = new Set<string>();
    while (pages < maxPages && items.length < limit) {
      const html = await this.c.request(
        `https://steamcommunity.com/app/${id}/homecontent/`,
        {
          params: {
            userreviewsoffset: offset,
            p: Math.floor(offset / 10) + 1,
            numperpage: 10,
            browsefilter:
              opts.filter === "recent"
                ? "mostrecent"
                : opts.filter === "updated"
                  ? "recentlyupdated"
                  : "toprated",
            appHubSubSection: 10,
            l: "english",
            filterLanguage: opts.language || "all",
          },
          text: true,
        },
      );
      const parsed = parseCommunityReviews(html);
      assert(
        parsed.length ||
          /no more|no reviews|NoMatching|apphub_NoMoreContent/i.test(html) ||
          !html.trim(),
        "PARSE_ERROR",
        "社区评价页面格式变化",
      );
      pages++;
      if (!parsed.length) {
        complete = true;
        break;
      }
      for (const review of parsed) {
        const key = review.url || review.review;
        assert(!seen.has(key), "PAGINATION_ERROR", "社区评价重复返回同一记录");
        seen.add(key);
        offset++;
        if (
          !opts.type ||
          opts.type === "all" ||
          review.voted_up === (opts.type === "positive")
        )
          items.push(review);
        if (items.length === limit) break;
      }
    }
    const browse = await this.browseItem(id);
    return {
      appid: id,
      items,
      summary: browse.reviews ?? null,
      pages,
      next_cursor: complete ? null : `community:${offset}`,
      complete,
      source: "steam-community-fallback",
      unavailable_fields: [
        "recommendationid",
        "purchase_type",
        "playtime_at_review",
      ],
    };
  }
  async news(input: string | number, limit = 20): Promise<object> {
    const id = appid(input),
      raw = await this.c.api(
        "ISteamNews",
        "GetNewsForApp",
        { appid: id, count: number(limit, "limit", 1, 100), maxlength: 0 },
        false,
        "v2",
      );
    assert(raw.appnews, "PARSE_ERROR", "新闻响应无效");
    return raw.appnews;
  }
  async players(input: string | number): Promise<object> {
    const id = appid(input),
      raw = await this.c.api("ISteamUserStats", "GetNumberOfCurrentPlayers", {
        appid: id,
      });
    assert(
      raw.result === 1 && typeof raw.player_count === "number",
      "API_ERROR",
      "在线人数不可用",
    );
    return { appid: id, players: raw.player_count };
  }
  async achievements(input: string | number): Promise<object> {
    const id = appid(input),
      raw = await this.c.api(
        "ISteamUserStats",
        "GetGlobalAchievementPercentagesForApp",
        { gameid: id },
        false,
        "v2",
      );
    assert(
      Array.isArray(raw.achievementpercentages?.achievements),
      "NOT_FOUND",
      "此游戏没有公开成就数据",
    );
    return { appid: id, items: raw.achievementpercentages.achievements };
  }
  async featured(): Promise<object> {
    return this.c.request(
      "https://store.steampowered.com/api/featuredcategories",
      { params: { cc: this.c.country, l: this.c.language } },
    );
  }
  async dlc(input: string | number): Promise<object> {
    return this.c.request("https://store.steampowered.com/api/dlcforapp", {
      params: { appid: appid(input), cc: this.c.country, l: this.c.language },
    });
  }
  async media(input: string | number): Promise<object> {
    const game = await this.app(input);
    return {
      appid: game.steam_appid,
      header_image: game.header_image,
      background: game.background,
      screenshots: game.screenshots ?? [],
      movies: game.movies ?? [],
    };
  }
  async package(input: string): Promise<object> {
    const id = number(input, "package", 1),
      raw = await this.c.request(
        "https://store.steampowered.com/api/packagedetails",
        { params: { packageids: id, cc: this.c.country, l: this.c.language } },
      );
    assert(raw[id]?.success, "NOT_FOUND", "套餐不存在或地区不可用");
    return raw[id].data;
  }
  async similar(input: string | number, limit = 20): Promise<object> {
    const id = appid(input),
      html = await this.c.request(
        `https://store.steampowered.com/recommended/morelike/app/${id}/`,
        { params: { cc: this.c.country, l: this.c.language }, text: true },
      );
    const $ = load(html),
      seen = new Set<number>(),
      items: any[] = [];
    $("a[data-ds-appid]").each((_, el) => {
      const row = $(el),
        value = Number(row.attr("data-ds-appid"));
      if (!Number.isSafeInteger(value) || seen.has(value)) return;
      seen.add(value);
      items.push({
        appid: value,
        name:
          row
            .find(".tab_item_name, .match_name, .title")
            .first()
            .text()
            .trim() ||
          row.find("img").attr("alt") ||
          null,
        url: `https://store.steampowered.com/app/${value}/`,
      });
    });
    assert(
      items.length || /no recommendations|没有推荐/i.test(html),
      "PARSE_ERROR",
      "相似游戏页面未返回可解析数据",
    );
    return { appid: id, items: items.slice(0, limit) };
  }
  async events(): Promise<object> {
    const html = await this.c.request(
      "https://partner.steamgames.com/doc/marketing/upcoming_events",
      { text: true },
    );
    const $ = load(html);
    const rows: string[][] = [];
    $("table tr").each((_, el) => {
      const cells = $(el)
        .find("td")
        .map((_, td) => $(td).text().trim())
        .get();
      if (cells.length) rows.push(cells);
    });
    assert(rows.length, "PARSE_ERROR", "活动日历页面格式变化");
    return {
      rows,
      source: "https://partner.steamgames.com/doc/marketing/upcoming_events",
    };
  }
}
export function parseCommunityReviews(html: string): any[] {
  const $ = load(html);
  return $(".apphub_Card")
    .filter((_, el) => $(el).find(".apphub_CardTextContent").length > 0)
    .map((_, el) => {
      const row = $(el),
        body = row.find(".apphub_CardTextContent").clone(),
        posted = body.find(".date_posted").text().trim();
      body.find(".date_posted").remove();
      body.find("br").replaceWith("\n");
      const vote = row.find(".vote_header .title").text().trim(),
        url = row.attr("data-modal-content-url") || null;
      return {
        recommendationid: null,
        author: {
          steamid: /\/profiles\/(\d+)/.exec(url || "")?.[1] || null,
          name: row.find(".apphub_CardContentAuthorName").text().trim() || null,
        },
        review: body.text().trim(),
        voted_up:
          vote === "Recommended"
            ? true
            : vote === "Not Recommended"
              ? false
              : null,
        posted: posted || null,
        playtime: row.find(".hours").text().trim() || null,
        url,
      };
    })
    .get();
}
