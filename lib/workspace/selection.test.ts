import { describe, expect, it } from "vitest";
import files from "../github/__fixtures__/sandbox-pr-1-files.json";
import { parsePatch } from "../diff/parse";
import { describeAnchor, describeAnchorLong, nextSelection, selectionToAnchor } from "./selection";

const cart = parsePatch(files.find((f) => f.filename === "src/cart.ts")!.patch!);

describe("selection", () => {
  it("click then shift-click extends from the first click", () => {
    const s1 = nextSelection(null, "src/cart.ts", 8, false);
    const s2 = nextSelection(s1, "src/cart.ts", 6, true);
    expect(s2).toEqual({ path: "src/cart.ts", anchorIdx: 8, focusIdx: 6 });
    const r = selectionToAnchor(s2, cart, "sha");
    expect(r.ok && describeAnchor(r.anchor)).toBe("R20–R22");
    expect(r.ok && [r.fromIdx, r.toIdx]).toEqual([6, 8]);
  });

  it("shift-click in another file starts a new selection", () => {
    const s1 = nextSelection(null, "a.ts", 3, false);
    expect(nextSelection(s1, "b.ts", 5, true)).toEqual({ path: "b.ts", anchorIdx: 5, focusIdx: 5 });
  });

  it("reports cross-hunk ranges", () => {
    const last = cart.lines.length - 1;
    expect(selectionToAnchor({ path: "src/cart.ts", anchorIdx: 0, focusIdx: last }, cart, "sha")).toEqual({
      ok: false,
      problem: "cross_hunk",
    });
  });

  it("describes single deleted lines on the left", () => {
    const del = cart.lines.find((l) => l.kind === "del")!;
    const r = selectionToAnchor({ path: "src/cart.ts", anchorIdx: del.idx, focusIdx: del.idx }, cart, "sha");
    expect(r.ok && describeAnchor(r.anchor)).toBe("L20");
  });

  it("spells out deleted vs new lines", () => {
    const del = cart.lines.find((l) => l.kind === "del")!;
    const one = selectionToAnchor({ path: "p", anchorIdx: del.idx, focusIdx: del.idx }, cart, "s");
    expect(one.ok && describeAnchorLong(one.anchor)).toBe("deleted line 20");
    const range = selectionToAnchor({ path: "p", anchorIdx: 6, focusIdx: 8 }, cart, "s");
    expect(range.ok && describeAnchorLong(range.anchor)).toBe("new lines 20–22");
    const mixed = selectionToAnchor({ path: "p", anchorIdx: del.idx, focusIdx: del.idx + 1 }, cart, "s");
    expect(mixed.ok && describeAnchorLong(mixed.anchor)).toBe("deleted line 20 – new line 25");
    const ctx = selectionToAnchor({ path: "p", anchorIdx: 0, focusIdx: 0 }, cart, "s");
    expect(ctx.ok && describeAnchorLong(ctx.anchor)).toBe("unchanged line 14");
    const spanning = selectionToAnchor({ path: "p", anchorIdx: 2, focusIdx: 3 }, cart, "s");
    expect(spanning.ok && describeAnchorLong(spanning.anchor)).toBe("unchanged line 16 – new line 17");
  });
});
