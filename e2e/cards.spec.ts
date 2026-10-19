import { expect, test, type Page } from "@playwright/test";

const PR = "/pr/priyansh-narang2308/reviewaloud-sandbox/1";
const cart = (page: Page) => page.locator("section[data-path='src/cart.ts']");

async function addComment(page: Page, idx: number, text: string) {
  await cart(page).locator(`[data-idx='${idx}']`).click();
  await page.getByTestId("capture").fill(text);
  await page.keyboard.press("ControlOrMeta+Enter");
}

test.beforeEach(async ({ page }) => {
  await page.goto(PR);
  await expect(page.locator("[data-hydrated]")).toBeVisible();
});

test("saved comment appears inline under its line and in the drafts list", async ({ page }) => {
  await addComment(page, 3, "Why 99?");
  const card = cart(page).getByTestId("comment-card");
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("card-body")).toHaveText("Why 99?");
  await expect(card).toContainText("R17");
  await expect(page.getByTestId("drafts-list")).toContainText("Why 99?");
});

test("edit, set type, and the change persists across reload", async ({ page }) => {
  await addComment(page, 3, "Why 99?");
  const card = cart(page).getByTestId("comment-card");
  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByTestId("card-edit").fill("Why 99? Make the cap configurable.");
  await page.keyboard.press("ControlOrMeta+Enter");
  await card.getByTestId("card-type").click();
  await page.getByRole("menuitemradio", { name: /Suggestion/ }).click();
  await expect(card.getByTestId("card-body")).toHaveText("Why 99? Make the cap configurable.");

  await page.reload();
  await expect(page.locator("[data-hydrated]")).toBeVisible();
  const again = cart(page).getByTestId("comment-card");
  await expect(again.getByTestId("card-body")).toHaveText("Why 99? Make the cap configurable.");
  await expect(again.getByTestId("card-type")).toHaveAttribute("data-value", "suggestion");
});

test("Esc while editing cancels the edit only", async ({ page }) => {
  await addComment(page, 3, "original");
  const card = cart(page).getByTestId("comment-card");
  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByTestId("card-edit").fill("changed");
  await page.keyboard.press("Escape");
  await expect(card.getByTestId("card-body")).toHaveText("original");
});

test("delete offers undo, which restores the comment", async ({ page }) => {
  await addComment(page, 3, "keep me");
  await cart(page).getByTestId("comment-card").getByRole("button", { name: "Delete" }).click();
  await expect(cart(page).getByTestId("comment-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cart(page).getByTestId("comment-card").getByTestId("card-body")).toHaveText("keep me");
});

test("move a comment to another line, and to a range", async ({ page }) => {
  await addComment(page, 3, "wrong line");
  const card = cart(page).getByTestId("comment-card");
  await card.getByRole("button", { name: "Move" }).click();
  await expect(page.getByTestId("move-bar")).toContainText("click a line");
  await cart(page).locator("[data-idx='9']").click();
  await expect(page.getByTestId("move-bar")).toContainText("src/cart.ts R23");
  await page.getByRole("button", { name: "Move here" }).click();
  await expect(cart(page).getByTestId("comment-card")).toContainText("R23");
  await expect(page.getByTestId("drafts-list")).toContainText("R23");

  await cart(page).getByTestId("comment-card").getByRole("button", { name: "Move" }).click();
  await cart(page).locator("[data-idx='6']").click();
  await cart(page).locator("[data-idx='8']").click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Move here" }).click();
  await expect(cart(page).getByTestId("comment-card")).toContainText("R20–R22");
});

test("moving to a range across hunks is blocked", async ({ page }) => {
  await addComment(page, 3, "x");
  await cart(page).getByTestId("comment-card").getByRole("button", { name: "Move" }).click();
  await cart(page).locator("[data-idx='3']").click();
  await cart(page).locator(".diff-row").last().click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("move-bar")).toContainText("inside one hunk");
  await expect(page.getByRole("button", { name: "Move here" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("move-bar")).toHaveCount(0);
});

test("? opens the shortcuts list; n/p jump between hunks", async ({ page }) => {
  await page.keyboard.press("Shift+Slash");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("]"); // cart.ts
  await page.keyboard.press("n");
  await expect(page.getByTestId("capture-anchor")).toContainText("src/cart.ts R14");
  await page.keyboard.press("n");
  await expect(page.getByTestId("capture-anchor")).toContainText("R60");
  await page.keyboard.press("p");
  await expect(page.getByTestId("capture-anchor")).toContainText("R14");
});

// Ask the server whether AI is configured, instead of guessing from the test env.
async function aiConfigured(page: Page, baseURL: string) {
  const res = await page.request.post("/api/ai/tidy", { headers: { Origin: baseURL }, data: {} });
  return res.status() !== 503; // 400 = configured but invalid body; 503 = not configured
}

test("Tidy button matches server configuration", async ({ page, baseURL }) => {
  const configured = await aiConfigured(page, baseURL!);
  await addComment(page, 3, "um so why ninety nine");
  await expect(cart(page).getByTestId("comment-card")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tidy (AI)" })).toHaveCount(configured ? 1 : 0);
});

test("tidy API refuses cross-origin requests", async ({ request }) => {
  const res = await request.post("/api/ai/tidy", {
    headers: { Origin: "https://evil.example" },
    data: { body: "x", path: "a.ts", lineText: "" },
  });
  expect(res.status()).toBe(403);
});

test("tidy API rejects malformed input", async ({ page, baseURL }) => {
  test.skip(!(await aiConfigured(page, baseURL!)), "AI not configured");
  const res = await page.request.post("/api/ai/tidy", { headers: { Origin: baseURL! }, data: { body: "" } });
  expect(res.status()).toBe(400);
});

test("type picker works from the keyboard and can clear the type", async ({ page }) => {
  await addComment(page, 3, "x");
  const trigger = cart(page).getByTestId("card-type");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("s"); // type-ahead to "Suggestion"
  await expect(page.getByRole("menuitemradio", { name: /Suggestion/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("data-value", "suggestion");
  await trigger.click();
  await page.getByRole("menuitemradio", { name: "No type" }).click();
  await expect(trigger).toHaveAttribute("data-value", "");
  await expect(trigger).toHaveText(/Add type/);
});

test("interactive elements show a pointer cursor", async ({ page }) => {
  await addComment(page, 3, "x");
  const cursor = (sel: import("@playwright/test").Locator) => sel.evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursor(cart(page).getByTestId("card-type"))).toBe("pointer");
  expect(await cursor(cart(page).getByRole("button", { name: "Edit" }))).toBe("pointer");
  expect(await cursor(cart(page).locator(".diff-row").first())).toBe("pointer");
  expect(await cursor(page.getByRole("button", { name: "Save comment" }))).toBe("not-allowed");
});
