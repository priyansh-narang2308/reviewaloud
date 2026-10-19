# Test matrix

Results are recorded only after a run. "—" means not yet run.

## Validation gates

| Gate | Assumption                                                                  | Method                           | Result | Date |
| ---- | --------------------------------------------------------------------------- | -------------------------------- | ------ | ---- |
| G1   | Wispr inserts into our textarea; anchor persists                            | Task 4, 10 manual dictations     | —      |      |
| G2   | GitHub accepts our anchors (add, del/LEFT, ctx, range, 2nd hunk, last line) | Task 5 live script, sandbox only | **PASS** 6/6 | 2026-10-19 |
| G3   | Pending → submit works with GitHub App user token                           | Task 5 + Task 17                 | Partial: PASS with gh OAuth token; App token pending | 2026-10-19 |
| G4   | Ledger flags a planted unresolved item without trusting agent summary       | Task 25, 4 cases                 | —      |      |

## Automated suites

| Area       | Type | Location            | Last result |
| ---------- | ---- | ------------------- | ----------- |
| Env schema | unit | `lib/env.test.ts`   | see below   |
| Smoke      | e2e  | `e2e/smoke.spec.ts` | see below   |

## Ledger evaluation (Task 38)

Not run yet. Will report confusion matrix and false-addressed rate exactly as measured.

## Run log
- 2026-10-19 · `pnpm test` → 6/6 passed (env schema) · `pnpm typecheck` clean · `pnpm lint` clean · `pnpm build` OK · `pnpm test:e2e` → 1/1 passed (smoke) · `.env.local` git-ignored, `.env.example` tracked.
- 2026-10-19 · Sandbox PR created: https://github.com/priyansh-narang2308/reviewaloud-sandbox/pull/1 (cart.ts hunks `@@ -14,10 +14,15 @@` and `@@ -55,8 +60,11 @@`).
- 2026-10-19 · `e2e/capture-spike.spec.ts` → 2/2 passed (simulated clipboard paste lands as `insertFromPaste`, anchor unchanged; typing fallback labelled). Found and fixed: focusing the textarea before it was enabled silently failed. **Real Wispr run (G1) not yet done.**
- 2026-10-19 · `scripts/live-github-check.ts` on sandbox PR #1: pending review created (PENDING); second pending → 422; pending not visible unauthenticated; submit → COMMENTED; anchors A–F all PASS (RIGHT 17, LEFT 20, RIGHT 23, RIGHT 20–22, RIGHT 69, checkout.ts RIGHT 13); reply → 201. Negatives: N1 outside diff → 422 "Line could not be resolved" (PASS); **N2 cross-hunk range → 200 accepted (assumption was wrong)**; N3 LEFT on context line → 200 accepted. Decision: single-hunk ranges stay as our UI rule (keeps selected lines visible), not a GitHub constraint.
- 2026-10-19 · `pnpm test` → 23/23 (env + GitHub client/PR with recorded sandbox responses). `scripts/smoke-pr-fetch.ts` live, unauthenticated: sandbox#1 OK (4 files), cli/cli#14751 OK (2 files), sandbox#9999 → `not_found` (expected).
