// Task 5 (gates G2/G3): live check that GitHub accepts our anchors and that the
// pending → submit review lifecycle behaves as documented.
// Writes ONLY to the sandbox repo. Uses the local `gh` login token; never prints it.
//   pnpm tsx scripts/live-github-check.ts
import { execFileSync } from "node:child_process";

const OWNER = "priyansh-narang2308";
const REPO = "reviewaloud-sandbox";
const PR = 1;
const API = "https://api.github.com";
const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();

type Side = "LEFT" | "RIGHT";
type Anchor = { path: string; side: Side; line: number; start_line?: number; start_side?: Side };
type Case = { id: string; what: string; anchor: Anchor; expect: "accept" | "reject" | "explore" };

// Anchors derived by hand from sandbox PR #1's diff (hunks @@ -14,10 +14,15 @@ and @@ -55,8 +60,11 @@).
const positive: Case[] = [
  { id: "A", what: "added line", anchor: { path: "src/cart.ts", side: "RIGHT", line: 17 }, expect: "accept" },
  { id: "B", what: "deleted line (LEFT)", anchor: { path: "src/cart.ts", side: "LEFT", line: 20 }, expect: "accept" },
  { id: "C", what: "unchanged context line", anchor: { path: "src/cart.ts", side: "RIGHT", line: 23 }, expect: "accept" },
  { id: "D", what: "multi-line range in one hunk", anchor: { path: "src/cart.ts", side: "RIGHT", line: 22, start_line: 20, start_side: "RIGHT" }, expect: "accept" },
  { id: "E", what: "second hunk", anchor: { path: "src/cart.ts", side: "RIGHT", line: 69 }, expect: "accept" },
  { id: "F", what: "last line of new file", anchor: { path: "src/checkout.ts", side: "RIGHT", line: 13 }, expect: "accept" },
];
const negative: Case[] = [
  { id: "N1", what: "line outside the diff", anchor: { path: "src/cart.ts", side: "RIGHT", line: 2 }, expect: "reject" },
  { id: "N2", what: "range across two hunks", anchor: { path: "src/cart.ts", side: "RIGHT", line: 63, start_line: 25, start_side: "RIGHT" }, expect: "reject" },
  { id: "N3", what: "context line on LEFT side", anchor: { path: "src/cart.ts", side: "LEFT", line: 17 }, expect: "explore" },
];

async function gh(method: string, path: string, body?: unknown, auth = true) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const base = `/repos/${OWNER}/${REPO}/pulls/${PR}`;
const results: string[] = [];
const log = (s: string) => {
  console.log(s);
  results.push(s);
};

async function deletePendingIfAny() {
  const { json } = await gh("GET", `${base}/reviews?per_page=100`);
  for (const r of json as { id: number; state: string }[]) {
    if (r.state === "PENDING") await gh("DELETE", `${base}/reviews/${r.id}`);
  }
}

function sameAnchor(c: Record<string, unknown>, a: Anchor) {
  return (
    c.path === a.path &&
    c.line === a.line &&
    c.side === a.side &&
    (a.start_line === undefined || (c.start_line === a.start_line && c.start_side === a.start_side))
  );
}

async function main() {
  const pr = await gh("GET", base);
  const headSha: string = pr.json.head.sha;
  log(`PR #${PR} head ${headSha.slice(0, 7)}`);
  await deletePendingIfAny();

  // 1. Pending review with all positive anchors.
  const created = await gh("POST", `${base}/reviews`, {
    commit_id: headSha,
    body: "[ReviewAloud live check] Automated test review on a sandbox fixture.",
    comments: positive.map((c) => ({ ...c.anchor, body: `[${c.id}] ${c.what}` })),
  });
  log(`create pending review → HTTP ${created.status}, state=${created.json?.state}`);
  if (created.status !== 200) {
    log(`  error: ${JSON.stringify(created.json)}`);
    return;
  }
  const reviewId: number = created.json.id;

  // 2. Second pending review while one exists (expect rejection).
  const dup = await gh("POST", `${base}/reviews`, { commit_id: headSha, comments: [{ ...positive[0].anchor, body: "dup" }] });
  log(`second pending review while one exists → HTTP ${dup.status}`);

  // 3. Pending review must be invisible to others (unauthenticated read).
  const anon = await gh("GET", `${base}/reviews?per_page=100`, undefined, false);
  const visible = (anon.json as { id: number }[]).some((r) => r.id === reviewId);
  log(`pending review visible without auth → ${visible ? "YES (unexpected)" : "no (as documented)"}`);

  // 4. Submit.
  const submitted = await gh("POST", `${base}/reviews/${reviewId}/events`, { event: "COMMENT" });
  log(`submit COMMENT → HTTP ${submitted.status}, state=${submitted.json?.state}`);

  // 5. Verify each comment landed where intended.
  const comments = await gh("GET", `${base}/reviews/${reviewId}/comments?per_page=100`);
  const all = await gh("GET", `${base}/comments?per_page=100`);
  for (const c of positive) {
    const match = (all.json as Record<string, unknown>[]).find(
      (x) => x.pull_request_review_id === reviewId && String(x.body).startsWith(`[${c.id}]`),
    );
    const ok = !!match && sameAnchor(match, c.anchor);
    log(`  ${ok ? "PASS" : "FAIL"} ${c.id} ${c.what}${match ? ` → ${match.side} ${match.start_line ? `${match.start_line}-` : ""}${match.line}` : " → not found"}`);
  }
  log(`  review comments returned: ${(comments.json as unknown[]).length}`);

  // 6. Reply to one comment.
  const first = (all.json as { id: number; body: string; pull_request_review_id: number }[]).find(
    (x) => x.pull_request_review_id === reviewId && x.body.startsWith("[A]"),
  );
  if (first) {
    const reply = await gh("POST", `${base}/comments/${first.id}/replies`, { body: "[ReviewAloud live check] reply test" });
    log(`reply to comment → HTTP ${reply.status}, in_reply_to_id=${reply.json?.in_reply_to_id === first.id}`);
  }

  // 7. Negative / exploratory anchors, one pending review each, cleaned up after.
  for (const c of negative) {
    const r = await gh("POST", `${base}/reviews`, { commit_id: headSha, comments: [{ ...c.anchor, body: `[${c.id}] ${c.what}` }] });
    const accepted = r.status === 200;
    const verdict = c.expect === "explore" ? "INFO" : (c.expect === "reject") !== accepted ? "PASS" : "FAIL";
    const reason = accepted ? "accepted" : (r.json?.errors ?? [r.json?.message]).map((e: unknown) => (typeof e === "string" ? e : JSON.stringify(e))).join("; ");
    log(`  ${verdict} ${c.id} ${c.what} → HTTP ${r.status} (${reason})`);
    if (accepted) await gh("DELETE", `${base}/reviews/${r.json.id}`);
  }
}

main().catch((e) => {
  console.error("live check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
