import { NextResponse, type NextRequest } from "next/server";
import { getSession, userToken } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createGitHubClient } from "@/lib/github/client";
import { getPullRequest } from "@/lib/github/pr";
import { prRefSchema } from "@/lib/publish/plan";
import { githubFailure } from "@/lib/publish/server";

// Cheap poll: the PR's current head commit, to notice new pushes.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const parsed = prRefSchema.safeParse({ owner: q.get("owner"), repo: q.get("repo"), number: Number(q.get("number")) });
  if (!parsed.success) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  let token: string | null = null;
  try {
    token = await userToken(await getSession());
  } catch {
    /* not configured */
  }
  try {
    const pr = await getPullRequest(createGitHubClient({ token: token ?? env().GITHUB_PUBLIC_READ_TOKEN }), parsed.data);
    return NextResponse.json({ headSha: pr.headSha });
  } catch (e) {
    return githubFailure(e);
  }
}
