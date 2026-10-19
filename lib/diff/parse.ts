// Parser for the unified-diff `patch` field GitHub returns per PR file.
// GitHub omits the ---/+++ file headers, so a patch starts at the first @@.

export type LineKind = "add" | "del" | "ctx";

export type DiffLine = {
  kind: LineKind;
  /** Line number in the base file; absent for additions. */
  oldNo?: number;
  /** Line number in the head file; absent for deletions. */
  newNo?: number;
  text: string;
  hunkIdx: number;
  /** Index of this line across the whole file (display order). */
  idx: number;
  /** Followed by "\ No newline at end of file". */
  noNewlineAtEof?: boolean;
};

export type Hunk = {
  idx: number;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Text after the closing @@ (often the enclosing function). */
  section: string;
  /** Range of `idx` values belonging to this hunk: [first, last]. */
  lineRange: [number, number];
};

export type ParsedPatch = { hunks: Hunk[]; lines: DiffLine[] };

export class PatchParseError extends Error {
  constructor(
    message: string,
    public readonly lineNumber: number,
  ) {
    super(`${message} (patch line ${lineNumber})`);
    this.name = "PatchParseError";
  }
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

export function parsePatch(patch: string | null | undefined): ParsedPatch {
  const hunks: Hunk[] = [];
  const lines: DiffLine[] = [];
  if (!patch) return { hunks, lines };

  const raw = patch.split("\n");
  // A trailing newline produces one empty final element; it is not a diff line.
  if (raw.length && raw[raw.length - 1] === "") raw.pop();

  let oldNo = 0;
  let newNo = 0;
  let oldLeft = 0;
  let newLeft = 0;
  let current: Hunk | undefined;

  raw.forEach((row, i) => {
    const lineNumber = i + 1;
    const header = row.match(HUNK_RE);
    if (header) {
      if (current && (oldLeft > 0 || newLeft > 0)) {
        throw new PatchParseError("Hunk ended before its declared line counts", lineNumber);
      }
      const [, os, ol, ns, nl, section] = header;
      oldNo = Number(os);
      newNo = Number(ns);
      // Omitted count means 1 (e.g. "@@ -3 +3 @@").
      oldLeft = ol === undefined ? 1 : Number(ol);
      newLeft = nl === undefined ? 1 : Number(nl);
      current = {
        idx: hunks.length,
        header: row,
        oldStart: oldNo,
        oldLines: oldLeft,
        newStart: newNo,
        newLines: newLeft,
        section: section.trim(),
        lineRange: [lines.length, lines.length - 1],
      };
      hunks.push(current);
      return;
    }
    if (!current) throw new PatchParseError("Content before the first hunk header", lineNumber);

    if (row.startsWith("\\")) {
      // "\ No newline at end of file" applies to the preceding line.
      const prev = lines[lines.length - 1];
      if (prev) prev.noNewlineAtEof = true;
      return;
    }

    const marker = row[0];
    const text = row.slice(1);
    const base = { text, hunkIdx: current.idx, idx: lines.length };
    if (marker === "+") {
      if (newLeft <= 0) throw new PatchParseError("More added lines than the hunk declares", lineNumber);
      lines.push({ ...base, kind: "add", newNo: newNo++ });
      newLeft--;
    } else if (marker === "-") {
      if (oldLeft <= 0) throw new PatchParseError("More deleted lines than the hunk declares", lineNumber);
      lines.push({ ...base, kind: "del", oldNo: oldNo++ });
      oldLeft--;
    } else if (marker === " " || row === "") {
      // Some tools strip the leading space from blank context lines.
      if (oldLeft <= 0 || newLeft <= 0) {
        throw new PatchParseError("More context lines than the hunk declares", lineNumber);
      }
      lines.push({ ...base, kind: "ctx", text: marker === " " ? text : "", oldNo: oldNo++, newNo: newNo++ });
      oldLeft--;
      newLeft--;
    } else {
      throw new PatchParseError(`Unexpected line prefix ${JSON.stringify(marker)}`, lineNumber);
    }
    current.lineRange = [current.lineRange[0], lines.length - 1];
  });

  if (current && (oldLeft > 0 || newLeft > 0)) {
    throw new PatchParseError("Patch ended before the last hunk's declared line counts", raw.length);
  }
  return { hunks, lines };
}
