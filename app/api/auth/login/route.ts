import { NextResponse, type NextRequest } from "next/server";
import { getSession, safeReturnTo } from "@/lib/auth/session";
import { env, missingFor } from "@/lib/env";

export async function GET(req: NextRequest) {
  const e = env();
  const missing = [...missingFor("githubAuth", e), ...missingFor("session", e)];
  if (missing.length) {
    return NextResponse.json({ error: `GitHub sign-in isn't configured (${missing.join(", ")}).` }, { status: 503 });
  }
  const session = await getSession();
  session.oauthState = crypto.randomUUID();
  session.returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  await session.save();

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", e.GITHUB_APP_CLIENT_ID!);
  url.searchParams.set("redirect_uri", new URL("/api/auth/callback", e.APP_URL ?? req.nextUrl.origin).toString());
  url.searchParams.set("state", session.oauthState);
  return NextResponse.redirect(url);
}
