# Test matrix

Results are recorded only after a run. "—" means not yet run.

## Validation gates

| Gate | Assumption                                                                  | Method                           | Result | Date |
| ---- | --------------------------------------------------------------------------- | -------------------------------- | ------ | ---- |
| G1   | Wispr inserts into our textarea; anchor persists                            | 10 manual dictations in the real workspace (`/pr/…/reviewaloud-sandbox/1`) | — (awaiting user run) |      |
| G2   | GitHub accepts our anchors (add, del/LEFT, ctx, range, 2nd hunk, last line) | Task 5 live script, sandbox only | **PASS** 6/6 | 2026-10-19 |
| G3   | Pending → submit works with GitHub App user token                           | Task 5 + Task 17                 | **PASS** (user signed in via App, created + submitted review 5575243889; comment on auth.ts LEFT 12 with "**Blocking:**") | 2026-10-19 |
| G4   | Ledger flags a planted unresolved item without trusting agent summary       | Task 25, 4 cases                 | —      |      |

## Automated suites

| Area       | Type | Location            | Last result |
| ---------- | ---- | ------------------- | ----------- |
| Env schema | unit | `lib/env.test.ts`   | 7/7 pass |
| GitHub client + PR | unit (recorded responses) | `lib/github/github.test.ts` | 16/16 pass |
| Diff parser | unit | `lib/diff/parse.test.ts` | 18/18 pass |
| Anchors | unit | `lib/diff/anchors.test.ts` | 20/20 pass |
| PR URL parser | unit | `lib/github/url.test.ts` | 14/14 pass |
| Selection | unit | `lib/workspace/selection.test.ts` | 4/4 pass |
| Review store | unit | `lib/store/review-store.test.ts` | 10/10 pass |
| Pin & Speak | e2e (simulated paste) | `e2e/pin-and-speak.spec.ts` | 5/5 pass |
| AI client + tidy guards + limiter | unit | `lib/ai/ai.test.ts` | 12/12 pass |
| Cards, move, shortcuts, tidy API | e2e | `e2e/cards.spec.ts` | 10/10 pass |
| Publish planner, session helpers, review API | unit | `lib/publish/publish.test.ts` | 8/8 pass |
| Publish dialog flows (API mocked) | e2e | `e2e/publish.spec.ts` | 8/8 pass |
| Publish routes vs real GitHub | live script | `scripts/live-routes-check.ts` | 15/15 pass |
| Workspace + landing | e2e (live sandbox PR) | `e2e/workspace.spec.ts` | 9/9 pass |
| Smoke      | e2e  | `e2e/smoke.spec.ts` | 1/1 pass |
| Capture spike | e2e | `e2e/capture-spike.spec.ts` | 2/2 pass |

## Ledger evaluation (Task 38)

Not run yet. Will report confusion matrix and false-addressed rate exactly as measured.

