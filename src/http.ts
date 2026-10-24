import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";
import { setTimeout as delay } from "node:timers/promises";
import { CliError, assert, config, loadSession, number } from "./core.js";

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
}
export interface Session {
  steamid: string;
  source: string;
  updated_at: string;
  cookies: Cookie[];
  refreshToken?: string;
}
export const HOSTS = new Set([
  "store.steampowered.com",
  "steamcommunity.com",
  "api.steampowered.com",
  "help.steampowered.com",
  "partner.steamgames.com",
]);
export function steamURL(input: string): URL {
  const u = new URL(
    input.startsWith("/") ? `https://api.steampowered.com${input}` : input,
  );
  assert(
    u.protocol === "https:" &&
      HOSTS.has(u.hostname) &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443"),
    "INVALID_ARGUMENT",
    "只允许 Steam 官方 HTTPS 地址",
  );
  return u;
}
export function cookieHeader(cookies: Cookie[], u: URL): string {
  return cookies
    .filter((c) => {
      const d = c.domain.replace(/^\./, "").toLowerCase();
      return (
        (u.hostname === d ||
          (c.domain.startsWith(".") && u.hostname.endsWith(`.${d}`))) &&
        u.pathname.startsWith(c.path || "/") &&
        (!c.expires || c.expires === -1 || c.expires > Date.now() / 1000)
      );
    })
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}
export class Client {
  session: Session | null;
  country: string;
  language: string;
  timeout: number;
  interval: number;
  private last = 0;
  private dispatcher: Dispatcher;
  constructor(
    opts: {
      session?: Session | null;
      country?: string;
      language?: string;
      timeout?: number;
      interval?: number;
      dispatcher?: Dispatcher;
    } = {},
  ) {
    this.dispatcher = opts.dispatcher ?? new EnvHttpProxyAgent();
    this.session = opts.session === undefined ? loadSession() : opts.session;
    const c = config();
    this.country = opts.country || c.country || "CN";
    this.language = opts.language || c.language || "schinese";
    assert(
      /^[A-Za-z]{2}$/.test(this.country),
      "INVALID_ARGUMENT",
      "国家代码必须为两个字母",
    );
    assert(
      /^[a-z]{2,20}$/.test(this.language),
      "INVALID_ARGUMENT",
      "语言代码无效",
    );
    this.timeout = number(opts.timeout ?? 20000, "timeout", 100, 300000);
    this.interval = number(opts.interval ?? 600, "rate-ms", 0, 60000);
  }
  requireAuth(): Session {
    assert(
      this.session,
      "AUTH_REQUIRED",
      "请先 steam-cli login --browser chrome 或 login --qr",
    );
    return this.session;
  }
  token(): string | undefined {
    for (const c of this.session?.cookies ?? []) {
      if (c.name === "steamLoginSecure") {
        const [, token] = decodeURIComponent(c.value).split("||");
        if (token) return token;
      }
    }
    return undefined;
  }
  csrf(url: string): string {
    const s = this.requireAuth();
    const c = s.cookies.find(
      (c) => c.name === "sessionid" && cookieHeader([c], steamURL(url)),
    );
    assert(
      c,
      "AUTH_REQUIRED",
      "当前站点缺少 sessionid；请重新导入对应站点 Cookie",
    );
    return c.value;
  }
  async request(
    input: string,
    opts: {
      method?: string;
      params?: Record<string, any>;
      form?: Record<string, any>;
      auth?: boolean;
      json?: unknown;
      text?: boolean;
    } = {},
  ): Promise<any> {
    const method = opts.method || "GET";
    let url = steamURL(input);
    for (const [k, v] of Object.entries(opts.params ?? {}))
      if (v !== undefined && v !== null)
        url.searchParams.set(
          k,
          typeof v === "object" ? JSON.stringify(v) : String(v),
        );
    if (opts.auth) this.requireAuth();
    const body = opts.form
      ? new URLSearchParams(
          Object.entries(opts.form)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        )
      : opts.json === undefined
        ? undefined
        : JSON.stringify(opts.json);
    let retries = 0,
      redirects = 0;
    for (;;) {
      const wait = this.interval - (Date.now() - this.last);
      if (wait > 0) await delay(wait);
      this.last = Date.now();
      const headers: Record<string, string> = {
        "User-Agent": "steam-cli/0.1.0",
        "Accept-Language":
          this.language === "schinese"
            ? "zh-CN,zh;q=0.9,en;q=0.8"
            : "en-US,en;q=0.9",
        Accept: opts.text ? "text/html,application/xml" : "application/json",
        Origin: `https://${url.hostname}`,
        Referer: `https://${url.hostname}/`,
      };
      if (opts.auth && this.session)
        headers.Cookie = cookieHeader(this.session.cookies, url);
      if (opts.json !== undefined) headers["Content-Type"] = "application/json";
      let res;
      try {
        res = await fetch(url, {
          method,
          headers,
          body,
          redirect: "manual",
          dispatcher: this.dispatcher,
          signal: AbortSignal.timeout(this.timeout),
        });
      } catch {
        throw new CliError(
          method === "GET" || method === "HEAD"
            ? "NETWORK_ERROR"
            : "WRITE_UNKNOWN",
          method === "GET" || method === "HEAD"
            ? "Steam 网络请求失败或超时"
            : "写入结果未知，请先读回核实；没有自动重试",
        );
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        await res.body?.cancel();
        const target = new URL(res.headers.get("location") || "", url);
        if (/\/login(?:\/|$)/.test(target.pathname))
          throw new CliError("AUTH_FAILED", "Steam 登录态已失效，请重新登录");
        assert(
          method === "GET" && redirects++ < 4,
          method === "GET" ? "HTTP_ERROR" : "WRITE_UNKNOWN",
          "请求发生未预期重定向",
        );
        url = steamURL(target.href);
        continue;
      }
      if ([401, 403].includes(res.status)) {
        await res.body?.cancel();
        throw new CliError(
          opts.auth ? "AUTH_FAILED" : "ACCESS_DENIED",
          opts.auth
            ? "Steam 认证失败或当前账号无权限"
            : "Steam 拒绝访问，请检查公开性或访问限制",
        );
      }
      if (res.status === 429 || res.status >= 500) {
        await res.body?.cancel();
        if (method !== "GET" && method !== "HEAD")
          throw new CliError(
            "WRITE_UNKNOWN",
            "服务器未给出确定写入结果；没有重试",
          );
        const retryAfter = res.headers.get("retry-after");
        const retryMs = retryAfter
          ? /^\d+$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Date.parse(retryAfter) - Date.now()
          : 1000;
        if (
          retries++ === 0 &&
          Number.isFinite(retryMs) &&
          retryMs >= 0 &&
          retryMs <= 5000
        ) {
          await delay(retryMs);
          continue;
        }
        throw new CliError(
          res.status === 429 ? "RATE_LIMITED" : "HTTP_ERROR",
          `Steam HTTP ${res.status}`,
        );
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new CliError("HTTP_ERROR", `Steam HTTP ${res.status}`);
      }
      if (method === "HEAD") {
        await res.body?.cancel();
        return {
          status: res.status,
          content_type: res.headers.get("content-type"),
          content_length: res.headers.get("content-length"),
        };
      }
      const eresult = res.headers.get("x-eresult");
      if (eresult && eresult !== "1") {
        await res.body?.cancel();
        throw new CliError(
          eresult === "15" ? "ACCESS_DENIED" : "API_ERROR",
          `Steam EResult ${eresult}`,
        );
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for await (const chunk of res.body ?? []) {
          size += chunk.length;
          if (size > 16 * 1024 * 1024)
            throw new CliError("RESPONSE_TOO_LARGE", "响应超过 16 MiB");
          chunks.push(chunk);
        }
      } catch (error) {
        if (error instanceof CliError) throw error;
        throw new CliError(
          method === "GET" || method === "HEAD"
            ? "NETWORK_ERROR"
            : "WRITE_UNKNOWN",
          "响应传输中断；写入请先读回核实",
        );
      }
      const text = Buffer.concat(chunks).toString("utf8");
      if (
        opts.auth &&
        /g_steamID\s*=\s*(?:false|"0")|<form[^>]+id="login_form"/.test(text)
      )
        throw new CliError("AUTH_FAILED", "Steam 登录态核验失败");
      if (opts.text) return text;
      try {
        return JSON.parse(text);
      } catch {
        throw new CliError(
          method === "GET" ? "PARSE_ERROR" : "WRITE_UNKNOWN",
          "Steam 返回了非 JSON 响应",
        );
      }
    }
  }
  async api(
    iface: string,
    method: string,
    params: Record<string, any> = {},
    auth = false,
    version = "v1",
  ): Promise<any> {
    if (auth) {
      const key = process.env.STEAM_WEB_API_KEY;
      if (key) params = { ...params, key };
      else {
        const token = this.token();
        assert(
          token,
          "AUTH_REQUIRED",
          "此接口需要 STEAM_WEB_API_KEY 或网页登录态",
        );
        params = { ...params, access_token: token };
      }
    }
    const data = await this.request(
      `https://api.steampowered.com/${iface}/${method}/${version}/`,
      { params },
    );
    const result = data.response ?? data;
    if (
      result.success === false ||
      (typeof result.success === "number" && result.success !== 1)
    )
      throw new CliError("API_ERROR", "Steam API 报告失败");
    return result;
  }
  async close(): Promise<void> {
    await this.dispatcher.close();
  }
}
