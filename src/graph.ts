import { assert, number, CliError, appid } from "./core.js";
import { steamid, idForms, Community } from "./community.js";
import { Store } from "./store.js";
import { Client } from "./http.js";
import { Extras } from "./extras.js";

export interface Reference {
  kind: "app" | "package" | "bundle" | "user" | "workshop" | "market";
  id: string;
  name?: string;
  url: string;
}
export function reference(input: string): Reference {
  const sid = steamid(input);
  if (sid)
    return {
      kind: "user",
      id: sid,
      url: `https://steamcommunity.com/profiles/${sid}/`,
    };
  if (/^\d+$/.test(input))
    return {
      kind: "app",
      id: String(appid(input)),
      url: `https://store.steampowered.com/app/${appid(input)}/`,
    };
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new CliError("INVALID_ARGUMENT", "需要 Steam 地址、资源 URI 或 ID");
  }
  assert(
    !u.username && !u.password && !u.port,
    "INVALID_ARGUMENT",
    "资源地址不能包含认证或端口",
  );
  if (u.protocol === "steam:") {
    const p = u.pathname.replace(/^\//, "").split("/");
    const kind = (
      {
        app: "app",
        sub: "package",
        package: "package",
        bundle: "bundle",
        profile: "user",
        user: "user",
        workshop: "workshop",
      } as Record<string, Reference["kind"]>
    )[u.hostname];
    assert(
      kind && p[0],
      "INVALID_ARGUMENT",
      "支持 steam://app|package|bundle|user|workshop/ID",
    );
    return canonical(kind, decodeURIComponent(p[0]));
  }
  assert(
    u.protocol === "https:" &&
      ["store.steampowered.com", "steamcommunity.com"].includes(u.hostname),
    "INVALID_ARGUMENT",
    "不是 Steam 官方资源地址",
  );
  const p = u.pathname.split("/").filter(Boolean);
  if (
    u.hostname === "store.steampowered.com" &&
    ["app", "sub", "bundle"].includes(p[0])
  )
    return canonical(
      p[0] === "sub" ? "package" : (p[0] as "app" | "bundle"),
      p[1],
    );
  if (u.hostname === "steamcommunity.com" && ["profiles", "id"].includes(p[0]))
    return canonical("user", p[1]);
  if (
    u.hostname === "steamcommunity.com" &&
    ["sharedfiles", "workshop"].includes(p[0])
  )
    return canonical("workshop", u.searchParams.get("id") || "");
  if (p[0] === "market" && p[1] === "listings" && p[2] && p[3])
    return {
      kind: "market",
      id: String(appid(p[2])),
      name: decodeURIComponent(p.slice(3).join("/")),
      url: u.href,
    };
  throw new CliError("INVALID_ARGUMENT", "无法识别此 Steam 资源");
}
function canonical(kind: Reference["kind"], id: string): Reference {
  assert(
    id &&
      (kind === "user" ? /^[A-Za-z0-9_-]{1,64}$/.test(id) : /^\d+$/.test(id)),
    "INVALID_ARGUMENT",
    "资源 ID 无效",
  );
  const url =
    kind === "app"
      ? `https://store.steampowered.com/app/${id}/`
      : kind === "package"
        ? `https://store.steampowered.com/sub/${id}/`
        : kind === "bundle"
          ? `https://store.steampowered.com/bundle/${id}/`
          : kind === "workshop"
            ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`
            : `https://steamcommunity.com/${steamid(id) ? "profiles" : "id"}/${id}/`;
  return { kind, id, url };
}
export async function readResource(input: string, c: Client): Promise<any> {
  const ref = reference(input),
    store = new Store(c);
  const data =
    ref.kind === "app"
      ? await store.app(ref.id)
      : ref.kind === "package"
        ? await store.package(ref.id)
        : ref.kind === "user"
          ? await new Community(c).profile(ref.id)
          : ref.kind === "workshop"
            ? await new Extras(c).workshopInfo(ref.id)
            : ref.kind === "market"
              ? await new Extras(c).marketPrice(ref.id, ref.name!)
              : await c.request(
                  "https://store.steampowered.com/actions/ajaxresolvebundles",
                  {
                    params: { bundleids: ref.id, cc: c.country, l: c.language },
                  },
                );
  return { reference: ref, data };
}
export async function crawl(
  input: string,
  c: Client,
  opts: { depth?: number; limit?: number } = {},
  read = readResource,
): Promise<any> {
  const depth = number(opts.depth ?? 1, "depth", 0, 4),
    limit = number(opts.limit ?? 10, "limit", 1, 100);
  const queue: Array<{ ref: Reference; depth: number }> = [
      { ref: reference(input), depth: 0 },
    ],
    seen = new Set<string>(),
    items: any[] = [],
    edges: any[] = [],
    errors: any[] = [];
  while (queue.length && items.length + errors.length < limit) {
    const next = queue.shift()!,
      key = `${next.ref.kind}:${next.ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let data: any;
    try {
      const r = await read(next.ref.url, c);
      data = r.data;
      items.push({
        node_id: key,
        kind: next.ref.kind,
        id: next.ref.id,
        name: data.name ?? data.title ?? null,
        depth: next.depth,
        url: next.ref.url,
        data,
      });
    } catch (e: any) {
      if (!items.length && next.depth === 0) throw e;
      errors.push({
        node_id: key,
        code: e.code ?? "COMMAND_FAILED",
        message: e.message,
      });
      continue;
    }
    if (next.depth >= depth) continue;
    const linked: Array<[Reference["kind"], string, string]> = [];
    if (next.ref.kind === "app") {
      for (const id of data.dlc ?? []) linked.push(["app", String(id), "dlc"]);
      for (const demo of data.demos ?? [])
        linked.push(["app", String(demo.appid), "demo"]);
      for (const id of data.packages ?? [])
        linked.push(["package", String(id), "package"]);
      if (data.fullgame?.appid)
        linked.push(["app", String(data.fullgame.appid), "base-game"]);
    }
    if (next.ref.kind === "package")
      for (const item of data.apps ?? [])
        linked.push(["app", String(item.id), "contains"]);
    if (next.ref.kind === "workshop")
      for (const child of data.children ?? [])
        linked.push(["workshop", String(child.publishedfileid), "contains"]);
    for (const [kind, id, relation] of linked) {
      const ref = canonical(kind, id);
      edges.push({ from: key, to: `${kind}:${id}`, relation });
      if (!seen.has(`${kind}:${id}`))
        queue.push({ ref, depth: next.depth + 1 });
    }
  }
  return {
    items,
    edges,
    errors,
    depth,
    limit,
    complete:
      queue.every((x) => seen.has(`${x.ref.kind}:${x.ref.id}`)) &&
      errors.length === 0,
    pending: [
      ...new Set(
        queue
          .filter((x) => !seen.has(`${x.ref.kind}:${x.ref.id}`))
          .map((x) => `${x.ref.kind}:${x.ref.id}`),
      ),
    ],
  };
}
export const convertId = idForms;
