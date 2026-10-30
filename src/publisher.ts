import { appid, assert, number, CliError } from "./core.js";
import { Client } from "./http.js";
import { Extras } from "./extras.js";

function uint64(value: unknown, label: string): string {
  const text = String(value ?? "");
  assert(
    /^\d{1,20}$/.test(text) && BigInt(text) <= 0xffffffffffffffffn,
    "INVALID_ARGUMENT",
    `${label} 必须为 uint64 字符串`,
  );
  return text;
}
function user(value: unknown): string {
  const id = uint64(value, "steamid");
  assert(
    /^7656119\d{10}$/.test(id),
    "INVALID_ARGUMENT",
    "需要明确指定 SteamID64",
  );
  return id;
}
function accepted(raw: any): void {
  const result = raw?.result?.result ?? raw?.result ?? raw?.success;
  assert(
    result === 1 || result === true,
    result === undefined ? "WRITE_UNKNOWN" : "API_ERROR",
    "Steamworks 没有确认写入成功；请先读回检查",
  );
}
export function cents(value: unknown): bigint {
  const s = String(value);
  assert(
    /^-?\d+(?:\.\d{1,2})?$/.test(s),
    "PARSE_ERROR",
    "销售金额不是有效的两位小数",
  );
  const [whole, fractional = ""] = s.replace("-", "").split(".");
  return (
    (BigInt(whole) * 100n + BigInt(fractional.padEnd(2, "0"))) *
    (s.startsWith("-") ? -1n : 1n)
  );
}
function micros(value: unknown): bigint {
  const s = String(value);
  assert(
    /^-?\d{1,30}(?:\.\d{1,6})?$/.test(s),
    "PARSE_ERROR",
    "销售金额超过支持的六位小数精度",
  );
  const [whole, fraction = ""] = s.replace("-", "").split(".");
  return (
    (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"))) *
    (s.startsWith("-") ? -1n : 1n)
  );
}
function dollars(value: bigint): string {
  const v = value < 0n ? -value : value;
  const fractional = String(v % 1000000n)
    .padStart(6, "0")
    .replace(/0{1,4}$/, "");
  return `${value < 0n ? "-" : ""}${v / 1000000n}.${fractional}`;
}
export function dateRange(start: string, end = start): string[] {
  for (const date of [start, end])
    assert(
      /^\d{4}-\d\d-\d\d$/.test(date) &&
        Number.isFinite(Date.parse(date)) &&
        new Date(date).toISOString().slice(0, 10) === date,
      "INVALID_ARGUMENT",
      "日期必须为 YYYY-MM-DD",
    );
  const count = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  assert(
    count >= 1 && count <= 31,
    "INVALID_ARGUMENT",
    "一次最多查询 31 天，结束日期不得早于开始",
  );
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  );
}
export class Publisher {
  constructor(public c: Client) {}
  private async readback(read: () => Promise<any>): Promise<any> {
    try {
      return await read();
    } catch (e: any) {
      throw new CliError(
        "WRITE_UNKNOWN",
        "Steamworks 已接收写入，但读回失败；请先检查状态",
        { accepted: true, readback_error: e.code ?? "COMMAND_FAILED" },
      );
    }
  }
  async call(
    iface: string,
    method: string,
    params: Record<string, any>,
    opts: { write?: boolean; financial?: boolean; version?: string } = {},
  ): Promise<any> {
    const key = opts.financial
      ? process.env.STEAM_FINANCIAL_API_KEY
      : process.env.STEAM_PUBLISHER_API_KEY;
    assert(
      key,
      "AUTH_REQUIRED",
      `需要 ${opts.financial ? "STEAM_FINANCIAL_API_KEY" : "STEAM_PUBLISHER_API_KEY"} 及对应 App 权限`,
    );
    const url = `https://partner.steam-api.com/${iface}/${method}/${opts.version ?? "v1"}/`;
    const args = { ...params, key };
    try {
      const raw = await this.c.request(
        url,
        opts.write ? { method: "POST", form: args } : { params: args },
      );
      const r = raw.response ?? raw;
      assert(
        r && typeof r === "object" && !Array.isArray(r),
        "PARSE_ERROR",
        "Steamworks 响应格式无效",
      );
      if (
        r.success === false ||
        (typeof r.result === "number" && r.result !== 1)
      )
        throw new CliError("API_ERROR", "Steamworks 接口返回失败");
      return r;
    } catch (e) {
      if (e instanceof CliError && e.code === "ACCESS_DENIED")
        throw new CliError(
          "AUTH_FAILED",
          "Steamworks 密钥认证失败、IP 未放行或缺少 App 权限",
        );
      throw e;
    }
  }
  ownership(id: string, steamid: string): Promise<any> {
    return this.call(
      "ISteamUser",
      "CheckAppOwnership",
      { appid: appid(id), steamid: user(steamid) },
      { version: "v4" },
    );
  }
  betas(id: string): Promise<any> {
    return this.call("ISteamApps", "GetAppBetas", { appid: appid(id) });
  }
  builds(id: string, count = 10): Promise<any> {
    return this.call("ISteamApps", "GetAppBuilds", {
      appid: appid(id),
      count: number(count, "count", 1, 1000),
    });
  }
  leaderboards(id: string): Promise<any> {
    return this.call(
      "ISteamLeaderboards",
      "GetLeaderboardsForGame",
      { appid: appid(id) },
      { version: "v2" },
    );
  }
  entries(id: string, p: any): Promise<any> {
    const start = number(p.start ?? 0, "start"),
      end = number(p.end ?? 100, "end", start, start + 1000),
      mode = number(p.mode ?? 0, "mode", 0, 2);
    assert(
      mode === 0 || p.steamid,
      "INVALID_ARGUMENT",
      "玩家附近或好友排名需要 steamid",
    );
    return this.call("ISteamLeaderboards", "GetLeaderboardEntries", {
      appid: appid(id),
      leaderboardid: number(p.board, "board", 1),
      rangestart: start,
      rangeend: end,
      datarequest: mode,
      steamid: p.steamid ? user(p.steamid) : undefined,
    });
  }
  async score(id: string, p: any): Promise<any> {
    const params = {
      appid: appid(id),
      leaderboardid: number(p.board, "board", 1),
      steamid: user(p.steamid),
      score: number(p.score, "score", -2147483648, 2147483647),
      scoremethod: p.method ?? "KeepBest",
    };
    assert(
      ["KeepBest", "ForceUpdate"].includes(params.scoremethod),
      "INVALID_ARGUMENT",
      "method 支持 KeepBest|ForceUpdate",
    );
    if (!p.execute) return { dry_run: true, action: "publisher.score", params };
    const result = await this.call(
      "ISteamLeaderboards",
      "SetLeaderboardScore",
      params,
      { write: true },
    );
    accepted(result);
    let readback: any = null,
      readback_error = null;
    try {
      readback = await this.entries(id, {
        board: p.board,
        steamid: p.steamid,
        mode: 1,
        start: 0,
        end: 0,
      });
    } catch (e: any) {
      readback_error = { code: e.code ?? "COMMAND_FAILED" };
    }
    const rows = readback?.leaderboardEntries ?? readback?.entries ?? [];
    const match = rows.find(
      (r: any) => String(r.steamID ?? r.steamid) === params.steamid,
    );
    return {
      accepted: true,
      verified: match
        ? params.scoremethod === "ForceUpdate" &&
          Number(match.score) === params.score
        : false,
      params,
      readback,
      readback_error,
    };
  }
  async achievement(id: string, p: any): Promise<any> {
    const params = {
      appid: appid(id),
      steamid: user(p.steamid),
      count: 1,
      "name[0]": p.name,
      "value[0]": p.unlocked === false ? 0 : 1,
    };
    assert(
      typeof p.name === "string" && /^[\w.:-]{1,256}$/.test(p.name),
      "INVALID_ARGUMENT",
      "成就 API 名称无效",
    );
    if (!p.execute)
      return { dry_run: true, action: "publisher.achievement", params };
    // Validate the achievement name before changing player stats.
    const schema = await this.call(
      "ISteamUserStats",
      "GetSchemaForGame",
      { appid: params.appid, l: this.c.language },
      { version: "v2" },
    );
    assert(
      schema.game?.availableGameStats?.achievements?.some(
        (a: any) => a.name === p.name,
      ),
      "NOT_FOUND",
      "此 App 没有指定成就",
    );
    accepted(
      await this.call("ISteamUserStats", "SetUserStatsForGame", params, {
        write: true,
      }),
    );
    const readback = await this.readback(() =>
      this.call("ISteamUserStats", "GetPlayerAchievements", {
        appid: params.appid,
        steamid: params.steamid,
        l: this.c.language,
      }),
    );
    const match = readback.playerstats?.achievements?.find(
      (a: any) => a.apiname === p.name,
    );
    return {
      accepted: true,
      verified: match?.achieved === params["value[0]"],
      params,
    };
  }
  async grant(id: string, p: any): Promise<any> {
    const itemids = String(p.items)
      .split(",")
      .map((x) => uint64(x.trim(), "itemdefid"));
    assert(
      itemids.length >= 1 && itemids.length <= 100,
      "INVALID_ARGUMENT",
      "一次最多授予 100 个物品",
    );
    const params = {
      appid: appid(id),
      steamid: user(p.steamid),
      requestid: uint64(p.requestid, "requestid"),
      itemdefid: itemids,
      notify: p.notify === true,
      itempropsjson: "{}",
    };
    assert(
      params.requestid !== "0",
      "INVALID_ARGUMENT",
      "需要非零 requestid 作为幂等标识",
    );
    if (!p.execute) return { dry_run: true, action: "publisher.grant", params };
    const result = await this.call(
      "IInventoryService",
      "AddItem",
      { input_json: JSON.stringify(params) },
      { write: true },
    );
    assert(
      typeof result.item_json === "string",
      "WRITE_UNKNOWN",
      "Steam 没有返回授予结果",
    );
    return {
      accepted: true,
      verified: false,
      appid: params.appid,
      steamid: params.steamid,
      requestid: params.requestid,
      items: JSON.parse(result.item_json),
    };
  }
  async workshop(id: string, p: any): Promise<any> {
    const params: Record<string, any> = {
      publishedfileid: uint64(id, "publishedfileid"),
      appid: appid(p.appid),
      title: p.title,
      file_description: p.description,
      visibility: p.visibility,
    };
    if (p.tags !== undefined) {
      assert(
        Array.isArray(p.tags) &&
          p.tags.length <= 100 &&
          p.tags.every((t: any) => typeof t === "string"),
        "INVALID_ARGUMENT",
        "tags 必须为字符串数组",
      );
      p.tags.forEach((t: string, i: number) => (params[`tags[${i}]`] = t));
    }
    assert(
      p.title !== undefined ||
        p.description !== undefined ||
        p.visibility !== undefined ||
        p.tags !== undefined,
      "INVALID_ARGUMENT",
      "请指定要修改的字段",
    );
    if (!p.execute)
      return { dry_run: true, action: "publisher.workshop-update", params };
    accepted(
      await this.call("IPublishedFileService", "UpdateDetails", params, {
        write: true,
      }),
    );
    const readback = await this.readback(() =>
      new Extras(this.c).workshopInfo(id),
    );
    return { accepted: true, verified: false, readback };
  }
  changed(highwatermark = "0"): Promise<any> {
    return this.call(
      "IPartnerFinancialsService",
      "GetChangedDatesForPartner",
      { highwatermark: uint64(highwatermark, "highwatermark") },
      { financial: true, version: "v001" },
    );
  }
  async sales(p: any): Promise<any> {
    const days = dateRange(p.start, p.end),
      groups = new Map<string, Record<string, bigint>>();
    const fields = [
      "gross_units_sold",
      "gross_units_returned",
      "net_units_sold",
      "gross_units_activated",
      "gross_sales_usd",
      "net_sales_usd",
    ];
    const group = p.group ?? "country";
    assert(
      ["country", "day", "app", "package", "platform"].includes(group),
      "INVALID_ARGUMENT",
      "无效分组",
    );
    let rows = 0;
    for (const day of days) {
      let cursor = "0",
        complete = false;
      for (let page = 0; page < 50; page++) {
        const result = await this.call(
          "IPartnerFinancialsService",
          "GetDetailedSales",
          { date: day, highwatermark_id: cursor },
          { financial: true, version: "v001" },
        );
        assert(
          Array.isArray(result.results) && result.max_id !== undefined,
          "PARSE_ERROR",
          "销售分页缺少 results 或 max_id",
        );
        for (const row of result.results) {
          if (
            p.appid &&
            Number(row.appid ?? row.primary_appid) !== appid(p.appid)
          )
            continue;
          rows++;
          const k = String(
            (
              {
                country: row.country_code,
                day,
                app: row.appid ?? row.primary_appid,
                package: row.packageid,
                platform: row.platform,
              } as any
            )[group] ?? "unknown",
          );
          const sums = groups.get(k) ?? {};
          for (const field of fields)
            if (row[field] !== undefined)
              sums[field] =
                (sums[field] ?? 0n) +
                (field.endsWith("_usd")
                  ? micros(row[field])
                  : BigInt(
                      number(row[field], field, -Number.MAX_SAFE_INTEGER),
                    ));
          groups.set(k, sums);
        }
        const next = uint64(result.max_id, "max_id");
        if (next === cursor) {
          complete = true;
          break;
        }
        assert(
          BigInt(next) > BigInt(cursor),
          "PAGINATION_ERROR",
          "销售分页游标倒退",
        );
        cursor = next;
      }
      assert(complete, "INCOMPLETE", "销售分页超过 50 页，未提供不完整汇总");
    }
    const items = [...groups].map(([key, sums]) => ({
      [group]: key,
      ...Object.fromEntries(
        fields.map((f) => [
          f,
          sums[f] === undefined
            ? null
            : f.endsWith("_usd")
              ? dollars(sums[f])
              : sums[f].toString(),
        ]),
      ),
    }));
    return {
      start: days[0],
      end: days.at(-1),
      timezone: "America/Los_Angeles",
      group,
      rows,
      items,
      complete: true,
      amounts: "decimal strings in USD; absent values stay null",
    };
  }
}
