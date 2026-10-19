import "server-only";

/** Reject cross-site POSTs: the Origin header must match this server's host. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Best-effort in-memory fixed-window limiter. On serverless each instance has
 * its own memory, so this caps abuse per instance, not globally.
 */
export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string): { ok: true } | { ok: false; retryAfterMs: number } => {
    const t = now();
    const h = hits.get(key);
    if (!h || h.resetAt <= t) {
      hits.set(key, { count: 1, resetAt: t + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      return { ok: true };
    }
    if (h.count >= limit) return { ok: false, retryAfterMs: h.resetAt - t };
    h.count++;
    return { ok: true };
  };
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
