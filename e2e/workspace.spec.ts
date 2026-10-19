import { expect, test } from "@playwright/test";

// Uses the live public sandbox PR (unauthenticated GitHub reads).
const PR = "/pr/priyansh-narang2308/reviewaloud-sandbox/1";

test.describe("PR workspace (live sandbox PR #1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PR);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Checkout summary with GST");
    await expect(page.locator("[data-hydrated]")).toBeVisible();
  });

  test("lists changed files with counts and renders diffs with GitHub's numbering", async ({ page }) => {
    const tree = page.getByRole("navigation", { name: "Changed files" });
    await expect(tree.getByRole("button")).toHaveCount(4);
    await expect(tree).toContainText("checkout.ts");
    const cart = page.locator("section[data-path='src/cart.ts']");
    await expect(cart.getByText("@@ -14,10 +14,15 @@")).toBeVisible();
    await expect(cart.getByText("@@ -55,8 +60,11 @@")).toBeVisible();
    // Deleted line: old number only.
    const del = cart.locator(".diff-row[data-kind='del']").first();
    await expect(del).toContainText("existing.quantity += item.quantity;");
    await expect(del.locator("[role=gridcell]").first()).toHaveText("20");
  });

  test("click pins a line; shift-click extends a range within a hunk", async ({ page }) => {
    const cart = page.locator("section[data-path='src/cart.ts']");
    await cart.locator("[data-idx='3']").click();
    await expect(page.getByTestId("selection")).toContainText("src/cart.ts R17");
    await cart.locator("[data-idx='6']").click();
    await cart.locator("[data-idx='8']").click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("selection")).toContainText("R20–R22");
    await expect(cart.locator("[aria-selected='true']")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("selection")).toHaveCount(0);
  });

  test("deleted lines pin on the LEFT side", async ({ page }) => {
    await page.locator("section[data-path='src/cart.ts'] .diff-row[data-kind='del']").first().click();
    await expect(page.getByTestId("selection")).toContainText("L20");
  });

  test("a range across hunks is refused with an explanation", async ({ page }) => {
    const cart = page.locator("section[data-path='src/cart.ts']");
    await cart.locator("[data-idx='3']").click();
    await cart.locator(".diff-row").last().click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("selection-error")).toContainText("inside one hunk");
  });

  test("j/k move the pinned line; [ and ] move between files", async ({ page }) => {
    await page.keyboard.press("j");
    await expect(page.getByTestId("selection")).toContainText("src/auth.ts R9");
    await page.keyboard.press("j");
    await expect(page.getByTestId("selection")).toContainText("R10");
    await page.keyboard.press("k");
    await expect(page.getByTestId("selection")).toContainText("R9");
    await page.keyboard.press("]");
    await expect(page.getByRole("navigation", { name: "Changed files" }).locator("[aria-current='true']")).toContainText("cart.ts");
  });
});

test("landing form opens a PR and validates input", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const input = page.getByLabel("Open a public pull request");
  await input.fill("https://github.com/o/r/issues/5");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByTestId("pr-url-error")).toContainText("issue link");
  await input.fill("priyansh-narang2308/reviewaloud-sandbox#1");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(PR);
});

test("missing PR shows a not-found state", async ({ page }) => {
  await page.goto("/pr/priyansh-narang2308/reviewaloud-sandbox/9999");
  await expect(page.getByTestId("workspace-error")).toContainText("Pull request not found");
});

test("malformed route is rejected without calling GitHub", async ({ page }) => {
  await page.goto("/pr/a/b/0");
  await expect(page.getByTestId("workspace-error")).toContainText("valid pull request address");
});

test("landing form works without JavaScript", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByLabel("Open a public pull request").fill("not a pr");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByTestId("pr-url-error")).toContainText("Use a link");
  await page.getByLabel("Open a public pull request").fill("priyansh-narang2308/reviewaloud-sandbox#1");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(PR);
  await ctx.close();
});
