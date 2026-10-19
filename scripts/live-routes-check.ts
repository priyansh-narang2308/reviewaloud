// Tasks 17–21 live check: exercises the REAL publish API routes of a running
// dev server against the sandbox PR, using a locally sealed session cookie
// that carries the `gh` CLI token (OAuth token, not the GitHub App token; the
// App sign-in itself is verified manually). Prints no secrets.
//   pnpm tsx scripts/live-routes-check.ts   (dev server on :3000)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { sealData } from "iron-session";
import { anchorForLine } from "../lib/diff/anchors";
import { parsePatch } from "../lib/diff/parse";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ref = { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: 1 };
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2]]),
);
const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
const login = execFileSync("gh", ["api", "user", "-q", ".login"], { encoding: "utf8" }).trim();

let cookie = "";
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` · ${detail}` : ""}`);
};

async function call(path: string, body: unknown, opts: { origin?: string; withCookie?: boolean } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: opts.origin ?? BASE,
      ...(opts.withCookie === false ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function main() {
  cookie = `ra_session=${await sealData({ token, login }, { password: env.SESSION_SECRET, ttl: 3600 })}`;

  // Build cards exactly as the UI would, from the live diff.
  const files = (await (await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json()) as { filename: string; patch?: string }[];
  const pr = (await (await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json()) as { head: { sha: string } };
  const cart = parsePatch(files.find((f) => f.filename === "src/cart.ts")!.patch);
  const auth = parsePatch(files.find((f) => f.filename === "src/auth.ts")!.patch);
  const c1 = { cardId: "c1", anchor: anchorForLine("src/cart.ts", pr.head.sha, cart.lines[11]), body: "[ReviewAloud live routes check] Why drop +=?", type: "question" };
  const c2 = { cardId: "c2", anchor: anchorForLine("src/auth.ts", pr.head.sha, auth.lines[7]), body: "[ReviewAloud live routes check] Non-null assertion crashes without a profile.", type: "blocking" };

  // Guards (no writes happen).
  let r = await call("/api/gh/review/create", { ref, comments: [c1] }, { withCookie: false });
  check(r.status === 401 && r.json.code === "signed_out", "no session → 401 signed_out");
  r = await call("/api/gh/review/create", { ref, comments: [c1] }, { origin: "https://evil.example" });
  check(r.status === 403 && r.json.code === "cross_origin", "foreign Origin → 403");
  r = await call("/api/gh/review/create", { ref: { owner: "cli", repo: "cli", number: 1 }, comments: [c1] });
  check(r.status === 403 && r.json.code === "not_allowlisted", "repo outside allowlist → 403 not_allowlisted");
  r = await call("/api/gh/review/create", { ref, comments: [{ ...c1, anchor: { ...c1.anchor, lineText: "something else" } }] });
  check(r.status === 409 && r.json.code === "outdated", "stale anchor → 409 outdated, nothing written");
  r = await call("/api/gh/review/create", { ref, comments: [] });
  check(r.status === 400, "empty comment list → 400");

  // Create → duplicate → discard.
  r = await call("/api/gh/review/create", { ref, comments: [c1, c2], summary: "[ReviewAloud live routes check]" });
  check(r.status === 200 && r.json.state === "PENDING", "create → 200 PENDING", `cards=${JSON.stringify(r.json.cardIds)}`);
  const first = r.json.reviewId as number;
  r = await call("/api/gh/review/create", { ref, comments: [c1] });
  check(r.status === 409 && r.json.code === "pending_exists" && r.json.reviewId === first, "second create → 409 pending_exists (same id)");
  r = await call("/api/gh/review/discard", { ref, reviewId: first });
  check(r.status === 200, "discard pending → 200");

  // Create → verify placement → REQUEST_CHANGES on own PR → submit COMMENT → submit again.
  r = await call("/api/gh/review/create", { ref, comments: [c1, c2] });
  const id = r.json.reviewId as number;
  check(r.status === 200, "create again → 200");
  r = await call("/api/gh/review/submit", { ref, reviewId: id, event: "REQUEST_CHANGES" });
  check(r.status === 422 && r.json.code === "github_rejected", "REQUEST_CHANGES on own PR → 422 surfaced", String(r.json.message).slice(0, 90));
  r = await call("/api/gh/review/submit", { ref, reviewId: id, event: "COMMENT" });
  check(r.status === 200 && r.json.state === "COMMENTED" && r.json.alreadySubmitted === false, "submit COMMENT → 200 COMMENTED");
  // Checked after submit: the PR comments list excludes pending-review comments,
  // and /reviews/{id}/comments omits line/side.
  const placed = (JSON.parse(execFileSync("gh", ["api", `repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/comments?per_page=100`], { encoding: "utf8" })) as { path: string; line: number; side: string; body: string; pull_request_review_id: number }[]).filter((c) => c.pull_request_review_id === id);
  const p1 = placed.find((c) => c.path === "src/cart.ts");
  const p2 = placed.find((c) => c.path === "src/auth.ts");
  check(p1?.side === "LEFT" && p1?.line === 20 && p1.body.startsWith("**Question:**"), "c1 placed on cart.ts LEFT 20 with type prefix", `${p1?.side} ${p1?.line}`);
  check(p2?.side === "RIGHT" && p2?.line === 12 && p2.body.startsWith("**Blocking:**"), "c2 placed on auth.ts RIGHT 12 with type prefix", `${p2?.side} ${p2?.line}`);

  r = await call("/api/gh/review/submit", { ref, reviewId: id, event: "COMMENT" });
  check(r.status === 200 && r.json.alreadySubmitted === true, "submit again → idempotent alreadySubmitted");
  r = await call("/api/gh/review/discard", { ref, reviewId: id });
  check(r.status === 409, "discard after submit → 409 refused");

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("live routes check crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
