// Records the public demo's data from REAL sources (Task 34):
//   - sandbox PR #2 metadata + file patches (GitHub API)
//   - its review requests (ReviewAloud /api/ledger/list)
//   - one live Promise Ledger run (ReviewAloud /api/ledger/verify → OpenRouter)
// The demo replays these and labels them as recorded. Nothing is invented.
//   pnpm tsx scripts/snapshot-demo.ts   (dev server on :3000; spends ~5 AI calls)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sealData } from "iron-session";
import { createGitHubClient } from "../lib/github/client";
import { getPullRequest, listPullRequestFiles } from "../lib/github/pr";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ref = { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: 2 };
const OUT = "fixtures/demo/sandbox-pr-2.json";

const pw = readFileSync(".env.local", "utf8").match(/^SESSION_SECRET=(.*)$/m)![1];
const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();

async function main() {
  const gh = createGitHubClient({ token });
  const [pr, { files }] = await Promise.all([getPullRequest(gh, ref), listPullRequestFiles(gh, ref)]);
  const cookie = `ra_session=${await sealData({ token, login: "demo-recorder" }, { password: pw, ttl: 3600 })}`;
  const list = await (await fetch(`${BASE}/api/ledger/list?owner=${ref.owner}&repo=${ref.repo}&number=${ref.number}`, { headers: { Cookie: cookie } })).json();
  if (!Array.isArray(list.items)) throw new Error(`list failed: ${JSON.stringify(list)}`);

  const verdicts: Record<number, unknown> = {};
  for (const p of list.items as { commentId: number }[]) {
    const res = await fetch(`${BASE}/api/ledger/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ ref, commentId: p.commentId }),
    });
    const v = await res.json();
    if (!res.ok) throw new Error(`verify ${p.commentId} failed: ${v.message}`);
    verdicts[p.commentId] = v;
    console.log(`${p.commentId}: ${v.status} (${v.decidedBy} ${v.model ?? ""})`);
  }

  mkdirSync("fixtures/demo", { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        source: pr.htmlUrl,
        note: "Snapshot of a public sandbox PR with planted test cases. Verdicts are the recorded output of one live Promise Ledger run.",
        ref,
        pr,
        files,
        ledger: { headSha: list.headSha, prAuthor: list.prAuthor, reviewers: list.reviewers, items: list.items },
        verdicts,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error("snapshot failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
