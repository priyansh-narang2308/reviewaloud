import type { ReviewComment, ThreadState } from "@/lib/github/ledger-data";
import type { PromiseItem } from "./types";

const isBot = (c: ReviewComment) => !c.user || c.user.type === "Bot" || c.user.login.endsWith("[bot]");

/**
 * Top-level human review comments become promises; replies attach to them.
 * `reviewer` narrows to one person's requests (default: everyone human).
 */
export function buildPromises(comments: ReviewComment[], threads: Map<number, ThreadState>, reviewer?: string): PromiseItem[] {
  const replies = new Map<number, PromiseItem["replies"]>();
  for (const c of comments) {
    if (!c.in_reply_to_id) continue;
    const list = replies.get(c.in_reply_to_id) ?? [];
    list.push({ id: c.id, author: c.user?.login ?? "unknown", body: c.body, createdAt: c.created_at });
    replies.set(c.in_reply_to_id, list);
  }
  return comments
    .filter((c) => !c.in_reply_to_id && !isBot(c) && (!reviewer || c.user?.login === reviewer))
    .map((c) => {
      const t = threads.get(c.id);
      return {
        commentId: c.id,
        author: c.user!.login,
        body: c.body,
        path: c.path,
        side: c.side === "LEFT" ? "LEFT" : "RIGHT",
        originalLine: c.original_line ?? c.line ?? null,
        originalCommit: c.original_commit_id,
        diffHunk: c.diff_hunk ?? null,
        createdAt: c.created_at,
        htmlUrl: c.html_url,
        isResolved: t?.isResolved ?? false,
        isOutdated: t?.isOutdated ?? false,
        replies: (replies.get(c.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      } satisfies PromiseItem;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function reviewersOf(comments: ReviewComment[]): string[] {
  return [...new Set(comments.filter((c) => !c.in_reply_to_id && !isBot(c)).map((c) => c.user!.login))];
}
