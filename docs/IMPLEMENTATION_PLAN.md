# ReviewAloud — Implementation Plan (v1)

> **Change 2026-10-19:** AI provider switched from Anthropic to **OpenRouter free models** (no paid API). Free tier: 20 req/min, 50 req/day ([limits](https://openrouter.ai/docs/api/reference/limits)). Default model `nvidia/nemotron-3.5-super-vl:free`, fallbacks `nvidia/nemotron-3-super-120b-a12b:free`, `dots-studio/dots-3-note-preview:free` (all support structured outputs, checked 2026-10-19). Consequences: classification + verification merged into **one call per comment**; verdicts cached per (comment, head SHA); deterministic short-circuits before any call; configurable model + fallback chain; public demo uses recorded live output so judges don't consume quota.

## Context

Hackathon build for WeMakeDevs × Wispr Flow "No Hands" (Builders track). Deadline **Fri 30 Oct 2026, 11:59 pm IST**. Rubric: real problem 30 / meaningful Wispr 30 / works via live link 25 / 2-min demo 15.
Product: voice-first GitHub PR review → real GitHub review → evidence-backed check of whether later commits addressed each human comment → reviewer-controlled follow-up.
**Repo state: empty directory — starting from scratch.** Tooling present: Node 26.5, pnpm 11.8, gh 2.100 (logged in as `priyansh-pipelineai`; user will switch to **personal account** before setup), Vercel CLI 48. User has an **Anthropic API key** (will place in `.env.local` themselves).

Not claimed as novel: dictation, inline comments, comment-resolution checking (prior art: DataHub comment-resolution-checker, Copilot auto-resolve of its own comments, arXiv 2508.18771). Differentiation = the integrated, reviewer-owned, voice-first loop for **human** comments.

## Verified facts the design depends on

- **Wispr Flow** (docs.wisprflow.ai "Starting your first dictation"): text is inserted into the **focused field after releasing the shortcut**, via a brief **clipboard paste**; no public SDK/API/streaming found. ⇒ Browser sees a `paste`/`input` event with `inputType="insertFromPaste"`. We can honestly show "Text received" — we **cannot** observe "listening". Moving focus before insertion misdirects text.
- **GitHub review comments** (REST docs): `path`, `body`, `commit_id`, `line`, `side` (LEFT = deletions, RIGHT = additions/context), `start_line`/`start_side` for ranges, `subject_type`. Reply: `POST /pulls/{n}/comments/{id}/replies` (top-level comment only).
- **Reviews**: `POST /pulls/{n}/reviews` without `event` ⇒ PENDING (visible only to author); submit via `POST /reviews/{id}/events`. One pending review per user per PR (expect 422 if one exists).
- **To verify during Task 1–5** (UNVERIFIED now): exact GitHub App permission names per endpoint; GraphQL `reviewThreads { isResolved isOutdated }` availability to GitHub App user tokens; Vercel Hobby function duration limit; multi-line ranges must lie within one hunk.

## Architecture (simplest reliable)

- **Next.js (current stable, App Router) + TypeScript strict + Tailwind v4**, pnpm. No component library; small own primitives + Radix only where a11y is hard (Dialog, Tooltip). **Shiki** (fine-grained, ~10 langs) for highlighting. **Zod** at every boundary. **Vitest** (unit/contract with recorded fixtures via MSW), **Playwright + axe** (e2e/a11y).
- **No database.** Drafts + overrides in `localStorage` keyed `owner/repo#pr@headSha`; session in encrypted httpOnly cookie (`iron-session`). Justification: single-user flows, no cross-device need within deadline.
- **Auth: GitHub App with user access tokens** (fine-grained, user must install app on repo). Permissions: Pull requests R/W, Contents R, Checks R, Commit statuses R, Metadata R. Unauthenticated public reads use server-side `GITHUB_PUBLIC_READ_TOKEN` (fine-grained, public-only, read-only) to avoid the 60 req/h shared-IP limit.
- **AI: Anthropic SDK, server-only.** Haiku (`claude-haiku-5-5`) for intent classification + optional wording tidy; Sonnet (`claude-sonnet-5-5`) for ledger verification. Tool/JSON-schema output → Zod validate → 1 repair retry → else "Needs human verification".
- **Hosting: Vercel Hobby.** Ledger runs **one request per comment** (parallel from client) to stay within function limits and stream results progressively.

```
app/
  page.tsx                 landing
  demo/                    no-login interactive demo (fixtures)
  pr/[owner]/[repo]/[n]/   workspace: files | diff | capture | review | ledger tabs
  api/auth/{login,callback,logout}
  api/gh/pr, api/gh/review (create|submit), api/gh/reply
  api/ledger/item          verify one comment
  api/ai/tidy
lib/
  diff/ (parse.ts, anchors.ts)      pure, heavily unit-tested
  github/ (client.ts, pr.ts, reviews.ts, threads.ts, compare.ts, checks.ts)
  ledger/ (gather.ts, signals.ts, prompt.ts, schema.ts, validate.ts, rules.ts)
  ai/ (anthropic.ts, budget.ts)
  store/ (review-store.ts — useSyncExternalStore + localStorage)
components/ diff/, capture/, cards/, ledger/, ui/
fixtures/ demo-pr/, eval/        eval/ = 20 labelled scenarios
scripts/ eval-ledger.ts, live-github-check.ts, snapshot-demo.ts
docs/ IMPLEMENTATION_PLAN.md TASKS.md ARCHITECTURE.md TEST_MATRIX.md
```

## Key designs

**Diff/anchors.** Parse each file's `patch` from `GET /pulls/{n}/files` (paginate, ≤3000 files). Per line: `{kind: add|del|ctx, oldNo, newNo, hunkIdx}`. Anchor = `{path, side: del→LEFT else RIGHT, line: LEFT?oldNo:newNo, startLine?, startSide?, commitId: headSha}`. Ranges allowed only within one hunk (our UI rule; GitHub itself accepted a cross-hunk range in the Task 5 live check). Missing `patch` (binary/too large) ⇒ file-level comment or "view on GitHub". Before publish: re-fetch head SHA; if moved, re-validate every anchor against new diff, flag outdated ones.

**Pin & Speak.** Click line (shift-click = range, `j/k` line nav, `[ ]` file nav, `c` focus capture). Selecting stores anchor in state **then** focuses the capture textarea; focus never mutates the anchor. States shown: _No anchor_ → _Anchor set · dictate or type_ → _Text received_ (on `insertFromPaste`) → _Saved_. `⌘↵` saves card, `Esc` cancels. Multiline preserved. Same textarea is the typing fallback. Cards: edit, delete, re-anchor, type (blocking/suggestion/question/nit/praise, user-set; AI may propose).

**AI tidy (optional, per card).** Shows original vs proposed side by side; user must accept. Prompt forbids adding facts; post-check rejects outputs introducing code identifiers absent from original text + anchor context.

**Publish lifecycle.** Preview list → validate anchors → `Create draft (pending) review` → shows "Draft — only you can see this on GitHub" + link → separate `Submit as COMMENT | REQUEST_CHANGES` with confirm dialog. No APPROVE in MVP. Idempotency: stored `reviewId`, button lock, detect existing pending review (offer submit/discard). Optional `WRITE_REPO_ALLOWLIST` env enforced server-side (set to sandbox repo during development).

**Promise Ledger (per human top-level comment by the reviewer).**

1. _Gather (deterministic):_ comment (`original_commit_id`, `path`, `original_line`, `diff_hunk`), thread replies, thread `isResolved/isOutdated`, `compare(original_commit_id...head)`, head file content ±25 lines around mapped anchor + changed hunks in other files (capped), head check runs.
2. _Signals:_ anchorRegionChanged, otherFilesChanged, authorReplied, ciConclusion, commitsAfterComment.
3. _Deterministic short-circuits (no AI, saves tokens):_ no commits after comment & no reply ⇒ **Unresolved** (or **Reply needed** if question).
4. _Classify intent_ (Haiku): change_request | question | discussion | nit | info.
5. _Verify_ (Sonnet) with repo content in delimited `<untrusted_code>` blocks, instruction to treat as data; output `{status, rationale, evidence:[{path,startLine,endLine,quote,supports}], whatIsMissing}`.
6. _Post-validate:_ every evidence `quote` must match head file text at cited lines (else dropped); **Addressed requires ≥1 verified supporting quote and no verified contradicting quote**, otherwise downgrade to Needs human verification. CI shown as context only — never upgrades a verdict. No confidence percentages.
7. _Reviewer override_ stored locally; never auto-resolve threads.
   Consent: before first AI call on a **private** repo, explicit dialog naming what is sent to Anthropic.

**Follow-up.** For Unresolved: original request + reason + evidence → editable instruction ("In `path:line`, … because …"), Copy for Claude Code, or "Reply on GitHub thread" after confirm; "Re-check" after new commits.

**Public demo (no login, no keys).** Fixtures snapshotted from a **real sandbox PR** (`scripts/snapshot-demo.ts`). Judges select real displayed lines, dictate/type, create cards, preview review. Publishing shows "Simulated in demo — nothing sent to GitHub". Ledger shows **recorded output of a real live run** labelled with date + model; never presented as live. Banner throughout: "Demo mode · sample data".

**Security.** Secrets only in `.env.local` (git-ignored) / Vercel env; `.env.example` committed. Tokens server-side only; CSRF via SameSite=Lax + origin check on POSTs; Zod on all inputs; per-session daily AI call cap (signed cookie) + in-memory per-IP limiter (documented as best-effort on serverless) + Anthropic console spend limit (user action); render all model/repo text as plain text (no `dangerouslySetInnerHTML`); private PR data never cached server-side; demo and authed routes separated.

**Costs.** Context caps (~6k input tokens/item target), Haiku for cheap steps, deterministic short-circuits, per-item calls only on user click. Estimated spend for dev + eval: a few USD (estimate, not measured).

## Validation gate (before dependent work)

| #   | Assumption                                                              | Test                          | Fail ⇒                                                            |
| --- | ----------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| G1  | Wispr pastes into our textarea while anchor persists                    | Task 4 (user dictates 10×)    | add explicit "anchor lock" + Paste-Last-Text guidance             |
| G2  | Our line mapping is accepted by GitHub for add/del/ctx/range/multi-hunk | Task 5 live script on sandbox | fix mapper before Phase C                                         |
| G3  | Pending → submit lifecycle works with GitHub App user token             | Task 5                        | fall back to OAuth App `public_repo` scope (documented)           |
| G4  | Ledger catches a planted unresolved item without trusting agent summary | Task 25 spike on 4 cases      | narrow ledger to deterministic signals + Needs human verification |

## Milestones

- **V1 vertical slice (Speak → Anchor → Publish on real PR): end of Fri 24 Oct.**
- **V2 full loop (… → Verify → Follow-up): end of Mon 26 Oct** (also Week-1 check-in day).
- Feature freeze Wed 28 Oct evening. Thu 29 = demo production. Fri 30 = deploy verification + submit by ~8 pm IST.

## External setup / credentials (user actions; never pasted into chat)

1. `gh auth login` with **personal** account.
2. Approve me creating public repo `<you>/reviewaloud` (app) and `<you>/reviewaloud-sandbox` (test PRs). (External write — needs your OK.)
3. Create GitHub App (I'll give exact settings): callback `http://localhost:3000/api/auth/callback` + Vercel URL; permissions above. Env: `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`.
4. Fine-grained PAT, public repos read-only → `GITHUB_PUBLIC_READ_TOKEN`.
5. `ANTHROPIC_API_KEY` + set a monthly spend limit in the Anthropic console.
6. `SESSION_SECRET` — I generate locally into `.env.local` (never printed).
7. Vercel login/link (Task 39).
8. You: first Wispr Flow = problem statement; dictate prompts; weekly usage card (26 Oct, final).

## 40 tasks

Format: **ID · Title · Priority · Effort · Deps** — Objective / Files / Steps / Acceptance (= Definition of Done) / Test. Every task's DoD also includes: tests pass, `pnpm typecheck && pnpm lint` clean, TASKS.md updated with status + known limitation.

### Phase A — Foundation & validation (19–20 Oct)

**1 · Scaffold repo · P0 · 1h · —** — Next.js+TS strict+Tailwind+pnpm, ESLint, Prettier, Vitest, Playwright, `.gitignore` incl `.env*.local`, `.env.example`, docs/ four files. / Steps: create-next-app, add deps, scripts `dev test test:e2e typecheck lint eval`. / Accept: `pnpm dev` serves page; `pnpm test` runs 1 sample test; no secret files tracked. / Test: run scripts; `git check-ignore .env.local`.
**2 · Architecture docs + env schema · P0 · 45m · 1** — `lib/env.ts` Zod-validated server env (fails fast with variable name), ARCHITECTURE.md from this plan. / Accept: missing var error names exact key; client bundle contains no server env. / Test: unit test env parser; grep `.next/static` for key names.
**3 · Sandbox + GitHub App setup · P0 · 1h · 1 (user)** — create repos (after approval), seed sandbox with a small TS project and PR #1 containing adds/dels/context across 3 files, 2 hunks in one file; write GitHub App settings doc. / Accept: PR #1 exists; app installed on sandbox; env keys present locally (verified by env.ts, values unseen). / Test: `gh pr view`; `pnpm env:check`.
**4 · Wispr capture spike · P0 · 1h · 1 (user dictates)** — `/spike/capture`: fake diff, click line → anchor shown → textarea focused; logs `paste`/`input.inputType`, timestamps. / Accept: in 10 dictations, 10 inserts land in textarea with anchor unchanged; multiline preserved; record observed inputType. Result written to TEST_MATRIX (G1). / Test: manual with Wispr + Playwright test simulating paste.
**5 · GitHub write spike · P0 · 1.5h · 3** — `scripts/live-github-check.ts` (uses gh token, sandbox only): map 6 anchors (add, del/LEFT, ctx, range, 2nd hunk, last line), create pending review, verify invisible-until-submit state via API, submit COMMENT, reply to one comment; then test same via GitHub App user token once Task 17 exists (G3 marked partial until then). / Accept: all 6 comments land on intended lines (checked via API `line/side` + visual); records 422 cases. / Test: run script; screenshot in docs.

### Phase B — GitHub & diff engine (21–22 Oct)

**6 · GitHub client + PR fetch · P0 · 2h · 2** — `lib/github/client.ts` (fetch wrapper: auth/public token, ETag, pagination, rate-limit headers → typed errors), `pr.ts` (metadata, files paginated, head/base SHA). / Accept: fetches sandbox PR + a public OSS PR; typed errors for 401/403/404/rate-limit. / Test: MSW contract tests with recorded responses; live smoke.
**7 · Unified diff parser · P0 · 2h · 1** — `lib/diff/parse.ts` pure. / Accept: correct old/new numbers for multi-hunk, `\ No newline at end of file`, added/deleted/renamed files, missing patch. / Test: ≥15 Vitest cases incl. real GitHub patches.
**8 · Anchor mapper + validator · P0 · 1.5h · 7** — `anchors.ts`: line→anchor, range rules (same hunk, start<end), validate anchor against diff, re-map on head change. / Accept: matches Task 5 live results for all 6 cases; invalid/outdated anchors rejected with reason. / Test: unit tests incl. LEFT/RIGHT, cross-hunk rejection, outdated.
**9 · Diff viewer · P0 · 3h · 7,8** — unified view (split view P2), Shiki highlighting lazily per file, line gutter selection (click/shift-click), virtualized long files (>1500 lines collapse). / Accept: renders sandbox PR identical numbers to GitHub; selection emits anchor; 5k-line diff scrolls smoothly. / Test: Playwright selects line, asserts anchor; visual check vs GitHub.
**10 · Workspace shell + file nav · P0 · 2h · 6,9** — route `pr/[owner]/[repo]/[n]`, PR URL input + parser on landing, file tree with +/− counts, `[ ]` navigation, loading/empty/404/permission/rate-limit states. / Accept: any public PR URL opens; bad URL shows inline error. / Test: unit (URL parser), Playwright for states via MSW.

### Phase C — Voice review experience (22–23 Oct)

**11 · Review store · P0 · 1.5h · 8** — `review-store.ts`: cards CRUD, anchor, type, persistence to localStorage keyed by PR+headSha, schema-versioned. / Accept: reload restores drafts; corrupted storage handled. / Test: unit persistence tests.
**12 · Capture panel (Pin & Speak) · P0 · 2.5h · 9,11,4** — docked panel, state machine (No anchor / Anchor set / Text received / Saved), focus management, `⌘↵`/`Esc`, typing fallback, honest copy ("ReviewAloud can't see Wispr listening; it shows text when it arrives"). / Accept: G1 behavior reproduced inside real viewer; no fake mic indicator. / Test: Playwright (simulated paste + typing); manual Wispr run ×10.
**13 · Comment cards · P0 · 2h · 11,12** — card list pinned per line in diff + sidebar list; edit inline, delete with undo, type selector. / Accept: card appears on correct line ≤100ms after save; edits persist. / Test: Playwright.
**14 · Re-anchor + multi-line ranges · P1 · 1.5h · 13,8** — move card to new line/range; range highlight. / Accept: re-anchored card validates; invalid range blocked with message. / Test: unit + Playwright.
**15 · Keyboard & speed pass · P1 · 1.5h · 12,13** — shortcuts map (`?` overlay), next-unreviewed-hunk jump, focus rings, screen-reader labels. / Accept: full review possible without mouse; measured time for 5-comment review recorded (honest baseline vs GitHub UI, same PR). / Test: manual timing log + axe on workspace.
**16 · AI tidy + intent suggestion · P2 · 2h · 13,2** — `api/ai/tidy` (Haiku), side-by-side accept/reject, identifier post-check. / Accept: never auto-applies; malformed output → error state; invented identifier → rejected. / Test: unit with mocked model outputs incl. invalid JSON + injected identifier.

### Phase D — Review publishing (24 Oct)

**17 · GitHub App auth · P0 · 2h · 2,3** — login/callback/logout, iron-session cookie, token refresh if expiring tokens enabled, "install app on this repo" prompt when 404/403. / Accept: login works locally; token never reaches client JS; logout clears. / Test: Playwright with mocked OAuth; manual live login; check cookie flags.
**18 · Publish preview + validation · P0 · 1.5h · 11,8,6** — preview modal listing cards by file; re-fetch head SHA; validate/flag outdated anchors; optional summary body. / Accept: outdated/invalid cards blocked with fix action. / Test: unit + MSW (head moved scenario).
**19 · Create pending review · P0 · 1.5h · 17,18** — `api/gh/review/create` (Zod, origin check, allowlist), detect existing pending review. / Accept: real pending review on sandbox with all comments on intended lines; UI says "Draft — only you can see it". / Test: live run on sandbox; MSW for 422.
**20 · Submit review · P0 · 1h · 19** — confirm dialog (COMMENT / REQUEST_CHANGES), `api/gh/review/submit`, GitHub links per comment, duplicate-submit lock. / Accept: submitted review visible publicly; double-click produces one submission. / Test: live sandbox; Playwright double-click.
**21 · Errors & recovery · P0 · 1h · 19,20** — map 401/403/404/422/rate-limit/network to actionable messages; retry safe operations only; drafts never lost. / Accept: each error path shows message + preserves cards. / Test: MSW error matrix in TEST_MATRIX. **→ V1 slice done.**

### Phase E — Promise Ledger (25–26 Oct)

**22 · Review history gather · P0 · 2h · 6,17** — list reviewer's top-level review comments, replies (`in_reply_to_id`), GraphQL thread `isResolved/isOutdated`, commits after each comment. / Accept: correct thread trees for sandbox PR. / Test: MSW fixtures + live.
**23 · Commit comparison + anchor tracking · P0 · 2h · 22,8** — `compare(original_commit_id...head)`, map original anchor to head (or "removed"), extract head context ±25 lines + changed hunks elsewhere (capped). / Accept: correct `anchorRegionChanged`/`otherFilesChanged` on 6 handcrafted cases. / Test: unit with fixtures.
**24 · Intent classification + short-circuits · P0 · 1.5h · 22** — Haiku classifier (schema), deterministic rules (no commits/no reply). / Accept: short-circuit cases make 0 AI calls; classifier output validated. / Test: unit with mocked model.
**25 · Verifier + structured output · P0 · 2.5h · 23,24** — Sonnet prompt with untrusted-data delimiters, JSON schema, Zod, one repair retry. Spike on 4 planted cases first (G4). / Accept: G4 passes or documented fallback triggered; invalid outputs → Needs human verification. / Test: unit (mocked bad outputs), live on 4 cases.
**26 · Evidence validation · P0 · 1.5h · 25** — verify every quote against head file text at cited lines; Addressed requires verified support & no verified contradiction. / Accept: fabricated quote → dropped → verdict downgraded. / Test: unit with fabricated-evidence fixtures.
**27 · Ledger UI + evidence inspector · P0 · 2.5h · 26,9** — per-item rows streaming in, 4 status chips, rationale, evidence snippets opening diff at line, "what's missing". No percentages. / Accept: click evidence → jumps to exact head lines. / Test: Playwright on fixture data.
**28 · CI context · P1 · 1h · 22** — check runs + statuses for head; shown as context with explicit "CI passing ≠ addressed". / Accept: misleading-CI eval case still not Addressed by CI. / Test: unit.
**29 · Overrides + consent + budget · P0 · 1.5h · 27,2** — reviewer override with note (local), private-repo consent dialog, per-session AI cap. / Accept: override persists and is labelled "Reviewer override"; no AI call on private repo before consent; cap enforced. / Test: unit + Playwright.

### Phase F — Follow-up (26–27 Oct)

**30 · Unresolved queue · P0 · 1h · 27** — filtered view of Unresolved/Needs human/Reply needed with counts. / Accept: counts match ledger. / Test: unit.
**31 · Fix-instruction generator · P0 · 1.5h · 30** — deterministic template (file:line, original words, missing piece, evidence) + optional edit; Copy for Claude Code. / Accept: instruction contains path, line, verbatim request; editable before copy. / Test: snapshot unit tests.
**32 · Thread reply + re-check · P1 · 1.5h · 31,17** — confirmed reply via replies endpoint; "Re-check" re-runs item after new commits. / Accept: reply appears on sandbox thread; re-check reflects new commit. **→ V2 full loop done.** / Test: live sandbox.

### Phase G — Polish & public demo (27–28 Oct)

**33 · Design system + landing · P1 · 3h · 10** — tokens (dark-first, light supported), type scale, primitives (Button, Chip, Kbd, Panel, Dialog), landing page with tagline + "Try demo" + "Open a PR". / Accept: consistent primitives across screens; landing LCP < 2.5s locally. / Test: Lighthouse, visual review screenshots.
**34 · Public demo · P0 · 3h · 13,27,31** — `scripts/snapshot-demo.ts` from real sandbox PR + recorded real ledger run (date, model labelled); `/demo` full flow with simulated publish clearly labelled. / Accept: judge can complete select→dictate→card→preview→ledger→follow-up with no login/keys; every simulated action labelled. / Test: Playwright full demo e2e in CI.
**35 · Accessibility + responsive · P1 · 2h · 33,34** — axe zero serious issues, keyboard paths, ≥ 375px usable (read-only diff + cards on mobile). / Accept: axe clean on 4 key pages; no horizontal page scroll at 375px. / Test: Playwright axe + viewport tests.
**36 · Performance · P2 · 1h · 34** — code-split Shiki, lazy ledger, memoized rows. / Accept: Lighthouse perf ≥ 85 on landing & demo (measured, reported as is). / Test: Lighthouse.

### Phase H — QA, deploy, present (28–30 Oct)

**37 · E2E + security review · P0 · 2h · 21,32,34** — Playwright full live-mode flow against MSW, security checklist (token exposure, CSRF/origin, allowlist, XSS, prompt-injection fixture). / Accept: all suites green; checklist items PASS/limitation recorded. / Test: `pnpm test && pnpm test:e2e`; injection fixture yields no instruction-following.
**38 · Ledger eval (20 labelled scenarios) · P0 · 3h · 26,28** — sandbox PRs with labelled planted cases (5 addressed, 5 unresolved, 3 partial, 2 other-file fix, 3 questions/declined, 2 misleading-CI); `pnpm eval` → confusion matrix, **false-addressed rate**. Plus real dogfood PRs from building ReviewAloud (labelled honestly). / Accept: results reported exactly as measured; any false-addressed case analysed and rule fixed or documented. / Test: eval script output committed.
**39 · Deploy · P0 · 1.5h · 37** — Vercel project, env vars, GitHub App prod callback, prod smoke (login, open PR, publish to sandbox, ledger item, demo). / Accept: prod smoke all PASS from a clean browser. / Test: manual checklist + Playwright against prod URL (demo only).
**40 · Demo + submission pack · P0 · 3h · 39** — README (setup, architecture, limitations, eval results), 2-min script, recording on real sandbox PR (labelled time-skip for agent commits), submission text; user adds real Wispr usage card. / Accept: video ≤ 2:00; all 4 submission items ready by 30 Oct evening. / Test: outsider runs the live link + demo unaided.

### Deferral order if behind (core loop never cut)

16 AI tidy → 36 perf → split diff view → 14 ranges → 28 CI → 32 thread reply (keep copy-instruction) → 15 polish. Never cut: 4,5,7–13,17–21,22–27,29,31,34,37–40.

## Schedule

| Date         | Tasks                                                    |
| ------------ | -------------------------------------------------------- |
| Mon 19 (eve) | 1, 2, 3 (after your setup)                               |
| Tue 20       | 4, 5 — **gate G1–G3**                                    |
| Wed 21       | 6, 7, 8                                                  |
| Thu 22       | 9, 10, 11                                                |
| Fri 23       | 12, 13, 14, 15 (16 if time)                              |
| Sat 24       | 17–21 → **V1**                                           |
| Sun 25       | 22, 23, 24, 25 (**G4**)                                  |
| Mon 26       | 26–29, 30–31 → **V2 core**; Wispr check-in + social post |
| Tue 27       | 32, 33, 34                                               |
| Wed 28       | 35, 37, 38 (36 if time) — feature freeze                 |
| Thu 29       | 39, 40 (record demo)                                     |
| Fri 30       | prod re-verify, submit by ~8 pm IST                      |

## Verification (end-to-end)

- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` green.
- Live: `pnpm tsx scripts/live-github-check.ts` on sandbox only.
- Manual Wispr run: 10 dictations on prod, anchors correct (logged in TEST_MATRIX).
- `pnpm eval` on 20 scenarios → measured accuracy + false-addressed rate in README.
- Prod smoke from clean browser: demo flow (no login) + live flow (login → publish → ledger → follow-up) on sandbox PR.

## On approval I will first

Create `docs/` files from this plan, then Tasks 1–2; pause for you to: switch `gh` to personal account, approve creating the two public repos, create the GitHub App, and add keys to `.env.local`.
