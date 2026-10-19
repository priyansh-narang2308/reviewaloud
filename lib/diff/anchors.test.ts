import { describe, expect, it } from "vitest";
import files from "../github/__fixtures__/sandbox-pr-1-files.json";
import {
  type Anchor,
  anchorForLine,
  anchorForRange,
  findLine,
  remapAnchor,
  toReviewComment,
  validateAnchor,
} from "./anchors";
import { type DiffLine, parsePatch } from "./parse";

const SHA = "518baaa";
const parsed = (name: string) => parsePatch(files.find((f) => f.filename === name)!.patch!);
const cart = parsed("src/cart.ts");
const checkout = parsed("src/checkout.ts");
const lineWith = (p: ReturnType<typeof parsePatch>, text: string, kind: DiffLine["kind"]) =>
  p.lines.find((l) => l.kind === kind && l.text.includes(text))!;

// What a click in the UI produces, compared against anchors GitHub accepted
// and placed correctly in the Task 5 live check (docs/TEST_MATRIX.md).
describe("anchors match the live-verified GitHub placements", () => {
  it.each([
    ["A added line", () => anchorForLine("src/cart.ts", SHA, lineWith(cart, "MAX_QUANTITY = 99", "add")), { side: "RIGHT", line: 17 }],
    ["B deleted line", () => anchorForLine("src/cart.ts", SHA, lineWith(cart, "quantity += item", "del")), { side: "LEFT", line: 20 }],
    ["C context line", () => anchorForLine("src/cart.ts", SHA, lineWith(cart, "const existing", "ctx")), { side: "RIGHT", line: 23 }],
    ["E second hunk", () => anchorForLine("src/cart.ts", SHA, lineWith(cart, "taxable * GST_RATE", "add")), { side: "RIGHT", line: 69 }],
    ["F last line of new file", () => anchorForLine("src/checkout.ts", SHA, checkout.lines.at(-1)!), { side: "RIGHT", line: 13 }],
  ] as const)("%s", (_, make, expected) => {
    expect(make()).toMatchObject(expected);
  });

  it("D multi-line range, selected in either direction", () => {
    const top = lineWith(cart, "if (item.quantity <= 0)", "add");
    const bottom = cart.lines[top.idx + 2];
    for (const [a, b] of [
      [top, bottom],
      [bottom, top],
    ]) {
      const r = anchorForRange("src/cart.ts", SHA, a, b);
      expect(r.ok && r.anchor).toMatchObject({ side: "RIGHT", line: 22, startSide: "RIGHT", startLine: 20 });
    }
  });

  it("serialises to the exact payload the live check sent", () => {
    const r = anchorForRange("src/cart.ts", SHA, cart.lines[6], cart.lines[8]);
    expect(r.ok && toReviewComment(r.anchor, "x")).toEqual({
      path: "src/cart.ts",
      body: "x",
      line: 22,
      side: "RIGHT",
      start_line: 20,
      start_side: "RIGHT",
    });
    expect(toReviewComment(anchorForLine("src/cart.ts", SHA, cart.lines[0]), "y")).not.toHaveProperty("start_line");
  });

  it("supports a range starting on a deleted line and ending on an added one", () => {
    const del = lineWith(cart, "quantity += item", "del");
    const add = cart.lines[del.idx + 1];
    const r = anchorForRange("src/cart.ts", SHA, del, add);
    expect(r.ok && r.anchor).toMatchObject({ startSide: "LEFT", startLine: 20, side: "RIGHT", line: 25 });
    expect(r.ok && validateAnchor(r.anchor, cart).ok).toBe(true);
  });
});

