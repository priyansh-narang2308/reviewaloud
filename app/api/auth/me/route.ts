import { NextResponse } from "next/server";
import { getSession, userToken } from "@/lib/auth/session";
import { env, missingFor } from "@/lib/env";

// Who is signed in (never returns the token). Also refreshes an expiring token.
export async function GET() {
  const e = env();
  const configured = missingFor("githubAuth", e).length === 0 && missingFor("session", e).length === 0;
  if (!configured) return NextResponse.json({ configured: false, viewer: null });
  const session = await getSession();
  const token = await userToken(session);
  return NextResponse.json({
    configured: true,
    appSlug: e.GITHUB_APP_SLUG,
    viewer: token && session.login ? { login: session.login, avatarUrl: session.avatarUrl ?? null } : null,
  });
}
