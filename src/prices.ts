import { fetch, EnvHttpProxyAgent } from "undici";
import { appid, assert, CliError } from "./core.js";

export async function itad(
  input: string | number,
  kind: "history" | "prices" | "overview",
  country = "CN",
  days = 30,
): Promise<object> {
  const key = process.env.ITAD_API_KEY || process.env.STEAM_CLI_ITAD_KEY;
  assert(
    key,
    "AUTH_REQUIRED",
    "历史价格和跨店比价需要 ITAD_API_KEY；Steam 当前价格不需要密钥",
  );
  const dispatcher = new EnvHttpProxyAgent();
  const request = async (
    route: string,
    params: Record<string, string>,
    body?: unknown,
  ) => {
    const u = new URL(`https://api.isthereanydeal.com${route}`);
    u.searchParams.set("key", key);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const response = await fetch(u, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      dispatcher,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new CliError("AUTH_FAILED", "IsThereAnyDeal API 认证失败");
    }
    assert(response.ok, "HTTP_ERROR", `IsThereAnyDeal HTTP ${response.status}`);
    return response.json() as Promise<any>;
  };
  try {
    const lookup = await request("/games/lookup/v1", {
      appid: String(appid(input)),
    });
    assert(
      lookup.found && lookup.game?.id,
      "NOT_FOUND",
      "IsThereAnyDeal 未收录该游戏",
    );
    const id = lookup.game.id;
    const data =
      kind === "history"
        ? await request("/games/history/v2", {
            id,
            country,
            since: new Date(Date.now() - days * 86400000).toISOString(),
          })
        : await request(
            kind === "prices" ? "/games/prices/v3" : "/games/overview/v2",
            { country },
            [id],
          );
    return {
      appid: appid(input),
      itad_id: id,
      country,
      source: "isthereanydeal",
      data,
    };
  } finally {
    await dispatcher.close();
  }
}
