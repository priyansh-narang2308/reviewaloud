import { type ParsedPatch, parsePatch } from "@/lib/diff/parse";

// Follow a line from one commit to a later one through the unified diff
// between them. Pure and deterministic.

export type MappedLine = { line: number; deleted: false } | { line: number; deleted: true };

/**
 * Maps `oldLine` (numbered in the earlier commit) to the later commit. If the
 * line was deleted, returns the nearest surviving line with `deleted: true`.
 * A null patch means the file didn't change, so numbers are unchanged.
 */
export function mapLine(oldLine: number, patch: ParsedPatch | null): MappedLine {
  if (!patch || !patch.hunks.length) return { line: oldLine, deleted: false };
  let offset = 0;
  for (const h of patch.hunks) {
    const oldEnd = h.oldStart + Math.max(h.oldLines, 1) - 1;
    if (oldLine < h.oldStart) break;
    if (oldLine > oldEnd && h.oldLines > 0) {
      offset += h.newLines - h.oldLines;
      continue;
    }
    if (h.oldLines === 0) {
      // Pure insertion hunk located after oldStart.
      if (oldLine > h.oldStart) offset += h.newLines;
      continue;
    }
    const lines = patch.lines.slice(h.lineRange[0], h.lineRange[1] + 1);
    const at = lines.findIndex((l) => l.oldNo === oldLine);
    const hit = lines[at];
    if (hit?.kind === "ctx") return { line: hit.newNo!, deleted: false };
    // Deleted: nearest following line that exists in the new file, else preceding.
    const after = lines.slice(at + 1).find((l) => l.kind !== "del");
    const before = [...lines.slice(0, at)].reverse().find((l) => l.kind !== "del");
    const near = after?.newNo ?? (before?.newNo !== undefined ? before.newNo + 1 : h.newStart);
    return { line: near, deleted: true };
  }
  return { line: oldLine + offset, deleted: false };
}

/** Did the patch add or delete anything within old lines [lo, hi]? */
export function touchesRange(patch: ParsedPatch | null, lo: number, hi: number): boolean {
  if (!patch) return false;
  let lastOld = 0;
  for (const h of patch.hunks) {
    lastOld = h.oldStart - 1;
    for (const l of patch.lines.slice(h.lineRange[0], h.lineRange[1] + 1)) {
      if (l.kind === "del") {
        if (l.oldNo! >= lo && l.oldNo! <= hi) return true;
        lastOld = l.oldNo!;
      } else if (l.kind === "add") {
        // An insertion sits after `lastOld`.
        if (lastOld >= lo - 1 && lastOld <= hi) return true;
      } else {
        lastOld = l.oldNo!;
      }
    }
  }
  return false;
}

/**
 * The line a review comment points at, in its original commit's numbering.
 * RIGHT comments carry it directly. LEFT comments sit on a deleted line of the
 * PR base, so we take the nearest new-file line from the comment's diff_hunk.
 */
export function originalAnchorLine(c: {
  side?: "LEFT" | "RIGHT" | null;
  original_line?: number | null;
  line?: number | null;
  diff_hunk?: string | null;
}): number | null {
  if (c.side !== "LEFT") return c.original_line ?? c.line ?? null;
  if (!c.diff_hunk) return null;
  try {
    const p = parsePatch(c.diff_hunk, { allowTruncated: true });
    const prior = [...p.lines].reverse().find((l) => l.kind !== "del");
    return prior?.newNo !== undefined ? prior.newNo + 1 : (p.hunks[0]?.newStart ?? null);
  } catch {
    return null;
  }
}

/** "  42| code" numbered excerpt of [from, to] (1-based, clamped). */
export function excerpt(text: string, center: number, radius: number): { from: number; to: number; body: string } {
  const lines = text.split("\n");
  const from = Math.max(1, center - radius);
  const to = Math.min(lines.length, center + radius);
  const width = String(to).length;
  const body = lines
    .slice(from - 1, to)
    .map((l, i) => `${String(from + i).padStart(width)}| ${l}`)
    .join("\n");
  return { from, to, body };
}

/** First `max` lines of a patch, for prompts. */
export function capPatch(patch: string | undefined, max: number): string {
  if (!patch) return "";
  const rows = patch.split("\n");
  return rows.length <= max ? patch : `${rows.slice(0, max).join("\n")}\n… (${rows.length - max} more lines)`;
}
