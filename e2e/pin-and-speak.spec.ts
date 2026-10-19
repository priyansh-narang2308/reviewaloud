import { expect, test } from "@playwright/test";

// Wispr Flow inserts text by pasting into the focused field after the shortcut
// is released (Wispr help center). These tests simulate that paste; the real
// Wispr run is manual (docs/TEST_MATRIX.md, G1).
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const PR = "/pr/priyansh-narang2308/reviewaloud-sandbox/1";
const cart = (page: import("@playwright/test").Page) => page.locator("section[data-path='src/cart.ts']");

async function dictate(page: import("@playwright/test").Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press("ControlOrMeta+V");
}

test.beforeEach(async ({ page }) => {
  await page.goto(PR);
  await expect(page.locator("[data-hydrated]")).toBeVisible();
});

test("pin a line, dictate, save: the draft lands on that line and survives reload", async ({ page }) => {
  await cart(page).locator(".diff-row[data-kind='del']").first().click();
  await expect(page.getByTestId("capture-anchor")).toContainText("src/cart.ts L20");
  await expect(page.getByTestId("capture-anchor-detail")).toContainText("deleted line 20");
  await expect(page.getByTestId("capture-anchor-detail")).toContainText("existing.quantity += item.quantity;");
  await expect(page.getByTestId("capture")).toBeFocused();

  await dictate(page, "Why drop the plus-equals here?\nThe cap silently hides overflow from the caller.");
  await expect(page.getByTestId("capture-status")).toContainText("Text received");
  // The anchor never moves because text arrived.
  await expect(page.getByTestId("capture-anchor")).toContainText("L20");
  await expect(page.getByTestId("capture")).toHaveValue(/caller\.$/);

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("capture-status")).toContainText("Saved to src/cart.ts L20");
  await expect(page.getByTestId("draft-count")).toHaveText("1 draft");
  await expect(cart(page).locator(".diff-row[data-marked]")).toHaveCount(1);
  await expect(cart(page).locator(".diff-row[data-marked]")).toContainText("existing.quantity += item.quantity;");
  await expect(page.getByTestId("capture")).toHaveValue("");

  await page.reload();
  await expect(page.locator("[data-hydrated]")).toBeVisible();
  await expect(page.getByTestId("draft-count")).toHaveText("1 draft");
  await expect(cart(page).locator(".diff-row[data-marked]")).toHaveCount(1);
});

test("a range anchor and a typed comment both work", async ({ page }) => {
  await cart(page).locator("[data-idx='6']").click();
  await cart(page).locator("[data-idx='8']").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("capture-anchor")).toContainText("R20–R22");
  await expect(page.getByTestId("capture-anchor-detail")).toContainText("new lines 20–22");
  await page.getByTestId("capture").pressSequentially("nit: early return reads better");
  await page.getByRole("button", { name: "Save comment" }).click();
  await expect(page.getByTestId("draft-count")).toHaveText("1 draft");
  // GitHub anchors a range on its last line; the marker follows.
  await expect(cart(page).locator(".diff-row[data-marked]")).toHaveAttribute("data-idx", "8");
});

test("text that arrives before a line is pinned is kept until you pin one", async ({ page }) => {
  await page.keyboard.press("c");
  await expect(page.getByTestId("capture")).toBeFocused();
  await dictate(page, "Rename this constant.");
  await expect(page.getByTestId("capture-status")).toContainText("Pin a line to attach");
  await expect(page.getByRole("button", { name: "Save comment" })).toBeDisabled();

  await cart(page).locator("[data-idx='3']").click();
  await expect(page.getByTestId("capture")).toHaveValue("Rename this constant.");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("capture-status")).toContainText("Saved to src/cart.ts R17");
});

test("discard clears unsaved text without creating a draft", async ({ page }) => {
  await cart(page).locator("[data-idx='3']").click();
  await dictate(page, "never mind");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByTestId("capture")).toHaveValue("");
  await expect(page.getByTestId("draft-count")).toHaveText("0 drafts");
});

test("j/k don't steal focus from the capture field once you're typing", async ({ page }) => {
  await cart(page).locator("[data-idx='3']").click();
  await page.keyboard.type("jk");
  await expect(page.getByTestId("capture")).toHaveValue("jk");
  await expect(page.getByTestId("capture-anchor")).toContainText("R17");
});
