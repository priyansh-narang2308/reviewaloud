import { expect, test, type Page, type Route } from "@playwright/test";

// UI flows of the publish dialog with the API mocked. The real routes are
// exercised against GitHub by scripts/live-routes-check.ts.
const PR = "/pr/priyansh-narang2308/reviewaloud-sandbox/1";
const cart = (page: Page) => page.locator("section[data-path='src/cart.ts']");
const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function signedIn(page: Page, login = "someone-else") {
  await page.route("**/api/auth/me", (r) =>
    json(r, 200, { configured: true, appSlug: "reviewaloud", viewer: { login, avatarUrl: null } }),
  );
}

async function addComment(page: Page, idx: number, text: string) {
  await cart(page).locator(`[data-idx='${idx}']`).click();
  await page.getByTestId("capture").fill(text);
  await page.keyboard.press("ControlOrMeta+Enter");
}

async function open(page: Page) {
  await page.goto(PR);
  await expect(page.locator("[data-hydrated]")).toBeVisible();
}

test("signed out: preview lists drafts and offers sign-in instead of publishing", async ({ page }) => {
  await page.route("**/api/auth/me", (r) => json(r, 200, { configured: true, viewer: null }));
  await open(page);
  await expect(page.getByTestId("sign-in")).toHaveAttribute("href", /\/api\/auth\/login\?returnTo=%2Fpr%2F/);
  await addComment(page, 3, "Why 99?");
  await page.getByTestId("open-publish").click();
  await expect(page.getByTestId("publish-list")).toContainText("Why 99?");
  await expect(page.getByRole("link", { name: "Sign in with GitHub to publish" })).toBeVisible();
});

test("draft → confirm → submit; drafts clear only after success; one request per click burst", async ({ page }) => {
  await signedIn(page);
  let creates = 0;
  let submits = 0;
  let createBody: Record<string, unknown> = {};
  await page.route("**/api/gh/review/create", async (r) => {
    creates++;
    createBody = r.request().postDataJSON();
    await json(r, 200, { reviewId: 42, state: "PENDING", htmlUrl: "https://github.com/x/pull/1#r42", commitId: "sha", cardIds: (createBody.comments as { cardId: string }[]).map((c) => c.cardId), moved: [] });
  });
  await page.route("**/api/gh/review/submit", async (r) => {
    submits++;
    await new Promise((res) => setTimeout(res, 300));
    await json(r, 200, { state: "COMMENTED", htmlUrl: "https://github.com/x/pull/1#r42", alreadySubmitted: false });
  });
  await open(page);
  await addComment(page, 3, "Why 99?");
  await page.getByTestId("open-publish").click();
  await page.getByRole("button", { name: "Create draft on GitHub" }).click();
  await expect(page.getByTestId("publish-draft")).toContainText("only visible to you");
  expect(createBody).toMatchObject({ ref: { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: 1 } });

  // Drafts are still here while the GitHub review is only a draft.
  await expect(page.getByTestId("draft-count")).toHaveText("1 draft");
  await page.getByRole("button", { name: "Submit: comment" }).click();
  await expect(page.getByTestId("publish-confirm")).toContainText("Everyone with access will see it");
  await page.getByRole("button", { name: "Yes, submit publicly" }).dblclick();
  await expect(page.getByTestId("publish-submitted")).toContainText("Review submitted with 1 comment");
  expect(creates).toBe(1);
  expect(submits).toBe(1);
  await expect(page.getByTestId("draft-count")).toHaveText("0 drafts");
});

