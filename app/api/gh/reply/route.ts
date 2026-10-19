import { z } from "zod";
import { NextResponse } from "next/server";
import { replyToReviewComment } from "@/lib/github/ledger-data";
import { prRefSchema } from "@/lib/publish/plan";
import { authorizeWrite, fail, githubFailure } from "@/lib/publish/server";

const bodySchema = z.object({
  ref: prRefSchema,
  commentId: z.number().int().positive(),
  body: z.string().trim().min(1).max(10_000),
});

// Posts the reviewer-approved follow-up as a reply on the original thread.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "Invalid reply.");
  const { ref, commentId, body } = parsed.data;
  const auth = await authorizeWrite(req, ref);
  if (!auth.ok) return auth.res;
  try {
    const r = await replyToReviewComment(auth.gh, ref, commentId, body);
    return NextResponse.json({ id: r.id, htmlUrl: r.html_url });
  } catch (e) {
    return githubFailure(e);
  }
}
