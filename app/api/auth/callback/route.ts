import { NextResponse, type NextRequest } from "next/server";
import { applyTokens, exchangeToken, getSession, safeReturnTo } from "@/lib/auth/session";
import { env } from "@/lib/env";

function back(req: NextRequest, path: string, error?: string) {
  const to = new URL(path, req.nextUrl.origin);
  if (error) to.searchParams.set("auth_error", error);
  return NextResponse.redirect(to);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  const returnTo = safeReturnTo(session.returnTo);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = session.oauthState;
  session.oauthState = undefined;
  session.returnTo = undefined;

  if (req.nextUrl.searchParams.get("error")) {
    await session.save();
    return back(req, returnTo, "GitHub sign-in was cancelled.");
  }
  if (!code || !state || !expected || state !== expected) {
    await session.save();
    return back(req, returnTo, "Sign-in expired or was tampered with. Please try again.");
  }

  const e = env();
  const t = await exchangeToken({
    code,
    redirect_uri: new URL("/api/auth/callback", e.APP_URL ?? req.nextUrl.origin).toString(),
  });
  if (!t.access_token) {
    await session.save();
    return back(req, returnTo, "GitHub didn't issue a token. Please try again.");
  }
  const me = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${t.access_token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  const user = (await me.json().catch(() => null)) as { login?: string; avatar_url?: string } | null;
  if (!me.ok || !user?.login) {
    await session.save();
    return back(req, returnTo, "Couldn't read your GitHub profile.");
  }
  applyTokens(session, t);
  session.login = user.login;
  session.avatarUrl = user.avatar_url;
  await session.save();
  return back(req, returnTo);
}
