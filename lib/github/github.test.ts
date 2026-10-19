import { describe, expect, it } from "vitest";
import { z } from "zod";
import prFixture from "./__fixtures__/sandbox-pr-1.json";
import filesFixture from "./__fixtures__/sandbox-pr-1-files.json";
import { createGitHubClient, nextLink } from "./client";
import { GitHubError } from "./errors";
import { getPullRequest, listPullRequestFiles, prPath } from "./pr";

type Route = { status?: number; body?: unknown; headers?: Record<string, string> };

// Fake fetch: routes by URL; records requests for assertions.
function fakeFetch(routes: Record<string, Route | (() => Route)>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const r = routes[url];
    if (!r) throw new TypeError(`fetch failed: ${url}`);
    const { status = 200, body, headers = {} } = typeof r === "function" ? r() : r;
    return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers });
  };
  return { f: f as typeof fetch, calls };
}

const ref = { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: 1 };
const API = "https://api.github.com/repos/priyansh-narang2308/reviewaloud-sandbox/pulls/1";

describe("getPullRequest (recorded sandbox response)", () => {
  it("maps the real GitHub payload", async () => {
    const { f, calls } = fakeFetch({ [API]: { body: prFixture } });
    const pr = await getPullRequest(createGitHubClient({ fetch: f, token: "t" }), ref);
    expect(pr).toMatchObject({
      number: 1,
      state: "open",
      headRef: "feature/checkout-summary",
      baseRef: "main",
      isPrivate: false,
      repoFullName: "priyansh-narang2308/reviewaloud-sandbox",
      changedFiles: 4,
    });
    expect(pr.headSha).toMatch(/^[0-9a-f]{40}$/);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("sends no Authorization header when unauthenticated", async () => {
    const { f, calls } = fakeFetch({ [API]: { body: prFixture } });
    await getPullRequest(createGitHubClient({ fetch: f }), ref);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("listPullRequestFiles", () => {
  it("maps the recorded files payload, keeping patches", async () => {
    const { f } = fakeFetch({ [`${API}/files?per_page=100`]: { body: filesFixture } });
    const { files, truncated } = await listPullRequestFiles(createGitHubClient({ fetch: f }), ref);
    expect(truncated).toBe(false);
    expect(files.map((x) => [x.path, x.status])).toEqual([
      ["src/auth.ts", "modified"],
      ["src/cart.ts", "modified"],
      ["src/checkout.ts", "added"],
      ["src/format.ts", "modified"],
    ]);
    expect(files[1].patch).toContain("@@ -14,10 +14,15 @@");
  });

  it("follows Link pagination and represents a missing patch as null", async () => {
    const page2 = "https://api.github.com/repositories/1/pulls/1/files?per_page=100&page=2";
    const { f, calls } = fakeFetch({
      [`${API}/files?per_page=100`]: {
        body: [filesFixture[0]],
        headers: { link: `<${page2}>; rel="next", <${page2}>; rel="last"` },
      },
      [page2]: { body: [{ ...filesFixture[1], patch: undefined, filename: "logo.png" }] },
    });
    const { files } = await listPullRequestFiles(createGitHubClient({ fetch: f }), ref);
    expect(calls).toHaveLength(2);
    expect(files.map((x) => x.path)).toEqual(["src/auth.ts", "logo.png"]);
    expect(files[1].patch).toBeNull();
  });

  it("reports truncation when pages run out", async () => {
    const gh = createGitHubClient({
      fetch: fakeFetch({
        "https://api.github.com/x": { body: [1], headers: { link: '<https://api.github.com/x>; rel="next"' } },
      }).f,
    });
    const res = await gh.paginate("/x", { schema: z.array(z.number()), maxPages: 3 });
    expect(res).toEqual({ items: [1, 1, 1], truncated: true });
  });
});

describe("typed errors", () => {
  const client = (route: Route) => createGitHubClient({ fetch: fakeFetch({ [API]: route }).f });
  const kindOf = async (route: Route) => {
    try {
      await getPullRequest(client(route), ref);
    } catch (e) {
      expect(e).toBeInstanceOf(GitHubError);
      return e as GitHubError;
    }
    throw new Error("expected an error");
  };

  it.each([
    [{ status: 401, body: { message: "Bad credentials" } }, "unauthorized"],
    [{ status: 403, body: { message: "Resource not accessible by integration" } }, "forbidden"],
    [{ status: 404, body: { message: "Not Found" } }, "not_found"],
    [{ status: 429, body: { message: "Too many" }, headers: { "retry-after": "30" } }, "rate_limited"],
    [{ status: 500, body: { message: "Oops" } }, "unknown"],
  ] as const)("maps %j to %s", async (route, kind) => {
    expect((await kindOf(route)).kind).toBe(kind);
  });

  it("detects primary rate limits on 403 and exposes the reset time", async () => {
    const err = await kindOf({
      status: 403,
      body: { message: "API rate limit exceeded" },
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" },
    });
    expect(err.kind).toBe("rate_limited");
    expect(err.resetAt).toBe(1_800_000_000_000);
  });

  it("includes 422 details (as seen in the live check)", async () => {
    const err = await kindOf({
      status: 422,
      body: { message: "Unprocessable Entity", errors: ["Line could not be resolved"] },
    });
    expect(err.kind).toBe("validation");
    expect(err.message).toContain("Line could not be resolved");
  });

  it("rejects responses that do not match the schema", async () => {
    expect((await kindOf({ body: { number: "one" } })).kind).toBe("invalid_response");
  });

  it("maps fetch failures to network errors", async () => {
    const gh = createGitHubClient({ fetch: fakeFetch({}).f });
    await expect(getPullRequest(gh, ref)).rejects.toMatchObject({ kind: "network" });
  });
});

describe("helpers", () => {
  it("parses rel=next out of a Link header", () => {
    expect(nextLink('<https://a/2>; rel="next", <https://a/9>; rel="last"')).toBe("https://a/2");
    expect(nextLink('<https://a/1>; rel="prev"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });

  it("rejects unsafe PR references before building a URL", () => {
    expect(() => prPath({ owner: "a/../b", repo: "r", number: 1 })).toThrow();
    expect(() => prPath({ owner: "a", repo: "r", number: 0 })).toThrow();
    expect(prPath(ref)).toBe("/repos/priyansh-narang2308/reviewaloud-sandbox/pulls/1");
  });
});
