import { z } from "zod";
import { NextResponse } from "next/server";
import { parsePatch } from "@/lib/diff/parse";
import { getPullRequest, listPullRequestFiles } from "@/lib/github/pr";
import { createPendingReview, listReviews } from "@/lib/github/reviews";
import { planPublish, prRefSchema, publishCommentSchema } from "@/lib/publish/plan";
import { authorizeWrite, fail, githubFailure } from "@/lib/publish/server";

const bodySchema = z.object({
  ref: prRefSchema,
  summary: z.string().max(20_000).optional(),
  comments: z.array(publishCommentSchema).min(1).max(100),
  /** Set after the reviewer saw which comments moved to new lines. */
  confirmMoved: z.boolean().optional(),
});

// Creates a PENDING review (only the author can see it on GitHub until it's
// submitted). Re-validates every anchor against the PR's current head first.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "Invalid publish request.");
  const { ref, summary, comments, confirmMoved } = parsed.data;

  const auth = await authorizeWrite(req, ref);
  if (!auth.ok) return auth.res;
  const { gh, login } = auth;

  try {
    const [pr, { files }] = await Promise.all([getPullRequest(gh, ref), listPullRequestFiles(gh, ref)]);
    const byPath = new Map(files.map((f) => [f.path, f.patch ? parsePatch(f.patch) : null]));
    const plan = planPublish(comments, byPath, pr.headSha);

    if (plan.outdated.length) {
      return fail(409, "outdated", "Some comments no longer match the pull request. Fix or remove them first.", {
        outdated: plan.outdated,
        moved: plan.moved,
        headSha: pr.headSha,
      });
    }
    if (plan.moved.length && !confirmMoved) {
      return fail(409, "moved", "New commits moved some lines. Check the new positions, then publish again.", {
        moved: plan.moved,
        headSha: pr.headSha,
      });
    }

    // GitHub allows one pending review per user per PR.
    const existing = (await listReviews(gh, ref)).find((r) => r.state === "PENDING" && r.user?.login === login);
    if (existing) {
      return fail(409, "pending_exists", "You already have an unsubmitted draft review on this pull request.", {
        reviewId: existing.id,
        htmlUrl: existing.html_url,
      });
    }

    const review = await createPendingReview(gh, ref, {
      commitId: pr.headSha,
      body: summary?.trim() || undefined,
      comments: plan.ready.map((r) => r.payload),
    });
    return NextResponse.json({
      reviewId: review.id,
      state: review.state,
      htmlUrl: review.html_url,
      commitId: pr.headSha,
      cardIds: plan.ready.map((r) => r.cardId),
      moved: plan.moved,
    });
  } catch (e) {
    return githubFailure(e);
  }
}
