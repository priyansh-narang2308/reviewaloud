import { describe, expect, it } from "vitest";
import { parsePrInput, workspacePath } from "./url";

const ref = { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: 1 };

describe("parsePrInput", () => {
  it.each([
    "https://github.com/priyansh-narang2308/reviewaloud-sandbox/pull/1",
    "github.com/priyansh-narang2308/reviewaloud-sandbox/pull/1",
    "  https://www.github.com/priyansh-narang2308/reviewaloud-sandbox/pull/1/files  ",
    "https://github.com/priyansh-narang2308/reviewaloud-sandbox/pull/1/files?diff=split#r123",
    "priyansh-narang2308/reviewaloud-sandbox#1",
    "priyansh-narang2308/reviewaloud-sandbox/pull/1",
  ])("accepts %s", (input) => {
    expect(parsePrInput(input)).toEqual({ ok: true, ref });
  });

  it("keeps dots and underscores in names", () => {
    expect(parsePrInput("vercel/next.js#1")).toEqual({ ok: true, ref: { owner: "vercel", repo: "next.js", number: 1 } });
  });

  it.each([
    ["", /Paste/],
    ["https://github.com/o/r/issues/5", /issue link/],
    ["https://gitlab.com/o/r/pull/1", /Use a link/],
    ["o/r#0", /Use a link/],
    ["../r#1", /Use a link/],
    ["o/r", /Use a link/],
  ])("rejects %j", (input, error) => {
    const r = parsePrInput(input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(error);
  });

  it("builds the workspace route", () => {
    expect(workspacePath(ref)).toBe("/pr/priyansh-narang2308/reviewaloud-sandbox/1");
  });
});
