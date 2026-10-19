import { expect, test, type Page, type Route } from "@playwright/test";

// Promise Ledger UI with the API mocked. The real routes are exercised against
// GitHub + OpenRouter by scripts/live-ledger-check.ts (gate G4).
const PR = "/pr/priyansh-narang2308/reviewaloud-sandbox/2#ledger";
const json = (r: Route, status: number, body: unknown) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const item = (id: number, body: string, line: number) => ({
  commentId: id,
  author: "priyansh-narang2308",
  body,
  path: "src/orders.ts",
  side: "RIGHT",
  originalLine: line,
  originalCommit: "2194852aaaa",
  diffHunk: null,
  createdAt: `2026-10-19T19:0${id}:00Z`,
  htmlUrl: `https://github.com/x/pull/2#discussion_r${id}`,
  isResolved: false,
  isOutdated: false,
  replies: [],
});
const ITEMS = [
  item(1, "**Blocking:** orderTotal ignores the cart's discount code.", 6),
  item(2, "**Blocking:** This divides by zero when there are no orders. Guard the empty array and return 0.", 11),
  item(3, "**Question:** Why sort newest first here?", 15),
];
const verdict = (commentId: number, status: string, extra: Record<string, unknown> = {}) => ({
  commentId,
  status,
  intent: "change_request",
  rationale: `rationale ${commentId}`,
  whatIsMissing: null,
  evidence: [],
  decidedBy: "ai",
  model: "test-model:free",
  notes: ["1 commit(s) since the comment"],
  droppedEvidence: 0,
  headSha: "bf0a594000",
  checkedAt: 0,
  ...extra,
});
const VERDICTS: Record<number, unknown> = {
  1: verdict(1, "addressed", { evidence: [{ kind: "code", path: "src/orders.ts", startLine: 7, quote: "return base - base * discountRate(order.cart.discountCode);", supports: true, verified: true }] }),
  2: verdict(2, "unresolved", {
    whatIsMissing: "if (orders.length === 0) return 0;",
    evidence: [{ kind: "code", path: "src/orders.ts", startLine: 13, quote: "return sum / orders.length;", supports: false, verified: true }],
  }),
  3: verdict(3, "reply_needed", { intent: "question" }),
};

async function setup(page: Page, opts: { signedIn?: boolean; head?: () => string; clock?: boolean } = {}) {
  if (opts.clock) await page.clock.install();
  const calls = { verify: [] as number[], reply: [] as Record<string, unknown>[] };
  await page.route("**/api/auth/me", (r) =>
    json(r, 200, { configured: true, viewer: opts.signedIn === false ? null : { login: "priyansh-narang2308", avatarUrl: null } }),
  );
  await page.route("**/api/ledger/list?*", (r) =>
    json(r, 200, { headSha: "bf0a594000", prAuthor: "priyansh-narang2308", isPrivate: false, reviewers: ["priyansh-narang2308"], items: ITEMS }),
  );
  await page.route("**/api/ledger/head?*", (r) => json(r, 200, { headSha: opts.head?.() ?? "bf0a594000" }));
  await page.route("**/api/ledger/verify", async (r) => {
    const { commentId } = r.request().postDataJSON();
    calls.verify.push(commentId);
    await json(r, 200, VERDICTS[commentId]);
  });
  await page.route("**/api/gh/reply", async (r) => {
    calls.reply.push(r.request().postDataJSON());
    await json(r, 200, { id: 99, htmlUrl: "https://github.com/x/pull/2#discussion_r99" });
  });
  await page.goto(PR);
  await expect(page.locator("[data-hydrated]")).toBeVisible();
  await expect(page.getByTestId("ledger")).toBeVisible();
  return calls;
}

test("lists your requests in your own words, unchecked at first", async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId("promise")).toHaveCount(3);
  await expect(page.getByTestId("promise").first()).toContainText("orderTotal ignores the cart's discount code.");
  await expect(page.getByTestId("promise").first()).not.toContainText("**Blocking:**");
  await expect(page.getByTestId("score")).toContainText("0 of 3 kept");
});

