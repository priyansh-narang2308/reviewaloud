import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Task 35: automated accessibility scan (WCAG 2.1 A/AA rules) of the key screens.
// Automated checks catch a subset of issues; keyboard paths are covered by the
// other specs (j/k, [ ], Esc, dialogs, menus).

async function scan(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Next.js dev-only overlay is not part of the product.
    .exclude("nextjs-portal")
    .analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length) {
    console.log(
      serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n"),
    );
  }
  return serious;
}

const pages: [string, string, (p: Page) => Promise<void>][] = [
  ["landing", "/", async () => {}],
  ["demo review", "/demo", async (p) => void (await expect(p.locator("[data-hydrated]")).toBeVisible())],
  [
    "demo ledger (checked)",
    "/demo#ledger",
    async (p) => {
      await expect(p.locator("[data-hydrated]")).toBeVisible();
      await p.getByTestId("check-all").click();
      await expect(p.getByTestId("check-all")).toHaveText("All checked");
      await p.getByTestId("follow-up-toggle").first().click();
    },
  ],
  ["live PR workspace", "/pr/priyansh-narang2308/reviewaloud-sandbox/1", async (p) => void (await expect(p.locator("[data-hydrated]")).toBeVisible())],
];

for (const width of [1280, 375]) {
  for (const [name, url, prepare] of pages) {
    test(`no serious a11y violations: ${name} @${width}px`, async ({ page }) => {
      await page.route(/\/api\/(ledger|gh|ai)\//, (r) => r.abort());
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await prepare(page);
      expect(await scan(page)).toEqual([]);
      // Responsive: nothing forces sideways scrolling of the page.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}

test("publish dialog and shortcuts dialog are accessible", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.locator("[data-hydrated]")).toBeVisible();
  await page.locator("section[data-path='src/orders.ts'] .diff-row").first().click();
  await page.getByTestId("capture").fill("x");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.getByTestId("open-publish").click();
  await expect(page.getByRole("dialog", { name: /Publish review/ })).toBeVisible();
  expect(await scan(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+Slash");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});