describe("validateAnchor", () => {
  const good = anchorForLine("src/cart.ts", SHA, lineWith(cart, "MAX_QUANTITY = 99", "add"));

  it("accepts an anchor taken from the same diff", () => {
    expect(validateAnchor(good, cart).ok).toBe(true);
  });

  it("rejects a line outside the diff (GitHub returned 422 for N1)", () => {
    expect(validateAnchor({ ...good, line: 2 }, cart)).toEqual({ ok: false, problem: "not_in_diff" });
  });

  it("rejects RIGHT numbers that only exist as deletions", () => {
    // Old line 61 is a deletion; RIGHT 61 is a context line with different text.
    const bad: Anchor = { ...good, side: "RIGHT", line: 61, lineText: "  return base - discount;" };
    expect(validateAnchor(bad, cart)).toEqual({ ok: false, problem: "text_changed" });
  });

  it("flags stale text at the same position", () => {
    expect(validateAnchor({ ...good, lineText: "const MAX_QUANTITY = 50;" }, cart)).toEqual({
      ok: false,
      problem: "text_changed",
    });
  });

  it("enforces our single-hunk range rule (GitHub itself accepted N2)", () => {
    const r = anchorForRange("src/cart.ts", SHA, lineWith(cart, "MAX_QUANTITY = 99", "add"), lineWith(cart, "GST_RATE = 0.18", "add"));
    expect(r).toEqual({ ok: false, problem: "cross_hunk" });
    const forged: Anchor = { ...good, line: 63, lineText: "const GST_RATE = 0.18;", startLine: 17, startSide: "RIGHT", startLineText: good.lineText };
    expect(validateAnchor(forged, cart)).toEqual({ ok: false, problem: "cross_hunk" });
  });

  it("rejects a reversed range", () => {
    const reversed: Anchor = { ...good, line: 17, lineText: good.lineText, startLine: 20, startSide: "RIGHT", startLineText: "  if (item.quantity <= 0) {" };
    expect(validateAnchor(reversed, cart)).toEqual({ ok: false, problem: "bad_order" });
  });

  it("finds context lines on LEFT too, as GitHub accepts them there (N3)", () => {
    expect(findLine(cart, "LEFT", 17)).toMatchObject({ kind: "ctx", newNo: 19 });
  });
});

describe("remapAnchor after the PR head moves", () => {
  const v1 = parsePatch("@@ -1,4 +1,5 @@\n a\n+b\n c\n-d\n+D\n e");
  const pinB = anchorForLine("f.ts", "v1", v1.lines[1]); // RIGHT 2 "b"

  it("keeps an anchor whose line is unchanged and updates the commit", () => {
    expect(remapAnchor(pinB, v1, "v2")).toEqual({ status: "unchanged", anchor: { ...pinB, commitId: "v2" } });
  });

  it("follows the line when new lines are inserted above it", () => {
    const v2 = parsePatch("@@ -1,4 +1,7 @@\n a\n+x\n+y\n+b\n c\n-d\n+D\n e");
    expect(remapAnchor(pinB, v2, "v2")).toMatchObject({ status: "moved", anchor: { line: 4, commitId: "v2" } });
  });

  it("reports outdated when the line was removed", () => {
    const v2 = parsePatch("@@ -1,4 +1,4 @@\n a\n c\n-d\n+D\n e");
    expect(remapAnchor(pinB, v2, "v2")).toEqual({ status: "outdated", reason: "line_gone" });
  });

  it("refuses to guess when the text now appears more than once", () => {
    const v2 = parsePatch("@@ -1,4 +1,7 @@\n a\n+x\n+b\n+b\n c\n-d\n+D\n e");
    expect(remapAnchor(pinB, v2, "v2")).toEqual({ status: "outdated", reason: "ambiguous" });
  });

  it("moves a whole range when both ends can be found", () => {
    const range = anchorForRange("f.ts", "v1", v1.lines[3], v1.lines[4]); // LEFT 3 "d" → RIGHT 4 "D"
    expect(range.ok).toBe(true);
    const v2 = parsePatch("@@ -1,4 +1,6 @@\n a\n+z\n+b\n c\n-d\n+D\n e");
    const r = remapAnchor((range as { anchor: Anchor }).anchor, v2, "v2");
    expect(r).toMatchObject({ status: "moved", anchor: { startSide: "LEFT", startLine: 3, side: "RIGHT", line: 5 } });
  });
});
