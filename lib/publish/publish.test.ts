import { describe, expect, it } from "vitest";
import files from "../github/__fixtures__/sandbox-pr-1-files.json";
import { anchorForLine } from "../diff/anchors";
import { parsePatch } from "../diff/parse";
import { applyTokens, needsRefresh, safeReturnTo, type SessionData } from "../auth/session";
import { createGitHubClient } from "../github/client";
import { createPendingReview, submitReview } from "../github/reviews";
import { formatCommentBody, planPublish, type PublishComment } from "./plan";

const cart = parsePatch(files.find((f) => f.filename === "src/cart.ts")!.patch!);
const byPath = new Map(files.map((f) => [f.filename, parsePatch(f.patch)]));
const card = (idx: number, extra: Partial<PublishComment> = {}): PublishComment => ({
  cardId: `c${idx}`,
  anchor: anchorForLine("src/cart.ts", "old", cart.lines[idx]),
  body: "Why?",
  type: null,
  ...extra,
});

describe("planPublish", () => {
  it("passes valid anchors through with the head commit and a GitHub payload", () => {
    const plan = planPublish([card(3, { type: "question" })], byPath, "head");
    expect(plan.outdated).toEqual([]);
    expect(plan.moved).toEqual([]);
    expect(plan.ready[0].anchor.commitId).toBe("head");
    expect(plan.ready[0].payload).toEqual({ path: "src/cart.ts", line: 17, side: "RIGHT", body: "**Question:** Why?" });
  });

  it("re-anchors comments whose line moved after new commits", () => {
    const moved = parsePatch("@@ -1,2 +1,4 @@\n a\n+x\n+const MAX_QUANTITY = 99;\n b");
    const plan = planPublish([card(3)], new Map([["src/cart.ts", moved]]), "head2");
    expect(plan.moved).toHaveLength(1);
    expect(plan.ready[0].payload.line).toBe(3);
  });

  it("reports comments that can no longer be placed, without dropping them silently", () => {
    const changed = parsePatch("@@ -1,1 +1,1 @@\n-a\n+b");
    const plan = planPublish(
      [card(3), { ...card(4), anchor: { ...card(4).anchor, path: "gone.ts" } }],
      new Map([["src/cart.ts", changed]]),
      "h",
    );
    expect(plan.ready).toEqual([]);
    expect(plan.outdated.map((o) => o.cardId)).toEqual(["c3", "c4"]);
    expect(plan.outdated[1].reason).toMatch(/no longer part of this pull request/);
  });

  it("explains files without a patch", () => {
    expect(planPublish([card(3)], new Map([["src/cart.ts", null]]), "h").outdated[0].reason).toMatch(/binary or too large/);
  });

  it("formats type prefixes", () => {
    expect(formatCommentBody("blocking", "x")).toBe("**Blocking:** x");
    expect(formatCommentBody(null, "x")).toBe("x");
  });
});

describe("session helpers", () => {
  it("only allows same-site relative return paths", () => {
    expect(safeReturnTo("/pr/a/b/1")).toBe("/pr/a/b/1");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "", null, "pr/a"]) expect(safeReturnTo(bad)).toBe("/");
  });

  it("stores token expiry and refreshes only near expiry", () => {
    const s: SessionData = {};
    applyTokens(s, { access_token: "t", expires_in: 28800, refresh_token: "r", refresh_token_expires_in: 15897600 }, 0);
    expect(s).toMatchObject({ token: "t", refreshToken: "r", expiresAt: 28_800_000 });
    expect(needsRefresh(s, 0)).toBe(false);
    expect(needsRefresh(s, 28_800_000 - 60_000)).toBe(true);
    expect(needsRefresh({ token: "t" }, 0)).toBe(false); // non-expiring token
  });
});

describe("review API wrappers", () => {
  it("creates a pending review (no event) and submits with an explicit event", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ id: 7, state: calls.length === 1 ? "PENDING" : "COMMENTED", html_url: "https://github.com/o/r/pull/1#pullrequestreview-7", user: { login: "me" } }));
    }) as typeof fetch;
    const gh = createGitHubClient({ token: "t", fetch: f });
    const ref = { owner: "o", repo: "r", number: 1 };
    await createPendingReview(gh, ref, { commitId: "sha", comments: [{ path: "a", body: "b", line: 1, side: "RIGHT" }] });
    await submitReview(gh, ref, 7, "COMMENT");
    expect(calls[0].url).toBe("https://api.github.com/repos/o/r/pulls/1/reviews");
    expect(calls[0].body).not.toHaveProperty("event");
    expect(calls[0].body).toMatchObject({ commit_id: "sha" });
    expect(calls[1].url).toBe("https://api.github.com/repos/o/r/pulls/1/reviews/7/events");
    expect(calls[1].body).toEqual({ event: "COMMENT" });
  });
});
