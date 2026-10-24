import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { getCookies } from "@steipete/sweet-cookie";
import {
  assertBrowserPlatform,
  browserEnvironment,
  CHROMIUM_BROWSERS,
  COOKIE_BROWSERS,
  findBrowserExecutable,
  type CookieBrowserName,
} from "./browser-platform.js";
import {
  readChromiumCookies,
  resolveCookieDatabases,
} from "./browser-cookies.js";
import { assert, CliError, loadSession, saveSession } from "./core.js";
import { Client, type Cookie, type Session } from "./http.js";

const names = [
  "steamLoginSecure",
  "sessionid",
  "steamCountry",
  "birthtime",
  "lastagecheckage",
  "wants_mature_content",
];
export function parseCookies(text: string): Cookie[] {
  assert(
    Buffer.byteLength(text) <= 1024 * 1024,
    "INVALID_ARGUMENT",
    "Cookie 文件过大",
  );
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {}
  const entries: Cookie[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.cookies)
      ? raw.cookies
      : [];
  if (entries.length) return validateCookies(entries);
  const netscape = text
    .split(/\r?\n/)
    .filter((l) => l.includes("\t"))
    .flatMap((l) => {
      const cols = l.replace(/^#HttpOnly_/, "").split("\t");
      if (cols.length !== 7 || cols[0].startsWith("#")) return [];
      return [
        {
          domain: cols[0],
          path: cols[2],
          expires: Number(cols[4]),
          name: cols[5],
          value: cols[6],
        },
      ];
    });
  if (netscape.length) return validateCookies(netscape);
  assert(
    !/[\r\n]/.test(text.trim()),
    "INVALID_ARGUMENT",
    "Cookie 请求头必须是单行",
  );
  const header = text
    .trim()
    .replace(/^cookie:\s*/i, "")
    .split(";")
    .flatMap((part) => {
      const i = part.indexOf("=");
      if (i < 1) return [];
      return ["steamcommunity.com", "store.steampowered.com"].map((domain) => ({
        name: part.slice(0, i).trim(),
        value: part.slice(i + 1).trim(),
        domain,
        path: "/",
      }));
    });
  return validateCookies(header);
}
export function validateCookies(entries: Cookie[]): Cookie[] {
  const out = entries.filter(
    (c) =>
      c &&
      names.includes(c.name) &&
      typeof c.domain === "string" &&
      /^(?:\.?steamcommunity\.com|\.?steampowered\.com|\.?store\.steampowered\.com)$/.test(
        c.domain,
      ) &&
      typeof c.value === "string" &&
      c.value &&
      !/[;\r\n\x00]/.test(c.value) &&
      (!c.expires || c.expires === -1 || c.expires > Date.now() / 1000),
  );
  const ids = new Set(
    out
      .filter((c) => c.name === "steamLoginSecure")
      .map((c) => {
        try {
          return decodeURIComponent(c.value).split("||")[0];
        } catch {
          throw new CliError("INVALID_ARGUMENT", "Cookie 编码无效");
        }
      }),
  );
  assert(
    ids.size === 1 && /^7656119\d{10}$/.test([...ids][0] || ""),
    "AUTH_REQUIRED",
    ids.size > 1
      ? "所选 Cookie 包含多个账号，请指定 profile"
      : "没有找到有效的 Steam 登录 Cookie",
  );
  for (const domain of ["steamcommunity.com", "store.steampowered.com"]) {
    if (
      !out.some(
        (c) =>
          c.name === "sessionid" &&
          (c.domain === domain ||
            c.domain === `.${domain}` ||
            (domain.endsWith("steampowered.com") &&
              c.domain === ".steampowered.com")),
      )
    )
      out.push({
        name: "sessionid",
        value: randomBytes(12).toString("hex"),
        domain,
        path: "/",
      });
  }
  return out;
}
export function sessionFromCookies(cookies: Cookie[], source: string): Session {
  const checked = validateCookies(cookies);
  const steamid = decodeURIComponent(
    checked.find((c) => c.name === "steamLoginSecure")!.value,
  ).split("||")[0];
  return {
    steamid,
    source,
    updated_at: new Date().toISOString(),
    cookies: checked,
  };
}
export function status(): object {
  const s = loadSession() as Session | null;
  return s
    ? {
        logged_in: true,
        verified: false,
        steamid: s.steamid,
        source: s.source,
        updated_at: s.updated_at,
        client_auth: Boolean(s.refreshToken),
        web_domains: [
          ...new Set(
            s.cookies
              .filter((c) => c.name === "steamLoginSecure")
              .map((c) => c.domain),
          ),
        ],
      }
    : { logged_in: false, verified: false, client_auth: false };
}
export async function verify(session: Session): Promise<object> {
  const c = new Client({ session });
  try {
    const html = await c.request("https://steamcommunity.com/my/", {
      auth: true,
      text: true,
    });
    const id = /g_steamID\s*=\s*"(\d+)"/.exec(html)?.[1];
    assert(
      id === session.steamid,
      "AUTH_FAILED",
      "Steam 账号核验失败，未保存登录态",
    );
    return {
      logged_in: true,
      verified: true,
      steamid: id,
      source: session.source,
    };
  } finally {
    await c.close();
  }
}
export async function login(opts: {
  browser?: string;
  profile?: string;
  cookieFile?: string;
  cookieStdin?: boolean;
}): Promise<object> {
  let session: Session;
  if (opts.cookieFile || opts.cookieStdin) {
    assert(
      !(opts.cookieFile && opts.cookieStdin),
      "INVALID_ARGUMENT",
      "Cookie 文件和标准输入不能同时使用",
    );
    const text = opts.cookieFile
      ? readFileSync(opts.cookieFile, "utf8")
      : await readStdin();
    session = sessionFromCookies(
      parseCookies(text),
      opts.cookieFile ? "cookie-file" : "stdin",
    );
  } else {
    const name = (opts.browser || "chrome") as CookieBrowserName;
    assert(
      COOKIE_BROWSERS.includes(name),
      "INVALID_ARGUMENT",
      `浏览器支持 ${COOKIE_BROWSERS.join(", ")}`,
    );
    assertBrowserPlatform(name, process.platform);
    assert(
      name !== "safari" || !opts.profile,
      "INVALID_ARGUMENT",
      "Safari 不支持 profile 选择",
    );
    const chromium = CHROMIUM_BROWSERS.find((n) => n === name);
    const cookies: Cookie[] = [];
    if (
      chromium &&
      (process.platform === "linux" ||
        (process.platform === "darwin" && ["vivaldi", "opera"].includes(name)))
    ) {
      const result = await readChromiumCookies(chromium, opts.profile, 15000);
      cookies.push(...result.cookies);
    } else {
      const backend =
        name === "firefox" || name === "safari" || name === "edge"
          ? name
          : "chrome";
      const selected =
        process.platform === "win32" &&
        chromium &&
        !["chrome", "edge"].includes(name)
          ? resolveCookieDatabases(chromium, opts.profile)[0]?.path
          : opts.profile;
      if (
        process.platform === "win32" &&
        chromium &&
        !["chrome", "edge"].includes(name)
      )
        assert(
          selected,
          "AUTH_REQUIRED",
          "未找到所选浏览器资料，请指定 --profile",
        );
      for (const url of [
        "https://steamcommunity.com/",
        "https://store.steampowered.com/",
      ]) {
        const result = await getCookies({
          url,
          names,
          browsers: [backend],
          mode: "first",
          timeoutMs: 15000,
          ...(backend === "chrome" &&
          ["chrome", "arc", "brave", "chromium"].includes(name)
            ? {
                chromiumBrowser: name as
                  "chrome" | "arc" | "brave" | "chromium",
              }
            : {}),
          ...(selected
            ? {
                [backend === "firefox"
                  ? "firefoxProfile"
                  : backend === "edge"
                    ? "edgeProfile"
                    : "chromeProfile"]: selected,
              }
            : {}),
        });
        for (const c of result.cookies)
          cookies.push({
            name: c.name,
            value: c.value,
            domain: c.domain || new URL(url).hostname,
            path: c.path || "/",
            expires: c.expires,
          });
      }
    }
    session = sessionFromCookies(
      cookies,
      `${name}${opts.profile ? ":selected-profile" : ""}`,
    );
  }
  const result = await verify(session);
  saveSession(session as unknown as Record<string, unknown>);
  return result;
}
async function readStdin(): Promise<string> {
  assert(
    !process.stdin.isTTY,
    "INVALID_ARGUMENT",
    "--cookie-stdin 需要管道或重定向输入",
  );
  let text = "";
  for await (const c of process.stdin) {
    text += c.toString();
    assert(
      Buffer.byteLength(text) <= 1024 * 1024,
      "INVALID_ARGUMENT",
      "标准输入过大",
    );
  }
  return text;
}
export function browsers(): object {
  return {
    platform: process.platform,
    browsers: COOKIE_BROWSERS.map((browser) => {
      try {
        assertBrowserPlatform(browser, process.platform);
        return {
          browser,
          supported: true,
          executable:
            browser === "safari"
              ? "/Applications/Safari.app"
              : (findBrowserExecutable(browser, browserEnvironment()) ?? null),
          profile_selectable: browser !== "safari",
        };
      } catch {
        return { browser, supported: false, executable: null };
      }
    }),
  };
}
