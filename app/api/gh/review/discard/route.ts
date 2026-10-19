import { z } from "zod";
import { NextResponse } from "next/server";
import { deletePendingReview, getReview } from "@/lib/github/reviews";
import { prRefSchema } from "@/lib/publish/plan";
import { authorizeWrite, fail, githubFailure } from "@/lib/publish/server";
import { isSameOrigin } from "@/lib/http/guard";

const bodySchema = z.object({ ref: prRefSchema, reviewId: z.number().int().positive() });

// Deletes an unsubmitted (PENDING) draft review on GitHub. Local drafts stay.
export async function POST(req: Request) {
  // Reject cross-site requests before reading the body.
  if (!isSameOrigin(req)) return fail(403, "cross_origin", "Cross-origin request refused.");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "Invalid discard request.");
  const { ref, reviewId } = parsed.data;
  const auth = await authorizeWrite(req, ref);
  if (!auth.ok) return auth.res;
  try {
    const r = await getReview(auth.gh, ref, reviewId);
    if (r.state !== "PENDING") return fail(409, "github_rejected", "That review was already submitted and can't be discarded.");
    if (r.user?.login !== auth.login) return fail(403, "no_access", "That draft belongs to someone else.");
    await deletePendingReview(auth.gh, ref, reviewId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return githubFailure(e);
  }
}
