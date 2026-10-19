import { expect, test } from "@playwright/test";

// Simulates Wispr Flow's documented behaviour: text arrives as a clipboard
// paste into the focused field. The real Wispr run is manual (TEST_MATRIX G1).
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("pasted text becomes a card on the selected anchor, which never moves", async ({ page }) => {
  await page.goto("/spike/capture");
  const capture = page.getByTestId("capture");
  await expect(capture).toBeDisabled();

  await page.getByTestId("line-LEFT:20").click();
  await expect(page.getByTestId("anchor")).toHaveText("src/cart.ts · LEFT 20");
  await expect(capture).toBeFocused();

  await page.evaluate(() =>
    navigator.clipboard.writeText("Why drop the += here?\nThe cap hides overflow from the caller."),
  );
  await page.keyboard.press("ControlOrMeta+V");

  await expect(page.getByTestId("status")).toHaveText("Text received");
  await expect(page.getByTestId("anchor")).toHaveText("src/cart.ts · LEFT 20");
  await expect(page.getByTestId("log")).toContainText("input insertFromPaste");

  await page.keyboard.press("ControlOrMeta+Enter");
  const card = page.getByTestId("cards").locator("li");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("LEFT 20 · paste");
  await expect(card).toContainText("The cap hides overflow from the caller.");
});

test("typing fallback works and is labelled as typed", async ({ page }) => {
  await page.goto("/spike/capture");
  await page.getByTestId("line-RIGHT:25").click();
  await page.keyboard.type("nit: name the constant");
  await expect(page.getByTestId("status")).toHaveText("Typing");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("cards").locator("li")).toContainText("RIGHT 25 · typed");
});
