import type { z } from "zod";
import { GitHubError, errorFromResponse } from "./errors";

const API = "https://api.github.com";

export type GitHubClientOptions = {
  /** User token, or the server's public read token. Omit for unauthenticated reads. */
  token?: string;
  fetch?: typeof fetch;
};

export type GitHubClient = {
  request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    opts: { schema: z.ZodType<T>; body?: unknown },
  ): Promise<T>;
  /** Follows `Link: rel="next"` up to `maxPages` and concatenates array pages. */
  paginate<T>(path: string, opts: { schema: z.ZodType<T[]>; maxPages: number }): Promise<{ items: T[]; truncated: boolean }>;
};

export function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

export function createGitHubClient({ token, fetch: f = fetch }: GitHubClientOptions = {}): GitHubClient {
  async function raw(method: string, url: string, body?: unknown) {
    let res: Response;
    try {
      res = await f(url.startsWith("http") ? url : `${API}${url}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch (e) {
      throw new GitHubError("network", e instanceof Error ? e.message : "Network error");
    }
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new GitHubError("invalid_response", "GitHub returned non-JSON", res.status);
      }
    }
    if (!res.ok) throw errorFromResponse(res, json);
    return { res, json };
  }

  function validate<T>(schema: z.ZodType<T>, json: unknown, path: string): T {
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new GitHubError(
        "invalid_response",
        `Unexpected GitHub response for ${path}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      );
    }
    return parsed.data;
  }

  return {
    async request(method, path, { schema, body }) {
      const { json } = await raw(method, path, body);
      return validate(schema, json, path);
    },
    async paginate(path, { schema, maxPages }) {
      const items = [];
      let url: string | null = path;
      let pages = 0;
      while (url && pages < maxPages) {
        const { res, json } = await raw("GET", url);
        items.push(...validate(schema, json, path));
        url = nextLink(res.headers.get("link"));
        pages++;
      }
      return { items, truncated: url !== null };
    },
  };
}
