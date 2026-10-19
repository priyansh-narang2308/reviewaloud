import { z } from "zod";
import { type Anchor, remapAnchor, toReviewComment } from "@/lib/diff/anchors";
import type { ParsedPatch } from "@/lib/diff/parse";
import type { ReviewCommentPayload } from "@/lib/github/reviews";
import { COMMENT_TYPES, type CommentType, anchorSchema } from "@/lib/store/review-store";

export const TYPE_PREFIX: Record<CommentType, string> = {
  blocking: "**Blocking:**",
  suggestion: "**Suggestion:**",
  question: "**Question:**",
  nit: "**Nit:**",
  praise: "**Praise:**",
};

export function formatCommentBody(type: CommentType | null, body: string): string {
  return type ? `${TYPE_PREFIX[type]} ${body}` : body;
}

const name = z.string().regex(/^[\w.-]+$/);
export const prRefSchema = z.object({ owner: name, repo: name, number: z.number().int().positive() });

export const publishCommentSchema = z.object({
  cardId: z.string().min(1).max(100),
  anchor: anchorSchema,
  body: z.string().trim().min(1).max(10_000),
  type: z.enum(COMMENT_TYPES).nullable(),
});
export type PublishComment = z.infer<typeof publishCommentSchema>;

export type PublishPlan = {
  ready: { cardId: string; anchor: Anchor; payload: ReviewCommentPayload }[];
  /** Comments whose line moved after new commits; re-anchored by unique text. */
  moved: { cardId: string; anchor: Anchor }[];
  /** Comments that can't be placed on the current diff. */
  outdated: { cardId: string; reason: string }[];
};

const OUTDATED_TEXT: Record<string, string> = {
  line_gone: "Its line is no longer in the diff.",
  ambiguous: "Its line now appears more than once; re-pin it.",
  cross_hunk: "Its range now spans two hunks.",
  bad_order: "Its range is no longer in order.",
  not_in_diff: "Its line is no longer in the diff.",
  text_changed: "Its line changed.",
  file_gone: "Its file is no longer part of this pull request.",
  no_patch: "GitHub sent no diff for its file (binary or too large).",
};

/**
 * Re-validates every draft against the PR's CURRENT diff before any write.
 * Pure: no network. `files` maps path → parsed patch (null if no patch).
 */
export function planPublish(comments: PublishComment[], files: Map<string, ParsedPatch | null>, headSha: string): PublishPlan {
  const plan: PublishPlan = { ready: [], moved: [], outdated: [] };
  for (const c of comments) {
    if (!files.has(c.anchor.path)) {
      plan.outdated.push({ cardId: c.cardId, reason: OUTDATED_TEXT.file_gone });
      continue;
    }
    const parsed = files.get(c.anchor.path);
    if (!parsed) {
      plan.outdated.push({ cardId: c.cardId, reason: OUTDATED_TEXT.no_patch });
      continue;
    }
    const r = remapAnchor(c.anchor, parsed, headSha);
    if (r.status === "outdated") {
      plan.outdated.push({ cardId: c.cardId, reason: OUTDATED_TEXT[r.reason] ?? "Its line is no longer in the diff." });
      continue;
    }
    if (r.status === "moved") plan.moved.push({ cardId: c.cardId, anchor: r.anchor });
    plan.ready.push({ cardId: c.cardId, anchor: r.anchor, payload: toReviewComment(r.anchor, formatCommentBody(c.type, c.body)) });
  }
  return plan;
}
