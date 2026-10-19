import { NextResponse, type NextRequest } from "next/server";
import { getSession, userToken } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createGitHubClient } from "@/lib/github/client";
import { listReviewComments, listThreadStates } from "@/lib/github/ledger-data";
import { getPullRequest } from "@/lib/github/pr";
import { buildPromises, reviewersOf } from "@/lib/ledger/promises";
import { prRefSchema } from "@/lib/publish/plan";
import { githubFailure } from "@/lib/publish/server";

// Read-only: the human review requests on a PR and its current head.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const parsed = prRefSchema.safeParse({ owner: q.get("owner"), repo: q.get("repo"), number: Number(q.get("number")) });
  if (!parsed.success) return NextResponse.json({ code: "bad_request", message: "Invalid pull request." }, { status: 400 });
  const ref = parsed.data;
  let token: string | null = null;
  try {
    token = await userToken(await getSession());
  } catch {
    /* session not configured */
  }
  const gh = createGitHubClient({ token: token ?? env().GITHUB_PUBLIC_READ_TOKEN });
  try {
    const [pr, comments] = await Promise.all([getPullRequest(gh, ref), listReviewComments(gh, ref)]);
    // Thread state needs GraphQL, which requires a token; degrade gracefully.
    const threads = await listThreadStates(gh, ref).catch(() => new Map());
    const reviewer = q.get("reviewer") || undefined;
    return NextResponse.json({
      headSha: pr.headSha,
      prAuthor: pr.author?.login ?? null,
      isPrivate: pr.isPrivate,
      reviewers: reviewersOf(comments),
      items: buildPromises(comments, threads, reviewer),
    });
  } catch (e) {
    return githubFailure(e);
  }
}
