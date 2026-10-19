import type { LedgerStatus, Verdict } from "./types";

export type FollowThrough = {
  /** Requests that call for action (praise/info excluded). */
  total: number;
  kept: number;
  open: number;
  needsReply: number;
  unclear: number;
  /** Not yet checked. */
  unchecked: number;
};

/** "Kept" counts only verified-addressed requests; reviewer overrides win. */
export function followThrough(
  items: { commentId: number }[],
  verdicts: ReadonlyMap<number, Pick<Verdict, "status" | "intent">>,
  overrides: ReadonlyMap<number, LedgerStatus>,
): FollowThrough {
  const s: FollowThrough = { total: 0, kept: 0, open: 0, needsReply: 0, unclear: 0, unchecked: 0 };
  for (const it of items) {
    const v = verdicts.get(it.commentId);
    if (v?.intent === "praise_or_info") continue;
    s.total++;
    const status = overrides.get(it.commentId) ?? v?.status;
    if (!status) s.unchecked++;
    else if (status === "addressed") s.kept++;
    else if (status === "unresolved") s.open++;
    else if (status === "reply_needed") s.needsReply++;
    else s.unclear++;
  }
  return s;
}

export type PrRecord = { pr: string; author: string | null; checkedAt: number } & FollowThrough;

/** Totals across PRs, optionally per PR author (e.g. a coding agent's bot account). */
export function aggregate(records: PrRecord[], author?: string) {
  const rs = author ? records.filter((r) => r.author === author) : records;
  return rs.reduce(
    (a, r) => ({
      prs: a.prs + 1,
      total: a.total + r.total - r.unchecked,
      kept: a.kept + r.kept,
      open: a.open + r.open,
    }),
    { prs: 0, total: 0, kept: 0, open: 0 },
  );
}