## Run log
- 2026-10-19 · `pnpm test` → 6/6 passed (env schema) · `pnpm typecheck` clean · `pnpm lint` clean · `pnpm build` OK · `pnpm test:e2e` → 1/1 passed (smoke) · `.env.local` git-ignored, `.env.example` tracked.
- 2026-10-19 · Sandbox PR created: https://github.com/priyansh-narang2308/reviewaloud-sandbox/pull/1 (cart.ts hunks `@@ -14,10 +14,15 @@` and `@@ -55,8 +60,11 @@`).
- 2026-10-19 · `e2e/capture-spike.spec.ts` → 2/2 passed (simulated clipboard paste lands as `insertFromPaste`, anchor unchanged; typing fallback labelled). Found and fixed: focusing the textarea before it was enabled silently failed. **Real Wispr run (G1) not yet done.**
- 2026-10-19 · `scripts/live-github-check.ts` on sandbox PR #1: pending review created (PENDING); second pending → 422; pending not visible unauthenticated; submit → COMMENTED; anchors A–F all PASS (RIGHT 17, LEFT 20, RIGHT 23, RIGHT 20–22, RIGHT 69, checkout.ts RIGHT 13); reply → 201. Negatives: N1 outside diff → 422 "Line could not be resolved" (PASS); **N2 cross-hunk range → 200 accepted (assumption was wrong)**; N3 LEFT on context line → 200 accepted. Decision: single-hunk ranges stay as our UI rule (keeps selected lines visible), not a GitHub constraint.
- 2026-10-19 · `pnpm test` → 23/23 (env + GitHub client/PR with recorded sandbox responses). `scripts/smoke-pr-fetch.ts` live, unauthenticated: sandbox#1 OK (4 files), cli/cli#14751 OK (2 files), sandbox#9999 → `not_found` (expected).
- 2026-10-19 · Tasks 7–8: `pnpm test` → 61/61 (parser 18, anchors 20). Anchors produced from parsed real patches equal the six placements GitHub accepted live in Task 5. Typecheck + lint clean.
- 2026-10-19 · Tasks 9–10: `pnpm test` 79/79; `pnpm test:e2e` 12/12 (run with a read token in env). Browser check: sandbox PR renders with GitHub's numbering (auth.ts L12–15 deleted, R12 added); shift-click gives `src/cart.ts R20–R22` (= live-verified range D). Found and fixed: (1) e2e raced hydration → `data-hydrated` marker; (2) form submit before hydration did a native GET → added `/open` no-JS fallback (tested with JS disabled); (3) `next build` failed on uncached `searchParams` with cacheComponents → moved into `<Suspense>`. Observed live: unauthenticated GitHub limit (60/h) exhausted during test runs; rate-limit error state rendered correctly. **Not measured yet:** 5k-line diff scroll performance.
- 2026-10-19 · Tasks 11–12: `pnpm test` 89/89; `pnpm test:e2e` 17/17 (now using `GITHUB_PUBLIC_READ_TOKEN` from `.env.local`). Browser check: click on auth.ts R12 pins it and focuses the capture field.
- 2026-10-19 · Tasks 13–16: `pnpm test` 101/101; `pnpm test:e2e` 27/27. Found and fixed: global Esc handler called preventDefault and blocked native dialog close. Test bug fixed: "AI configured?" now asked from the server (e2e runner env ≠ server env).
- 2026-10-19 · Live tidy (OpenRouter free) on auth.ts R12, dictation-style input with fillers → "The non-null assertion on user.profile will crash if the user has no profile; we should keep the old check." type=blocking. No invented identifiers. Latency observed: ~40 s (first try, fallback model) and 3.2 s server time (second). n=2, not a benchmark.
- 2026-10-19 · Tasks 17–21: `pnpm test` 109/109; `pnpm test:e2e` 35/35; `next build` OK. `scripts/live-routes-check.ts` against the running dev server + sandbox PR (session cookie sealed locally with the gh OAuth token): 15/15 PASS — 401 without session, 403 foreign origin, 403 outside allowlist, 409 stale anchor (no write), 400 empty, create PENDING, 409 pending_exists, discard, placement cart.ts LEFT 20 "**Question:**" and auth.ts RIGHT 12 "**Blocking:**", 422 REQUEST_CHANGES on own PR surfaced, submit COMMENTED, idempotent resubmit, 409 discard after submit. Script bugs found: `/reviews/{id}/comments` omits line/side, and the PR comment list excludes pending comments → placement checked after submit. **Not yet verified:** the GitHub App OAuth sign-in itself and writes with the App's user token (G3).
- 2026-10-19 · User signed in via the GitHub App in Chrome: OAuth round trip worked. Dev overlay showed "Next.js encountered the unstable value `Date.now()` while prerendering" from iron-session in `/pr/...` when a session cookie is present. Reproduced with a locally sealed cookie (error count +2 over 2 requests without fix, +0 with `await connection()`). Build OK, unit 109/109, e2e 35/35.
- 2026-10-19 · G3 by user in Chrome: review 5575243889 COMMENTED via GitHub App user token. Comment landed on `auth.ts` LEFT 12 (the deleted line the user clicked). Finding: "line 12" is ambiguous (deleted L12 vs new R12) → capture panel now spells out "deleted/new/unchanged line N" + shows the pinned code. Also observed: the dictated sentence appeared in Chrome's address bar once → a Wispr insert landed in the wrong focused field (G1 evidence; ask user).
- 2026-10-19 · UI: pointer cursor on all interactive elements (Tailwind preflight resets it), custom Radix type dropdown (keyboard + type-ahead tested). Unit 110/110, e2e 37/37. Observed: first dev load after a server restart took ~29 s to hydrate in the hidden browser pane (dev compile; production timing is Task 36).
