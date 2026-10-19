import { z } from "zod";

// Remembers a draft (PENDING) review created on GitHub for a PR, so closing
// the dialog or reloading never creates a duplicate, and submit can resume.

const recordSchema = z.object({
  v: z.literal(1),
  reviewId: z.number().int().positive(),
  htmlUrl: z.string(),
  cardIds: z.array(z.string()),
  commitId: z.string(),
  createdAt: z.number(),
});
export type DraftReviewRecord = Omit<z.infer<typeof recordSchema>, "v">;

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const publishedKey = (owner: string, repo: string, number: number) => `reviewaloud:github-draft:v1:${owner}/${repo}#${number}`;

export function readDraftRecord(storage: KV | null, key: string): DraftReviewRecord | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const p = recordSchema.safeParse(JSON.parse(raw));
    return p.success ? { reviewId: p.data.reviewId, htmlUrl: p.data.htmlUrl, cardIds: p.data.cardIds, commitId: p.data.commitId, createdAt: p.data.createdAt } : null;
  } catch {
    return null;
  }
}

export function writeDraftRecord(storage: KV | null, key: string, r: DraftReviewRecord | null) {
  try {
    if (r) storage?.setItem(key, JSON.stringify({ v: 1, ...r }));
    else storage?.removeItem(key);
  } catch {
    /* in-memory state still works */
  }
}
