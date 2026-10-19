import type { Signals } from "./gather";
import type { AiVerdict, Evidence, Intent, LedgerStatus, PromiseItem } from "./types";

const QUESTION_START = /^(why|what|how|when|where|which|who|could|can|should|would|is|are|do|does|did|will|was|were|have|has)\b/i;

export function looksLikeQuestion(body: string): boolean {
  const t = body.trim().replace(/^\*\*[^*]+:\*\*\s*/, ""); // strip "**Question:**" style prefixes
  return /\?\s*$/.test(t) || /\?\s*\n/.test(t) || QUESTION_START.test(t) || /^\*\*Question:\*\*/.test(body.trim());
}

export function looksLikePraise(body: string): boolean {
  return /^\*\*Praise:\*\*/.test(body.trim()) || /^(nice|great|love this|looks good|lgtm)\b/i.test(body.trim());
}

/**
 * Cases decided without AI (saves the free-tier quota and can't hallucinate).
 * Returns null when the AI verifier is needed.
 */
export function ruleVerdict(p: PromiseItem, s: Signals): { status: LedgerStatus; intent: Intent; rationale: string } | null {
  if (looksLikePraise(p.body)) {
    return { status: "addressed", intent: "praise_or_info", rationale: "Praise or information; nothing to do." };
  }
  if (s.commitsAfter === 0 && s.authorReplies === 0) {
    return looksLikeQuestion(p.body)
      ? { status: "reply_needed", intent: "question", rationale: "No reply and no new commits since this question." }
      : { status: "unresolved", intent: "change_request", rationale: "No commits have been pushed since this comment, and nobody replied." };
  }
  return null;
}

/** Observations shown next to every verdict. CI is context only. */
export function signalNotes(p: PromiseItem, s: Signals): string[] {
  const notes: string[] = [];
  notes.push(s.commitsAfter ? `${s.commitsAfter} commit(s) since the comment` : "No commits since the comment");
  if (s.commitsAfter) notes.push(s.anchorRegionChanged ? "The commented lines were changed" : "The commented lines were not changed");
  if (s.anchoredLineDeleted) notes.push("The commented line was removed");
  if (s.anchoredFileDeleted) notes.push("The commented file was deleted");
  if (s.otherFilesChanged.length) notes.push(`Other files changed: ${s.otherFilesChanged.slice(0, 4).join(", ")}${s.otherFilesChanged.length > 4 ? "…" : ""}`);
  if (s.authorReplies) notes.push(`${s.authorReplies} reply(ies) in the thread`);
  if (p.isResolved) notes.push("Marked resolved on GitHub (not used as evidence)");
  if (s.ci) {
    const ci = s.ci;
    notes.push(
      ci.state === "none"
        ? "No CI results on the latest commit"
        : `CI ${ci.state}${ci.failing.length ? ` (failing: ${ci.failing.slice(0, 3).join(", ")})` : ""}. CI passing doesn't mean the request was met`,
    );
  }
  return notes;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** A quote made only of code comments (e.g. "// fixed as requested") claims a fix; it isn't one. */
export function isCommentOnly(quote: string): boolean {
  const lines = quote.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((l) => /^(\/\/|#|\/\*|\*|\*\/|<!--|--)/.test(l));
}

/**
 * Keeps only evidence whose quote really appears at the cited place, then
 * applies the hard rule: "addressed" needs at least one verified supporting
 * quote and no verified contradicting quote; otherwise it's downgraded.
 */
export function validateAiVerdict(
  ai: AiVerdict,
  headFiles: Map<string, string>,
  replies: Map<number, string>,
): { status: LedgerStatus; evidence: Evidence[]; dropped: number; downgradeReason: string | null } {
  const evidence: Evidence[] = [];
  let dropped = 0;
  for (const e of ai.evidence) {
    const q = norm(e.quote);
    let verified = false;
    if (q.length >= 3) {
      if (e.kind === "code" && e.path && e.startLine) {
        const text = headFiles.get(e.path);
        if (text) {
          const lines = text.split("\n");
          const end = Math.min(lines.length, Math.max(e.endLine ?? e.startLine, e.startLine));
          // Allow ±1 line slack for off-by-one citations; the quote must still match.
          const span = norm(lines.slice(Math.max(0, e.startLine - 2), end + 1).join("\n"));
          verified = span.includes(q);
        }
      } else if (e.kind === "reply" && e.replyId !== null) {
        const body = replies.get(e.replyId);
        verified = !!body && norm(body).includes(q);
      }
    }
    // Repository text could try to talk the model into "addressed" (prompt
    // injection) or a comment could just claim a fix. Comment-only quotes never
    // count as support.
    if (!verified || (e.kind === "code" && e.supports && isCommentOnly(e.quote))) {
      dropped++;
      continue;
    }
    evidence.push({
      kind: e.kind,
      path: e.path ?? undefined,
      startLine: e.startLine ?? undefined,
      endLine: e.endLine ?? undefined,
      replyId: e.replyId ?? undefined,
      quote: e.quote,
      supports: e.supports,
      verified: true,
    });
  }

  let status = ai.status;
  let downgradeReason: string | null = null;
  if (status === "addressed") {
    const support = evidence.some((e) => e.supports);
    const contra = evidence.some((e) => !e.supports);
    if (!support) {
      status = "needs_human";
      downgradeReason = "The model said addressed, but none of its evidence could be found in the code or replies.";
    } else if (contra) {
      status = "needs_human";
      downgradeReason = "Evidence points both ways.";
    }
  }
  return { status, evidence, dropped, downgradeReason };
}