test("check all runs one at a time and fills in verdicts, evidence and the score", async ({ page }) => {
  const calls = await setup(page);
  await page.getByTestId("check-all").click();
  await expect(page.getByTestId("check-all")).toHaveText("All checked");
  await expect(page.getByTestId("score")).toContainText("1 of 3 kept");
  expect(calls.verify).toEqual([1, 2, 3]);
  const rows = page.getByTestId("promise");
  await expect(rows.nth(0).getByTestId("status-chip")).toHaveAttribute("data-status", "addressed");
  await expect(rows.nth(0).getByTestId("evidence")).toContainText("discountRate(order.cart.discountCode)");
  await expect(rows.nth(1).getByTestId("status-chip")).toHaveAttribute("data-status", "unresolved");
  await expect(rows.nth(1).getByTestId("missing")).toContainText("orders.length === 0");
  await expect(rows.nth(2).getByTestId("status-chip")).toHaveAttribute("data-status", "reply_needed");
  await expect(page.getByTestId("check-all")).toHaveText("All checked");
  if (process.env.SHOT) {
    await page.getByTestId("promise").nth(1).getByTestId("follow-up-toggle").click();
    await page.setViewportSize({ width: 1280, height: 1500 });
    await page.screenshot({ path: "test-results/ledger.png", fullPage: true });
  }

  // Cached: reload shows verdicts without new checks.
  await page.reload();
  await expect(page.getByTestId("score")).toContainText("1 of 3 kept");
  expect(calls.verify).toHaveLength(3);
});

test("reviewer override wins and is labelled", async ({ page }) => {
  await setup(page);
  await page.getByTestId("check-all").click();
  await expect(page.getByTestId("score")).toContainText("1 of 3 kept");
  const row = page.getByTestId("promise").nth(2);
  await row.getByTestId("override").click();
  await page.getByRole("menuitemradio", { name: "Addressed" }).click();
  await expect(row.getByTestId("status-chip")).toContainText("reviewer override");
  await expect(page.getByTestId("score")).toContainText("2 of 3 kept");
});

test("hand back: instruction quotes your words; reply posts only after confirmation", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const calls = await setup(page);
  await page.getByTestId("check-all").click();
  const row = page.getByTestId("promise").nth(1);
  await row.getByTestId("follow-up-toggle").click();
  const text = row.getByTestId("follow-up-text");
  await expect(text).toHaveValue(/> This divides by zero when there are no orders/);
  await expect(text).toHaveValue(/Still missing: if \(orders.length === 0\) return 0;/);
  await row.getByRole("button", { name: "@claude" }).click();
  await expect(text).toHaveValue(/^@claude\n/);

  await row.getByRole("button", { name: "Copy for Claude Code" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("This divides by zero");

  await row.getByRole("button", { name: "Reply on GitHub thread" }).click();
  expect(calls.reply).toHaveLength(0);
  await row.getByRole("button", { name: "Yes, post reply" }).click();
  await expect(row.getByTestId("reply-posted")).toBeVisible();
  expect(calls.reply[0]).toMatchObject({ commentId: 2 });
  expect(String(calls.reply[0].body)).toMatch(/^@claude/);
});

test("signed out: checks need sign-in", async ({ page }) => {
  await setup(page, { signedIn: false });
  await expect(page.getByRole("link", { name: "Sign in to run checks" })).toBeVisible();
  await expect(page.getByTestId("check").first()).toBeDisabled();
});

test("new commits are noticed and open requests are re-checked", async ({ page }) => {
  test.slow();
  let head = "bf0a594000";
  const calls = await setup(page, { head: () => head, clock: true });
  await page.getByTestId("check-all").click();
  await expect(page.getByTestId("check-all")).toHaveText("All checked");
  // Simulate the agent pushing: the list and head now report a new commit.
  head = "c0ffee1234";
  await page.unroute("**/api/ledger/list?*");
  await page.route("**/api/ledger/list?*", (r) =>
    json(r, 200, { headSha: head, prAuthor: "priyansh-narang2308", isPrivate: false, reviewers: ["priyansh-narang2308"], items: ITEMS }),
  );
  await page.clock.runFor(31_000);
  await expect(page.getByTestId("new-commits")).toContainText("bf0a594 → c0ffee1");
  await page.getByTestId("new-commits").getByRole("button").click();
  // Only not-yet-kept requests (2 and 3) are re-checked automatically.
  await expect.poll(() => calls.verify.slice(3)).toEqual([2, 3]);
});
