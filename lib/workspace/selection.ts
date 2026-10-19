import { type Anchor, type AnchorProblem, anchorForRange } from "@/lib/diff/anchors";
import type { ParsedPatch } from "@/lib/diff/parse";

/** A click (anchorIdx) optionally extended with shift-click (focusIdx), within one file. */
export type Selection = { path: string; anchorIdx: number; focusIdx: number };

export type SelectionResult =
  | { ok: true; anchor: Anchor; fromIdx: number; toIdx: number }
  | { ok: false; problem: AnchorProblem };

export function selectionToAnchor(sel: Selection, parsed: ParsedPatch, commitId: string): SelectionResult {
  const a = parsed.lines[sel.anchorIdx];
  const b = parsed.lines[sel.focusIdx];
  if (!a || !b) return { ok: false, problem: "not_in_diff" };
  const r = anchorForRange(sel.path, commitId, a, b);
  if (!r.ok) return r;
  return { ok: true, anchor: r.anchor, fromIdx: Math.min(a.idx, b.idx), toIdx: Math.max(a.idx, b.idx) };
}

/** Shift-click keeps the original click as the fixed end; otherwise start fresh. */
export function nextSelection(prev: Selection | null, path: string, idx: number, extend: boolean): Selection {
  if (extend && prev && prev.path === path) return { ...prev, focusIdx: idx };
  return { path, anchorIdx: idx, focusIdx: idx };
}

export function describeAnchor(a: Anchor): string {
  if (a.startLine === undefined) return `${a.side === "LEFT" ? "L" : "R"}${a.line}`;
  const s = `${(a.startSide ?? a.side) === "LEFT" ? "L" : "R"}${a.startLine}`;
  return `${s}–${a.side === "LEFT" ? "L" : "R"}${a.line}`;
}

export const PROBLEM_TEXT: Record<AnchorProblem, string> = {
  cross_hunk: "A range must stay inside one hunk. Shift-click a line in the same block.",
  not_in_diff: "That line isn't part of this diff.",
  text_changed: "That line changed since you selected it.",
  bad_order: "Range start must come before its end.",
};
