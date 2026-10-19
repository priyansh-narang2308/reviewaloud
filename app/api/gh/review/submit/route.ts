import { z } from "zod";
import { NextResponse } from "next/server";
import { getReview, submitReview } from "@/lib/github/reviews";
import { prRefSchema } from "@/lib/publish/plan";
import { authorizeWrite, fail, githubFailure } from "@/lib/publish/server";

const bodySchema = z.object({
  ref: prRefSchema,
  reviewId: z.number().int().positive(),
  // APPROVE is deliberately not offered.
  event: z.enum(["COMMENT", "REQUEST_CHANGES"]),
  body: z.string().max(20_000).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "Invalid submit request.");
  const { ref, reviewId, event, body } = parsed.data;

  const auth = await authorizeWrite(req, ref);
  if (!auth.ok) return auth.res;

  try {
    // Idempotent: a double click or retry after a timeout must not error.
    const current = await getReview(auth.gh, ref, reviewId);
    if (current.state !== "PENDING") {
      return NextResponse.json({ state: current.state, htmlUrl: current.html_url, alreadySubmitted: true });
    }
    const r = await submitReview(auth.gh, ref, reviewId, event, body?.trim() || undefined);
    return NextResponse.json({ state: r.state, htmlUrl: r.html_url, alreadySubmitted: false });
  } catch (e) {
    return githubFailure(e);
  }
}
