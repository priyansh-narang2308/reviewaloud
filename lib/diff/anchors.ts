import type { DiffLine, ParsedPatch } from "./parse";

export type Side = "LEFT" | "RIGHT";

/**
 * Where a review comment is pinned. Line numbers follow GitHub's REST
 * semantics: LEFT = base file numbering (deletions), RIGHT = head file
 * numbering (additions and context). For ranges, `line`/`side` are the LAST
 * line and `startLine`/`startSide` the first, as GitHub expects.
 */
export type Anchor = {
  path: string;
  commitId: string;
  side: Side;
  line: number;
  startSide?: Side;
  startLine?: number;
  /** Text of the anchored line(s) when pinned; used to detect stale anchors. */
  lineText: string;
  startLineText?: string;
  /** Kind of the (last) anchored line, for labels only; not sent to GitHub. */
  lineKind?: "add" | "del" | "ctx";
  startLineKind?: "add" | "del" | "ctx";
};

export type AnchorProblem =
  | "not_in_diff" // no commentable line with this side/number
  | "text_changed" // a line exists there but its content differs from when pinned
  | "cross_hunk" // our UI rule: ranges stay inside one hunk (GitHub itself allows more)
  | "bad_order"; // range start is not before its end

export type Validation =
  | { ok: true; line: DiffLine; startLine?: DiffLine }
  | { ok: false; problem: AnchorProblem };

export const sideOf = (l: DiffLine): Side => (l.kind === "del" ? "LEFT" : "RIGHT");
const numberOn = (l: DiffLine, side: Side) => (side === "LEFT" ? l.oldNo : l.newNo);

export function anchorForLine(path: string, commitId: string, l: DiffLine): Anchor {
  const side = sideOf(l);
  return { path, commitId, side, line: numberOn(l, side)!, lineText: l.text, lineKind: l.kind };
}

export function anchorForRange(
  path: string,
  commitId: string,
  a: DiffLine,
  b: DiffLine,
): { ok: true; anchor: Anchor } | { ok: false; problem: AnchorProblem } {
  const [first, last] = a.idx <= b.idx ? [a, b] : [b, a];
  if (first.idx === last.idx) return { ok: true, anchor: anchorForLine(path, commitId, first) };
  if (first.hunkIdx !== last.hunkIdx) return { ok: false, problem: "cross_hunk" };
  const end = anchorForLine(path, commitId, last);
  const startSide = sideOf(first);
  return {
    ok: true,
    anchor: {
      ...end,
      startSide,
      startLine: numberOn(first, startSide)!,
      startLineText: first.text,
      startLineKind: first.kind,
    },
  };
}

/**
 * Finds the diff line GitHub would resolve for (side, number). Deletions are
 * preferred on LEFT; context lines are also accepted on LEFT because GitHub
 * accepts them there (observed in the Task 5 live check).
 */
export function findLine(parsed: ParsedPatch, side: Side, n: number): DiffLine | undefined {
  if (side === "RIGHT") return parsed.lines.find((l) => l.kind !== "del" && l.newNo === n);
  return (
    parsed.lines.find((l) => l.kind === "del" && l.oldNo === n) ??
    parsed.lines.find((l) => l.kind === "ctx" && l.oldNo === n)
  );
}

export function validateAnchor(anchor: Anchor, parsed: ParsedPatch): Validation {
  const line = findLine(parsed, anchor.side, anchor.line);
  if (!line) return { ok: false, problem: "not_in_diff" };
  if (line.text !== anchor.lineText) return { ok: false, problem: "text_changed" };
  if (anchor.startLine === undefined) return { ok: true, line };

  const start = findLine(parsed, anchor.startSide ?? anchor.side, anchor.startLine);
  if (!start) return { ok: false, problem: "not_in_diff" };
  if (anchor.startLineText !== undefined && start.text !== anchor.startLineText) {
    return { ok: false, problem: "text_changed" };
  }
  if (start.idx >= line.idx) return { ok: false, problem: "bad_order" };
  if (start.hunkIdx !== line.hunkIdx) return { ok: false, problem: "cross_hunk" };
  return { ok: true, line, startLine: start };
}

export type Remap =
  | { status: "unchanged"; anchor: Anchor }
  | { status: "moved"; anchor: Anchor }
  | { status: "outdated"; reason: "line_gone" | "ambiguous" | AnchorProblem };

function uniqueByText(parsed: ParsedPatch, side: Side, text: string): DiffLine | "none" | "many" {
  const hits = parsed.lines.filter((l) => sideOf(l) === side && l.text === text);
  return hits.length === 1 ? hits[0] : hits.length === 0 ? "none" : "many";
}

/**
 * Re-targets a draft anchor after the PR head moves. Keeps it if the same line
 * still exists with the same text; otherwise follows the text if it occurs
 * exactly once on the same side; otherwise reports it as outdated.
 */
export function remapAnchor(anchor: Anchor, parsed: ParsedPatch, commitId: string): Remap {
  const v = validateAnchor(anchor, parsed);
  if (v.ok) return { status: "unchanged", anchor: { ...anchor, commitId } };

  const end = uniqueByText(parsed, anchor.side, anchor.lineText);
  if (end === "many") return { status: "outdated", reason: "ambiguous" };
  if (end === "none") return { status: "outdated", reason: "line_gone" };

  let moved = anchorForLine(anchor.path, commitId, end);
  if (anchor.startLine !== undefined && anchor.startLineText !== undefined) {
    const start = uniqueByText(parsed, anchor.startSide ?? anchor.side, anchor.startLineText);
    if (start === "many") return { status: "outdated", reason: "ambiguous" };
    if (start === "none") return { status: "outdated", reason: "line_gone" };
    const range = anchorForRange(anchor.path, commitId, start, end);
    if (!range.ok) return { status: "outdated", reason: range.problem };
    if (start.idx >= end.idx) return { status: "outdated", reason: "bad_order" };
    moved = range.anchor;
  }
  return { status: "moved", anchor: moved };
}

/** Body for one entry of `comments` in POST /pulls/{n}/reviews. */
export function toReviewComment(anchor: Anchor, body: string) {
  return {
    path: anchor.path,
    body,
    line: anchor.line,
    side: anchor.side,
    ...(anchor.startLine !== undefined
      ? { start_line: anchor.startLine, start_side: anchor.startSide ?? anchor.side }
      : {}),
  };
}
