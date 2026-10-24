import SteamUser from "steam-user";
import { LoginSession, EAuthTokenPlatformType } from "steam-session";
import qr from "qrcode-terminal";
import { setTimeout as delay } from "node:timers/promises";
import { assert, CliError, loadSession, saveSession, number } from "./core.js";
import { type Session } from "./http.js";
import { sessionFromCookies } from "./auth.js";

function userClient(): any {
  return new SteamUser({
    autoRelogin: false,
    dataDirectory: null,
    enablePicsCache: false,
    ...(process.env.HTTPS_PROXY || process.env.https_proxy
      ? { httpProxy: process.env.HTTPS_PROXY || process.env.https_proxy }
      : {}),
  });
}
export async function connect(
  anonymous = false,
  override?: string,
): Promise<any> {
  const session = loadSession() as Session | null,
    token =
      override || process.env.STEAM_REFRESH_TOKEN || session?.refreshToken;
  assert(
    anonymous || token,
    "AUTH_REQUIRED",
    "客户端功能需要 login --qr；浏览器 Cookie 只能用于 Web 功能",
  );
  const user = userClient();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        user.logOff();
        reject(new CliError("NETWORK_ERROR", "Steam 客户端连接超时"));
      }, 30000);
      user.once("loggedOn", () => {
        clearTimeout(timer);
        resolve();
      });
      user.on("error", (e: any) => {
        clearTimeout(timer);
        reject(
          new CliError(
            e.eresult ? "AUTH_FAILED" : "NETWORK_ERROR",
            e.eresult
              ? `Steam 客户端认证失败 (EResult ${e.eresult})`
              : "Steam 客户端连接失败",
          ),
        );
      });
      user.logOn(anonymous ? { anonymous: true } : { refreshToken: token });
    });
    return user;
  } catch (e) {
    user.logOff();
    throw e;
  }
}
export async function withClient<T>(
  fn: (user: any, signal: AbortSignal) => Promise<T>,
  anonymous = false,
): Promise<T> {
  const user = await connect(anonymous);
  const controller = new AbortController();
  try {
    return await Promise.race([
      fn(user, controller.signal),
      new Promise<never>((_, reject) => {
        user.once("error", (e: any) =>
          reject(
            new CliError(
              "NETWORK_ERROR",
              `Steam 客户端断开 (${e.eresult ?? "network"})`,
            ),
          ),
        );
        user.once("disconnected", () =>
          reject(new CliError("NETWORK_ERROR", "Steam 客户端连接已断开")),
        );
      }),
    ]);
  } finally {
    controller.abort();
    user.logOff();
  }
}
export async function loginQR(timeoutSeconds = 120): Promise<object> {
  const seconds = number(timeoutSeconds, "timeout", 30, 300),
    session = new LoginSession(EAuthTokenPlatformType.SteamClient);
  session.loginTimeout = seconds * 1000;
  try {
    const authenticated = new Promise<void>((resolve, reject) => {
      session.once("authenticated", () => resolve());
      session.once("timeout", () =>
        reject(new CliError("AUTH_TIMEOUT", "扫码登录已超时")),
      );
      session.on("error", () =>
        reject(new CliError("AUTH_FAILED", "Steam 扫码认证失败")),
      );
    });
    void authenticated.catch(() => {});
    const result = await session.startWithQR();
    process.stderr.write("请用 Steam 手机应用扫描并确认：\n");
    qr.generate(result.qrChallengeUrl, { small: true }, (image: string) =>
      process.stderr.write(image + "\n"),
    );
    await authenticated;
    const user = await connect(false, session.refreshToken);
    try {
      const cookies = await new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new CliError("NETWORK_ERROR", "获取网页登录态超时")),
          20000,
        );
        user.once("webSession", (_sid: string, list: string[]) => {
          clearTimeout(timer);
          resolve(list);
        });
        user.once("error", () => {
          clearTimeout(timer);
          reject(new CliError("AUTH_FAILED", "网页登录态获取失败"));
        });
        user.webLogOn();
      });
      const entries = cookies.flatMap((cookie) => {
        const [name, ...v] = cookie.split(";")[0].split("=");
        return ["steamcommunity.com", "store.steampowered.com"].map(
          (domain) => ({ name, value: v.join("="), domain, path: "/" }),
        );
      });
      const s = sessionFromCookies(entries, "steam-qr");
      s.refreshToken = session.refreshToken;
      saveSession(s as unknown as Record<string, unknown>);
      return {
        logged_in: true,
        verified: true,
        steamid: s.steamid,
        source: s.source,
        client_auth: true,
      };
    } finally {
      user.logOff();
    }
  } finally {
    session.cancelLoginAttempt();
  }
}
export async function productInfo(id: number): Promise<object> {
  return withClient(async (user) => {
    const raw = await user.getProductInfo([id], [], true);
    return { appid: id, ...raw.apps[id] };
  }, true);
}
export async function networkFriends(): Promise<object> {
  return withClient(async (user) => {
    if (!user.myFriends || !Object.keys(user.myFriends).length)
      await Promise.race([
        new Promise((resolve) => user.once("friendsList", resolve)),
        delay(4000),
      ]);
    return {
      items: Object.entries(user.myFriends || {}).map(
        ([steamid, relationship]) => ({
          steamid,
          relationship,
          name: user.users?.[steamid]?.player_name ?? null,
          gameid: user.users?.[steamid]?.gameid ?? null,
        }),
      ),
    };
  });
}
export async function friendChange(
  id: string,
  remove = false,
  dryRun = true,
): Promise<object> {
  assert(
    /^7656119\d{10}$/.test(id),
    "INVALID_ARGUMENT",
    "好友操作需要 SteamID64",
  );
  if (dryRun)
    return {
      dry_run: true,
      action: remove ? "friends.remove" : "friends.add",
      steamid: id,
    };
  return withClient(async (user) => {
    if (remove) user.removeFriend(id);
    else await user.addFriend(id);
    return { accepted: true, verified: false, steamid: id };
  });
}
export async function chatHistory(id: string, limit = 20): Promise<object> {
  assert(/^7656119\d{10}$/.test(id), "INVALID_ARGUMENT", "聊天需要 SteamID64");
  return withClient((user) =>
    user.chat.getFriendMessageHistory(id, {
      maxCount: number(limit, "limit", 1, 100),
    }),
  );
}
export async function chatSend(
  id: string,
  text: string,
  dryRun = true,
): Promise<object> {
  assert(
    /^7656119\d{10}$/.test(id) && text.trim() && text.length <= 10000,
    "INVALID_ARGUMENT",
    "目标 ID 或消息正文无效",
  );
  if (dryRun) return { dry_run: true, action: "chat.send", steamid: id, text };
  return withClient(async (user) => ({
    accepted: true,
    verified: false,
    result: await user.chat.sendFriendMessage(id, text),
  }));
}
export async function idle(
  apps: number[],
  minutes: number,
  dryRun = true,
): Promise<object> {
  number(minutes, "minutes", 1, 1440);
  assert(
    apps.length > 0 && apps.length <= 32,
    "INVALID_ARGUMENT",
    "一次可挂机 1–32 个游戏",
  );
  if (dryRun)
    return { dry_run: true, action: "playtime.idle", appids: apps, minutes };
  return withClient(async (user, connectionSignal) => {
    const abort = new AbortController();
    const stop = () => abort.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const started = new Date().toISOString();
    try {
      user.gamesPlayed(apps);
      await delay(minutes * 60000, undefined, {
        signal: AbortSignal.any([abort.signal, connectionSignal]),
      }).catch((e) => {
        if (e.name !== "AbortError") throw e;
      });
    } finally {
      user.gamesPlayed([]);
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    }
    return {
      accepted: true,
      verified: false,
      appids: apps,
      started_at: started,
      ended_at: new Date().toISOString(),
      stopped: true,
      note: "Steam 是否计入时长需稍后读取游戏库核实",
    };
  });
}
export async function licenses(): Promise<object> {
  return withClient(async (user) => {
    if (!user.licenses)
      await Promise.race([
        new Promise((resolve) => user.once("licenses", resolve)),
        delay(5000),
      ]);
    return { items: user.licenses ?? [], wallet: user.wallet ?? null };
  });
}
export async function freeLicense(id: number, dryRun = true): Promise<object> {
  if (dryRun) return { dry_run: true, action: "licenses.free", appid: id };
  return withClient(async (user) => ({
    accepted: true,
    verified: false,
    result: await user.requestFreeLicense([id]),
  }));
}
