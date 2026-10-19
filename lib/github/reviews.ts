import { z } from "zod";
import type { GitHubClient } from "./client";
import { githubUrl, prPath, type PrRef } from "./pr";

const reviewSchema = z.object({
  id: z.number(),
  state: z.string(), // PENDING | COMMENTED | CHANGES_REQUESTED | APPROVED | DISMISSED
  html_url: githubUrl,
  user: z.object({ login: z.string() }).nullable(),
  commit_id: z.string().nullable().optional(),
  submitted_at: z.string().nullable().optional(),
});
export type Review = z.infer<typeof reviewSchema>;

export type ReviewCommentPayload = {
  path: string;
  body: string;
  line: number;
  side: "LEFT" | "RIGHT";
  start_line?: number;
  start_side?: "LEFT" | "RIGHT";
};

export async function listReviews(gh: GitHubClient, ref: PrRef): Promise<Review[]> {
  const { items } = await gh.paginate(`${prPath(ref)}/reviews?per_page=100`, { schema: z.array(reviewSchema), maxPages: 10 });
  return items;
}

export async function getReview(gh: GitHubClient, ref: PrRef, id: number): Promise<Review> {
  return gh.request("GET", `${prPath(ref)}/reviews/${id}`, { schema: reviewSchema });
}

/** Omitting `event` creates a PENDING review, visible only to its author. */
export async function createPendingReview(
  gh: GitHubClient,
  ref: PrRef,
  input: { commitId: string; body?: string; comments: ReviewCommentPayload[] },
): Promise<Review> {
  return gh.request("POST", `${prPath(ref)}/reviews`, {
    schema: reviewSchema,
    body: { commit_id: input.commitId, ...(input.body ? { body: input.body } : {}), comments: input.comments },
  });
}

export type SubmitEvent = "COMMENT" | "REQUEST_CHANGES";

export async function submitReview(
  gh: GitHubClient,
  ref: PrRef,
  id: number,
  event: SubmitEvent,
  body?: string,
): Promise<Review> {
  return gh.request("POST", `${prPath(ref)}/reviews/${id}/events`, {
    schema: reviewSchema,
    body: { event, ...(body ? { body } : {}) },
  });
}

/** Deletes a PENDING review (GitHub refuses for submitted ones). */
export async function deletePendingReview(gh: GitHubClient, ref: PrRef, id: number): Promise<void> {
  await gh.request("DELETE", `${prPath(ref)}/reviews/${id}`, { schema: z.unknown() });
}
