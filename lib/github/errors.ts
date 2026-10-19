export type GitHubErrorKind =
  | "unauthorized" // 401: missing/expired token
  | "forbidden" // 403 without rate-limit signal: no access / app not installed
  | "not_found" // 404: missing, or private and not visible to this token
  | "rate_limited" // 403/429 with rate-limit signal
  | "validation" // 422: e.g. anchor not in diff, pending review exists
  | "invalid_response" // response did not match the expected schema
  | "network"
  | "unknown";

export class GitHubError extends Error {
  constructor(
    public readonly kind: GitHubErrorKind,
    message: string,
    public readonly status?: number,
    /** Epoch ms when the rate limit resets, when GitHub tells us. */
    public readonly resetAt?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export function errorFromResponse(res: Response, body: unknown): GitHubError {
  const message =
    (body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : undefined) ?? `GitHub responded ${res.status}`;
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  const retryAfter = res.headers.get("retry-after");
  const isRateLimited =
    res.status === 429 ||
    (res.status === 403 && (remaining === "0" || retryAfter !== null || /rate limit/i.test(message)));

  if (isRateLimited) {
    const resetAt = retryAfter
      ? Date.now() + Number(retryAfter) * 1000
      : reset
        ? Number(reset) * 1000
        : undefined;
    return new GitHubError("rate_limited", message, res.status, resetAt);
  }
  switch (res.status) {
    case 401:
      return new GitHubError("unauthorized", message, 401);
    case 403:
      return new GitHubError("forbidden", message, 403);
    case 404:
      return new GitHubError("not_found", message, 404);
    case 422: {
      const details =
        body && typeof body === "object" && "errors" in body && Array.isArray(body.errors)
          ? body.errors.map((e: unknown) => (typeof e === "string" ? e : JSON.stringify(e))).join("; ")
          : "";
      return new GitHubError("validation", details ? `${message}: ${details}` : message, 422);
    }
    default:
      return new GitHubError("unknown", message, res.status);
  }
}