test("closing after creating a draft resumes it instead of creating another", async ({ page }) => {
  await signedIn(page);
  let creates = 0;
  await page.route("**/api/gh/review/create", (r) => {
    creates++;
    return json(r, 200, { reviewId: 7, state: "PENDING", htmlUrl: "https://github.com/x#r7", commitId: "sha", cardIds: ["x"], moved: [] });
  });
  await open(page);
  await addComment(page, 3, "a");
  await page.getByTestId("open-publish").click();
  await page.getByRole("button", { name: "Create draft on GitHub" }).click();
  await expect(page.getByTestId("publish-draft")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.reload();
  await expect(page.locator("[data-hydrated]")).toBeVisible();
  await page.getByTestId("open-publish").click();
  await expect(page.getByTestId("publish-draft")).toBeVisible();
  expect(creates).toBe(1);
});

test("no access → install link, and drafts are kept", async ({ page }) => {
  await signedIn(page);
  await page.route("**/api/gh/review/create", (r) =>
    json(r, 403, { code: "no_access", message: "ReviewAloud can't write to this repository.", installUrl: "https://github.com/apps/reviewaloud/installations/new" }),
  );
  await open(page);
  await addComment(page, 3, "keep me");
  await page.getByTestId("open-publish").click();
  await page.getByRole("button", { name: "Create draft on GitHub" }).click();
  await expect(page.getByTestId("publish-error")).toContainText("can't write");
  await expect(page.getByRole("link", { name: /Install the ReviewAloud GitHub App/ })).toHaveAttribute("href", /installations\/new/);
  await expect(page.getByTestId("draft-count")).toHaveText("1 draft");
});

test("session expired → sign-in link in the error", async ({ page }) => {
  await signedIn(page);
  await page.route("**/api/gh/review/create", (r) => json(r, 401, { code: "signed_out", message: "Your GitHub session expired." }));
  await open(page);
  await addComment(page, 3, "x");
  await page.getByTestId("open-publish").click();
  await page.getByRole("button", { name: "Create draft on GitHub" }).click();
  await expect(page.getByTestId("publish-error").getByRole("link", { name: "Sign in with GitHub" })).toBeVisible();
});

test("an existing GitHub draft can be discarded, then publishing proceeds", async ({ page }) => {
  await signedIn(page);
  let n = 0;
  await page.route("**/api/gh/review/create", (r) =>
    n++ === 0
      ? json(r, 409, { code: "pending_exists", message: "exists", reviewId: 9, htmlUrl: "https://github.com/x#r9" })
      : json(r, 200, { reviewId: 10, state: "PENDING", htmlUrl: "https://github.com/x#r10", commitId: "s", cardIds: ["a"], moved: [] }),
  );
  let discarded: unknown = null;
  await page.route("**/api/gh/review/discard", (r) => {
    discarded = r.request().postDataJSON();
    return json(r, 200, { ok: true });
  });
  await open(page);
  await addComment(page, 3, "x");
  await page.getByTestId("open-publish").click();
  await page.getByRole("button", { name: "Create draft on GitHub" }).click();
  await expect(page.getByTestId("publish-pending-exists")).toBeVisible();
  await page.getByRole("button", { name: "Discard that draft" }).click();
  expect(discarded).toMatchObject({ reviewId: 9 });
  await page.getByRole("button", { name: "Create draft on GitHub" }).click();
  await expect(page.getByTestId("publish-draft")).toBeVisible();
});

test("lines moved by new commits are shown, then applied on confirm", async ({ page }) => {
  await signedIn(page);
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/gh/review/create", async (r) => {
    const b = r.request().postDataJSON();
    bodies.push(b);
    const cardId = b.comments[0].cardId;
    const movedAnchor = { ...b.comments[0].anchor, line: 23, commitId: "newsha" };
    return b.confirmMoved
      ? json(r, 200, { reviewId: 3, state: "PENDING", htmlUrl: "u", commitId: "newsha", cardIds: [cardId], moved: [{ cardId, anchor: movedAnchor }] })
      : json(r, 409, { code: "moved", message: "moved", moved: [{ cardId, anchor: movedAnchor }] });
  });
  await open(page);
  await addComment(page, 3, "x");
  await page.getByTestId("open-publish").click();
  await page.getByRole("button", { name: "Create draft on GitHub" }).click();
  await expect(page.getByTestId("publish-moved")).toContainText("R17 → R23");
  await page.getByRole("button", { name: "Publish at new positions" }).click();
  await expect(page.getByTestId("publish-draft")).toBeVisible();
  expect(bodies[1].confirmMoved).toBe(true);
});

test("request changes is disabled on your own pull request", async ({ page }) => {
  await signedIn(page, "priyansh-narang2308");
  await page.route("**/api/gh/review/create", (r) =>
    json(r, 200, { reviewId: 5, state: "PENDING", htmlUrl: "u", commitId: "s", cardIds: ["a"], moved: [] }),
  );
  await open(page);
  await addComment(page, 3, "x");
  await page.getByTestId("open-publish").click();
  await page.getByRole("button", { name: "Create draft on GitHub" }).click();
  await expect(page.getByRole("button", { name: "Submit: request changes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit: comment" })).toBeEnabled();
});
