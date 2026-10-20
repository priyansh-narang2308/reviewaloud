// Records REAL app + GitHub footage as crisp 1920x1080 clips via CDP screencast.
// Run from the repo root (uses the root Playwright install):
//   node video/scripts/capture.mjs <shot>
// Shots: ledger (live Promise Ledger run + hand-back reply on sandbox PR #4),
//        github (public GitHub pages for PR #4).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { chromium } from "@playwright/test";
import { sealData } from "iron-session";

const OUT = "video/footage";
const BASE = "http://localhost:3000";
const PR = { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: 4 };
const shot = process.argv[2];

async function sessionCookie() {
  const pw = readFileSync(".env.local", "utf8").match(/^SESSION_SECRET=(.*)$/m)[1];
  const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  const avatarUrl = execFileSync("gh", ["api", "user", "-q", ".avatar_url"], { encoding: "utf8" }).trim();
  const value = await sealData({ token, login: "priyansh-narang2308", avatarUrl }, { password: pw, ttl: 3600 });
  return { name: "ra_session", value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" };
}

/** Screencast recorder: saves JPEG frames with timestamps, then encodes a CFR mp4. */
async function recorder(page, name) {
  const cdp = await page.context().newCDPSession(page);
  const dir = `${OUT}/.frames-${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const i = frames.length;
    writeFileSync(`${dir}/${String(i).padStart(5, "0")}.jpg`, Buffer.from(data, "base64"));
    frames.push(metadata.timestamp);
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return async () => {
    await page.waitForTimeout(400);
    await cdp.send("Page.stopScreencast");
    const end = Date.now() / 1000;
    // concat list with real per-frame durations (screencast only emits on change)
    const lines = [];
    frames.forEach((t, i) => {
      const next = frames[i + 1] ?? end;
      lines.push(`file '${String(i).padStart(5, "0")}.jpg'`, `duration ${Math.max(0.001, next - t).toFixed(4)}`);
    });
    lines.push(`file '${String(frames.length - 1).padStart(5, "0")}.jpg'`);
    writeFileSync(`${dir}/list.txt`, lines.join("\n"));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "slow", `${OUT}/${name}.mp4`]);
    console.log(`${name}.mp4: ${frames.length} frames, ${(end - frames[0]).toFixed(1)} s`);
  };
}

// Visible cursor for screen recordings (headless has none).
const CURSOR = `
  const c = document.createElement('div');
  c.id='__cursor';
  c.style.cssText='position:fixed;z-index:2147483647;width:22px;height:22px;margin:-3px 0 0 -3px;pointer-events:none;transition:transform .08s;left:-50px;top:-50px';
  c.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l15 9.5-6.6 1.4L16 20.5l-2.9 1.3-3.6-7.6L4 18.6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  addEventListener('mousemove', e => { c.style.left=e.clientX+'px'; c.style.top=e.clientY+'px'; }, true);
  addEventListener('mousedown', () => c.style.transform='scale(.85)', true);
  addEventListener('mouseup', () => c.style.transform='', true);
  document.documentElement.appendChild(c);
`;

async function glide(page, locator, { click = true, steps = 28 } = {}) {
  await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > innerHeight - 80) window.scrollBy({ top: r.top - innerHeight * 0.55, behavior: "smooth" });
  });
  await page.waitForTimeout(700);
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  await page.waitForTimeout(250);
  if (click) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25, colorScheme: "dark" });
await ctx.addInitScript(`addEventListener('DOMContentLoaded', () => { ${CURSOR} })`);
const page = await ctx.newPage();

if (shot === "ledger") {
  await ctx.addCookies([await sessionCookie()]);
  // Start clean: no cached verdicts for this PR in this fresh profile.
  await page.goto(`${BASE}/pr/${PR.owner}/${PR.repo}/${PR.number}#ledger`);
  await page.locator("[data-hydrated]").waitFor();
  await page.getByTestId("promise").first().waitFor();
  await page.mouse.move(1300, 200);
  await page.waitForTimeout(800);

  const stop = await recorder(page, "ledger-run");
  await page.waitForTimeout(1200);
  await glide(page, page.getByTestId("check-all"));
  await page.getByText("All checked").waitFor({ timeout: 240_000 });
  await page.waitForTimeout(1500);
  await stop();
  writeFileSync(`${OUT}/ledger-verdicts.json`, JSON.stringify(await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.includes("ledger")))), null, 2));

}

if (shot === "ledger" || shot === "handback") {
  if (shot === "handback") {
    // Reuse the verdicts recorded by the live "ledger" run (no new AI calls).
    await ctx.addCookies([await sessionCookie()]);
    const saved = JSON.parse(readFileSync(`${OUT}/ledger-verdicts.json`, "utf8"));
    const key = `reviewaloud:ledger:v1:${PR.owner}/${PR.repo}#${PR.number}`;
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [key, saved]);
    await page.goto(`${BASE}/pr/${PR.owner}/${PR.repo}/${PR.number}#ledger`);
    await page.locator("[data-hydrated]").waitFor();
    await page.getByText("All checked").waitFor();
  }
  // Evidence + hand-back on the first unresolved request.
  const open = page.getByTestId("promise").filter({ has: page.locator("[data-status='unresolved']") }).first();
  await open.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const stop2 = await recorder(page, "ledger-handback");
  await page.waitForTimeout(1200);
  await glide(page, open.getByTestId("follow-up-toggle"));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollBy({ top: 260, behavior: "smooth" }));
  await page.waitForTimeout(1400);
  await glide(page, open.getByRole("button", { name: "@claude" }));
  await page.waitForTimeout(1600);
  await glide(page, open.getByRole("button", { name: "Reply on GitHub thread" }));
  await open.getByRole("button", { name: "Yes, post reply" }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  await glide(page, open.getByRole("button", { name: "Yes, post reply" }));
  await open.getByTestId("reply-posted").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2200);
  await stop2();
  // Full-page still of the finished ledger, for slow pans.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/ledger-full.png`, fullPage: true });
}

if (shot === "github") {
  const prUrl = `https://github.com/${PR.owner}/${PR.repo}/pull/${PR.number}`;
  await page.goto(prUrl, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/gh-conversation.png`, fullPage: true });
  await page.goto(`${prUrl}/commits`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/gh-commits.png` });
  const sha = execFileSync("gh", ["api", `repos/${PR.owner}/${PR.repo}/pulls/${PR.number}`, "-q", ".head.sha"], { encoding: "utf8" }).trim();
  await page.goto(`https://github.com/${PR.owner}/${PR.repo}/commit/${sha}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/gh-agent-commit.png` });
  console.log("github stills saved");
}

await browser.close();
