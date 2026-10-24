import { appid, assert, CliError, errorPayload } from "./core.js";
import { Community } from "./community.js";
import { Client } from "./http.js";

export interface ReviewChanges {
  text?: string;
  recommend?: boolean;
  public?: boolean;
  comments?: boolean;
  language?: string;
  receivedFree?: boolean;
}
export function reviewPatch(changes: ReviewChanges): Record<string, string> {
  assert(
    changes && typeof changes === "object" && !Array.isArray(changes),
    "INVALID_ARGUMENT",
    "changes 必须为 object",
  );
  for (const field of [
    "recommend",
    "public",
    "comments",
    "receivedFree",
  ] as const)
    if (changes[field] !== undefined)
      assert(
        typeof changes[field] === "boolean",
        "INVALID_ARGUMENT",
        `${field} 必须为布尔值`,
      );
  const patch: Record<string, string> = {};
  if (changes.text !== undefined) {
    assert(
      typeof changes.text === "string",
      "INVALID_ARGUMENT",
      "text 必须为字符串",
    );
    assert(
      changes.text.trim().length > 0 &&
        Buffer.byteLength(changes.text) <= 32000,
      "INVALID_ARGUMENT",
      "评测正文须为 1–32000 字节",
    );
    patch.review_text = changes.text;
  }
  if (changes.recommend !== undefined)
    patch.voted_up = String(changes.recommend);
  if (changes.public !== undefined) patch.is_public = String(changes.public);
  if (changes.comments !== undefined)
    patch.comments_disabled = String(!changes.comments);
  if (changes.language !== undefined) {
    assert(
      /^[a-z]{2,20}$/.test(changes.language),
      "INVALID_ARGUMENT",
      "language 必须为 Steam 语言代码",
    );
    patch.language = changes.language;
  }
  if (changes.receivedFree !== undefined)
    patch.received_compensation = String(changes.receivedFree);
  assert(
    Object.keys(patch).length > 0,
    "INVALID_ARGUMENT",
    "请至少指定一个要修改的字段",
  );
  return patch;
}
export class Reviews {
  constructor(
    public c: Client,
    public community = new Community(c),
  ) {}
  async edit(
    input: string | number,
    changes: ReviewChanges,
    dryRun = true,
  ): Promise<object> {
    const id = appid(input),
      patch = reviewPatch(changes),
      owner = this.c.requireAuth().steamid;
    const before = await this.community.review(id);
    assert(
      String(before.steamid) === owner &&
        Number(before.appid) === id &&
        /^\d+$/.test(String(before.recommendationid)),
      "OWNERSHIP_ERROR",
      "评测作者或记录 ID 核验失败",
    );
    if (dryRun)
      return {
        dry_run: true,
        action: "review.edit",
        appid: id,
        recommendationid: String(before.recommendationid),
        steamid: owner,
        before,
        changes: patch,
        preserves_unspecified_fields: true,
      };
    const url = `https://steamcommunity.com/userreviews/update/${before.recommendationid}`;
    const result = await this.c.request(url, {
      method: "POST",
      auth: true,
      form: { ...patch, sessionid: this.c.csrf(url) },
    });
    assert(
      result.success === 1,
      result.success === 21 ? "AUTH_FAILED" : "API_ERROR",
      `Steam 未接受评测更新 (${result.success ?? "unknown"})`,
    );
    try {
      const after = await this.community.review(id);
      const mapping: Record<string, string> = {
        review_text: "review",
        voted_up: "voted_up",
        is_public: "is_public",
        comments_disabled: "comments_disabled",
        language: "language",
        received_compensation: "received_compensation",
      };
      const verified = Object.entries(patch).every(
        ([k, v]) => String(after[mapping[k]]) === v,
      );
      return {
        accepted: true,
        verified,
        appid: id,
        recommendationid: before.recommendationid,
        after,
      };
    } catch (error) {
      return {
        accepted: true,
        verified: false,
        appid: id,
        verification_error: (errorPayload(error) as any).error,
      };
    }
  }
  async create(
    input: string | number,
    changes: ReviewChanges,
    dryRun = true,
  ): Promise<object> {
    const id = appid(input),
      owner = this.c.requireAuth().steamid;
    assert(
      changes.text !== undefined && changes.recommend !== undefined,
      "INVALID_ARGUMENT",
      "创建评测需要正文和 --recommend yes|no",
    );
    reviewPatch(changes);
    try {
      await this.community.review(id);
      throw new CliError("ALREADY_EXISTS", "已有评测，请使用 review edit");
    } catch (e) {
      if (!(e instanceof CliError && e.code === "NOT_FOUND")) throw e;
    }
    const payload = {
      appid: id,
      steamworksappid: id,
      comment: changes.text,
      rated_up: String(changes.recommend),
      is_public: String(changes.public ?? true),
      language: changes.language ?? this.c.language,
      received_compensation: changes.receivedFree ? 1 : 0,
      disable_comments: changes.comments === false ? 1 : 0,
    };
    if (dryRun)
      return {
        dry_run: true,
        action: "review.create",
        steamid: owner,
        payload,
      };
    const url = "https://store.steampowered.com/friends/recommendgame";
    const result = await this.c.request(url, {
      method: "POST",
      auth: true,
      form: { ...payload, sessionid: this.c.csrf(url) },
    });
    assert(
      result.success === 1 || result.success === true,
      result.success === 21 ? "AUTH_FAILED" : "API_ERROR",
      "Steam 未接受新评测",
    );
    try {
      const after = await this.community.review(id);
      return {
        accepted: true,
        verified:
          after.review === changes.text && after.voted_up === changes.recommend,
        after,
      };
    } catch {
      return { accepted: true, verified: false, appid: id };
    }
  }
  async delete(input: string | number, dryRun = true): Promise<object> {
    const id = appid(input),
      owner = this.c.requireAuth().steamid,
      before = await this.community.review(id);
    assert(
      String(before.steamid) === owner && Number(before.appid) === id,
      "OWNERSHIP_ERROR",
      "评测作者核验失败",
    );
    if (dryRun) return { dry_run: true, action: "review.delete", before };
    const url = "https://steamcommunity.com/my/recommended";
    await this.c.request(url, {
      method: "POST",
      auth: true,
      text: true,
      form: { action: "delete", appid: id, sessionid: this.c.csrf(url) },
    });
    try {
      await this.community.review(id);
      return { accepted: false, verified: false, appid: id };
    } catch (e) {
      if (e instanceof CliError && e.code === "NOT_FOUND")
        return { accepted: true, verified: true, appid: id };
      return { accepted: null, verified: false, appid: id };
    }
  }
  async vote(
    review: string,
    up = true,
    funny = false,
    dryRun = true,
  ): Promise<object> {
    assert(/^\d+$/.test(review), "INVALID_ARGUMENT", "评测 ID 必须是数字");
    this.c.requireAuth();
    if (dryRun)
      return {
        dry_run: true,
        action: funny ? "review.funny" : "review.vote",
        recommendationid: review,
        up,
      };
    const url = `https://steamcommunity.com/userreviews/${funny ? "votetag" : "rate"}/${review}`;
    const result = await this.c.request(url, {
      method: "POST",
      auth: true,
      form: {
        sessionid: this.c.csrf(url),
        rateup: String(up),
        ...(funny ? { tagid: 1 } : {}),
      },
    });
    assert(
      result.success === 1,
      result.success === 21 ? "AUTH_FAILED" : "API_ERROR",
      "Steam 未接受评测投票",
    );
    return { accepted: true, verified: false, recommendationid: review };
  }
}
