import { expect, test } from "@playwright/test";

test("mascot peeks from the bottom-left and cycles tips on click", async ({ page }) => {
  await page.goto("/");
  const mascot = page.getByTestId("mascot");
  await expect(mascot).toBeVisible();
  const vp = page.viewportSize()!;
  // Wait for the one-time peek animation to settle, then check it's flush to the corner.
  await expect.poll(async () => {
    const box = (await mascot.boundingBox())!;
    return [Math.round(box.x), Math.round(box.y + box.height)];
  }).toEqual([0, vp.height]);
  await page.getByRole("button", { name: "Say hi to the mascot" }).click();
  await expect(mascot.getByRole("status")).toContainText("Say it.");
  await page.getByRole("button", { name: "Show the next tip" }).click();
  await expect(mascot.getByRole("status")).toContainText("hold your Wispr key");
});

test("mascot is only on the landing page", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByTestId("mascot")).toHaveCount(0);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("no mascot animation when the user prefers reduced motion", async ({ page }) => {
    await page.goto("/");
    const anim = await page.getByTestId("mascot").evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
  });
});
