import { describe, expect, it } from "vitest";
import files from "../github/__fixtures__/sandbox-pr-1-files.json";
import { PatchParseError, parsePatch } from "./parse";

const patchOf = (name: string) => files.find((f) => f.filename === name)!.patch!;

describe("parsePatch on the real sandbox PR #1 patches", () => {
  const cart = parsePatch(patchOf("src/cart.ts"));

  it("finds both hunks with their headers and sections", () => {
    expect(cart.hunks.map((h) => [h.oldStart, h.oldLines, h.newStart, h.newLines])).toEqual([
      [14, 10, 14, 15],
      [55, 8, 60, 11],
    ]);
    expect(cart.hunks[0].section).toBe("export function createCart(): Cart {");
  });

  it("numbers additions, deletions and context like GitHub (matches the Task 5 live anchors)", () => {
    const find = (text: string, kind: string) => cart.lines.find((l) => l.text.includes(text) && l.kind === kind)!;
    const added = find("const MAX_QUANTITY = 99;", "add");
    expect(added).toMatchObject({ newNo: 17, hunkIdx: 0 });
    expect(added.oldNo).toBeUndefined();
    const deleted = find("existing.quantity += item.quantity;", "del");
    expect(deleted).toMatchObject({ oldNo: 20 });
    expect(deleted.newNo).toBeUndefined();
    expect(find("const existing = cart.items.find", "ctx")).toMatchObject({ oldNo: 18, newNo: 23 });
    expect(find("return taxable + taxable * GST_RATE;", "add")).toMatchObject({ newNo: 69, hunkIdx: 1 });
    expect(find("return base - discount;", "del")).toMatchObject({ oldNo: 61, hunkIdx: 1 });
  });

  it("keeps line counts consistent with each hunk header", () => {
    for (const h of cart.hunks) {
      const inHunk = cart.lines.filter((l) => l.hunkIdx === h.idx);
      expect(inHunk.filter((l) => l.kind !== "add")).toHaveLength(h.oldLines);
      expect(inHunk.filter((l) => l.kind !== "del")).toHaveLength(h.newLines);
      expect(h.lineRange).toEqual([inHunk[0].idx, inHunk[inHunk.length - 1].idx]);
    }
  });

  it("assigns consecutive display indices", () => {
    expect(cart.lines.map((l) => l.idx)).toEqual(cart.lines.map((_, i) => i));
  });

  it("parses a newly added file", () => {
    const { hunks, lines } = parsePatch(patchOf("src/checkout.ts"));
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 13 });
    expect(lines.every((l) => l.kind === "add")).toBe(true);
    expect(lines.at(-1)).toMatchObject({ newNo: 13, text: "}" });
  });

  it("keeps blank context lines as empty text", () => {
    const blank = cart.lines.find((l) => l.kind === "ctx" && l.text === "");
    expect(blank).toBeDefined();
  });

  it("preserves non-ASCII content", () => {
    const { lines } = parsePatch(patchOf("src/format.ts"));
    expect(lines.some((l) => l.kind === "add" && l.text.includes("₹"))).toBe(true);
  });
});

// Real `git diff` output (headers stripped, as GitHub serves it).
describe("parsePatch edge cases from real git output", () => {
  it("marks lines followed by '\\ No newline at end of file'", () => {
    const { lines } = parsePatch(
      "@@ -1,3 +1,3 @@\n one\n two\n-three\n\\ No newline at end of file\n+THREE\n\\ No newline at end of file",
    );
    expect(lines).toHaveLength(4);
    expect(lines[2]).toMatchObject({ kind: "del", oldNo: 3, noNewlineAtEof: true });
    expect(lines[3]).toMatchObject({ kind: "add", newNo: 3, noNewlineAtEof: true });
    expect(lines[0].noNewlineAtEof).toBeUndefined();
  });

  it("treats omitted hunk counts as 1", () => {
    const { hunks, lines } = parsePatch("@@ -1 +1 @@\n-solo\n+SOLO");
    expect(hunks[0]).toMatchObject({ oldLines: 1, newLines: 1, section: "" });
    expect(lines).toMatchObject([
      { kind: "del", oldNo: 1 },
      { kind: "add", newNo: 1 },
    ]);
  });

  it("parses a deleted file", () => {
    const { hunks, lines } = parsePatch("@@ -1,3 +0,0 @@\n-a\n-b\n-c");
    expect(hunks[0]).toMatchObject({ newStart: 0, newLines: 0 });
    expect(lines.map((l) => l.oldNo)).toEqual([1, 2, 3]);
  });

  it("tolerates a trailing newline", () => {
    expect(parsePatch("@@ -1 +1 @@\n-a\n+b\n").lines).toHaveLength(2);
  });

  it("accepts blank context lines whose leading space was stripped", () => {
    const { lines } = parsePatch("@@ -1,3 +1,3 @@\n a\n\n-b\n+B");
    expect(lines[1]).toMatchObject({ kind: "ctx", text: "", oldNo: 2, newNo: 2 });
  });

  it("returns empty results for a missing patch (binary or too large)", () => {
    expect(parsePatch(null)).toEqual({ hunks: [], lines: [] });
    expect(parsePatch("")).toEqual({ hunks: [], lines: [] });
  });
});

describe("parsePatch rejects malformed patches", () => {
  it.each([
    ["content before a hunk", "hello\n@@ -1 +1 @@\n-a\n+b"],
    ["unknown prefix", "@@ -1 +1 @@\n*a"],
    ["too many additions", "@@ -1,1 +1,1 @@\n a\n+b"],
    ["truncated hunk", "@@ -1,3 +1,3 @@\n a"],
    ["hunk ended early", "@@ -1,2 +1,2 @@\n a\n@@ -9 +9 @@\n-x\n+y"],
  ])("%s", (_, patch) => {
    expect(() => parsePatch(patch)).toThrow(PatchParseError);
  });
});
