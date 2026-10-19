import "server-only";
import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { env, requireFeature } from "@/lib/env";

// GitHub App user-to-server token, kept server-side in an encrypted,
// httpOnly cookie. Never sent to client JavaScript.
export type SessionData = {
  token?: string;
  refreshToken?: string;
  /** Epoch ms. Absent if the app doesn't use expiring tokens. */
  expiresAt?: number;
  refreshExpiresAt?: number;
  login?: string;
  avatarUrl?: string;
  /** OAuth CSRF state + where to return after login. */
  oauthState?: string;
  returnTo?: string;
  /** Daily AI call budget (free-tier models are rate-limited per key). */
  aiDay?: string;
  aiCount?: number;
};

/** Consumes one AI call from today's per-session budget. */
export function takeAiBudget(s: SessionData, cap: number, today = new Date().toISOString().slice(0, 10)): boolean {
  if (s.aiDay !== today) {
    s.aiDay = today;
    s.aiCount = 0;
  }
  if ((s.aiCount ?? 0) >= cap) return false;
  s.aiCount = (s.aiCount ?? 0) + 1;
  return true;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  requireFeature("session");
  return getIronSession<SessionData>(await cookies(), {
    password: env().SESSION_SECRET!,
    cookieName: "ra_session",
    ttl: 60 * 60 * 24 * 7,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  });
}

/** Only same-site relative paths, to prevent open redirects. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

export function applyTokens(session: SessionData, t: TokenResponse, now = Date.now()) {
  session.token = t.access_token;
  session.expiresAt = t.expires_in ? now + t.expires_in * 1000 : undefined;
  session.refreshToken = t.refresh_token;
  session.refreshExpiresAt = t.refresh_token_expires_in ? now + t.refresh_token_expires_in * 1000 : undefined;
}

export async function exchangeToken(params: Record<string, string>, f: typeof fetch = fetch): Promise<TokenResponse> {
  const e = env();
  const res = await f("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: e.GITHUB_APP_CLIENT_ID, client_secret: e.GITHUB_APP_CLIENT_SECRET, ...params }),
    cache: "no-store",
  });
  return (await res.json().catch(() => ({ error: "bad_response" }))) as TokenResponse;
}

export function needsRefresh(s: SessionData, now = Date.now()) {
  return !!s.token && !!s.expiresAt && s.expiresAt - now < REFRESH_MARGIN_MS;
}

/**
 * Returns a usable user token, refreshing it when close to expiry. Must be
 * called where cookies can be written (route handlers / server actions).
 * Clears the session and returns null when the token can't be renewed.
 */
export async function userToken(session: IronSession<SessionData>): Promise<string | null> {
  if (!session.token) return null;
  if (!needsRefresh(session)) return session.token;
  if (!session.refreshToken || (session.refreshExpiresAt && session.refreshExpiresAt < Date.now())) {
    session.destroy();
    return null;
  }
  const t = await exchangeToken({ grant_type: "refresh_token", refresh_token: session.refreshToken });
  if (!t.access_token) {
    session.destroy();
    return null;
  }
  applyTokens(session, t);
  await session.save();
  return session.token!;
}

/** Read-only token for Server Components (which can't refresh cookies). */
export async function readOnlyUserToken(): Promise<string | undefined> {
  try {
    const s = await getSession();
    if (!s.token || (s.expiresAt && s.expiresAt < Date.now())) return undefined;
    return s.token;
  } catch {
    return undefined; // session not configured
  }
}
