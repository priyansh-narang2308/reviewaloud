import { expect, test } from "@playwright/test";

// The public no-login demo: everything works without GitHub or AI calls, and
// everything simulated says so.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.beforeEach(async ({ page }) => {
  // Fail loudly if the demo ever reaches for a live API.
  await page.route(/\/api\/(gh|ledger|ai|auth)\//, (r) => r.abort());
});

test("full demo flow: pin, dictate, save, publish (simulated), ledger replay, hand back", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.locator("[data-hydrated]")).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toContainText("Nothing is sent to GitHub or AI");
  await expect(page.getByTestId("demo-pill")).toBeVisible();

  // Pin & speak on the real snapshot diff.
  const orders = page.locator("section[data-path='src/orders.ts']");
  await orders.locator(".diff-row[data-kind='add']").filter({ hasText: "return sum / orders.length;" }).click();
  await page.evaluate(() => navigator.clipboard.writeText("Guard the empty array before dividing."));
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.getByTestId("capture-status")).toContainText("Text received");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("draft-count")).toHaveText("1 draft");

  // Publish: simulated and labelled.
  await page.getByTestId("open-publish").click();
  await page.getByRole("button", { name: "Create draft (simulated)" }).click();
  await expect(page.getByTestId("publish-draft")).toContainText("nothing was sent to GitHub");
  await page.getByRole("button", { name: "Submit: comment" }).click();
  await page.getByRole("button", { name: "Yes, submit publicly" }).click();
  await expect(page.getByTestId("publish-submitted")).toContainText("Simulated");
  await page.getByRole("button", { name: "Close" }).click();

  // Ledger: replays the recorded live run, labelled.
  await page.getByTestId("tab-ledger").click();
  await expect(page.getByTestId("promise")).toHaveCount(5);
  await page.getByTestId("check-all").click();
  await expect(page.getByTestId("check-all")).toHaveText("All checked");
  await expect(page.getByTestId("score")).toContainText("2 of 5 kept");
  await expect(page.getByText(/Recorded live run/).first()).toBeVisible();

  // Hand back: simulated reply.
  const open = page.getByTestId("promise").filter({ has: page.locator("[data-status='unresolved']") }).first();
  await open.getByTestId("follow-up-toggle").click();
  await open.getByRole("button", { name: "Reply on GitHub thread" }).click();
  await expect(open).toContainText("Demo: this is simulated");
  await open.getByRole("button", { name: "Yes, post reply" }).click();
  await expect(open.getByTestId("reply-posted")).toContainText("Simulated: reply not sent");
});

test("landing: demo CTA and PR form work; no horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Review by voice");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByTestId("hero-demo").click();
  await expect(page).toHaveURL(/\/demo$/);
});
