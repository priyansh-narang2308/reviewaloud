// Gate G4 live check: run the real Promise Ledger routes on sandbox PR #2 and
// compare each verdict to the planted ground truth in that PR's description.
// Uses a locally sealed session (gh CLI token). Spends ~1 AI call per comment.
//   pnpm tsx scripts/live-ledger-check.ts   (dev server on :3000)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { sealData } from "iron-session";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ref = { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: Number(process.env.PR ?? 2) };
// Ground truth for PR #2, in comment order (labelled in the PR description).
const EXPECTED = ["addressed", "unresolved", "reply_needed", "addressed", "unresolved"];

const pw = readFileSync(".env.local", "utf8").match(/^SESSION_SECRET=(.*)$/m)![1];
const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();

async function main() {
  const cookie = `ra_session=${await sealData({ token, login: "ledger-check" }, { password: pw, ttl: 3600 })}`;
  const list = await (await fetch(`${BASE}/api/ledger/list?owner=${ref.owner}&repo=${ref.repo}&number=${ref.number}`, { headers: { Cookie: cookie } })).json();
  console.log(`head ${list.headSha.slice(0, 7)} · ${list.items.length} promises`);
  let correct = 0;
  let falseAddressed = 0;
  const only = process.env.ONLY ? Number(process.env.ONLY) - 1 : null;
  for (const [i, p] of (list.items as { commentId: number; body: string }[]).entries()) {
    if (only !== null && i !== only) continue;
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/ledger/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ ref, commentId: p.commentId }),
    });
    const v = await res.json();
    const expected = EXPECTED[i];
    const ok = v.status === expected;
    if (ok) correct++;
    if (v.status === "addressed" && expected !== "addressed") falseAddressed++;
    console.log(`\n${ok ? "PASS" : "MISS"} #${i + 1} expected=${expected} got=${v.status ?? `HTTP ${res.status} ${v.message}`} · ${v.decidedBy ?? ""} ${v.model ?? ""} · ${Date.now() - t0}ms`);
    console.log(`  request: ${p.body.slice(0, 90)}`);
    if (v.rationale) console.log(`  why: ${v.rationale}`);
    if (v.whatIsMissing) console.log(`  missing: ${v.whatIsMissing}`);
    for (const e of v.evidence ?? []) console.log(`  evidence ${e.supports ? "+" : "−"} ${e.kind} ${e.path ?? ""}:${e.startLine ?? e.replyId ?? ""} "${String(e.quote).slice(0, 70)}"`);
    if (v.droppedEvidence) console.log(`  dropped ${v.droppedEvidence} unverifiable evidence item(s)`);
  }
  console.log(`\n${correct}/${only !== null ? 1 : EXPECTED.length} match ground truth · false-addressed: ${falseAddressed}`);
}

main().catch((e) => {
  console.error("ledger check crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
