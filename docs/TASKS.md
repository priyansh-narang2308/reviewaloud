# Task tracker

Status: TODO · IN PROGRESS · BLOCKED · DONE. Full task definitions: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#40-tasks).

| #   | Task                                   | P   | Status  | Notes / limitation                                                             |
| --- | -------------------------------------- | --- | ------- | ------------------------------------------------------------------------------ |
| 1   | Scaffold repo                          | P0  | DONE    | Next 16.4.2, React 19.3, Tailwind 4, Zod 4, Vitest 5, Playwright 1.64          |
| 2   | Architecture docs + env schema         | P0  | DONE    | All env vars optional at boot; features fail naming the missing key            |
| 3   | Sandbox + GitHub App setup             | P0  | IN PROGRESS | Repos + sandbox PR #1 done. Remaining (you): GitHub App, public-read token, OpenRouter key |
| 4   | Wispr capture spike                    | P0  | IN PROGRESS | `/spike/capture` built; simulated-paste e2e passes. Remaining: your 10 real Wispr dictations (G1) |
| 5   | GitHub write spike                     | P0  | DONE | G2 PASS (6/6 anchors). Pending hidden from others, 2nd pending → 422, submit + reply OK. G3 partial: tested with gh OAuth token; GitHub App token in Task 17. Found: GitHub accepts cross-hunk ranges and LEFT on context lines |
| 6   | GitHub client + PR fetch               | P0  | DONE | Typed errors, Link pagination (≤3000 files), Zod-validated responses, recorded-fixture tests. No ETag cache (deferred). Used injected fetch instead of MSW |
| 7   | Unified diff parser                    | P0  | DONE | 18 tests on real sandbox patches + real git edge cases (no-EOF-newline, omitted counts, deleted file, blank context); strict count checks reject malformed patches |
| 8   | Anchor mapper + validator              | P0  | DONE | 20 tests. UI anchors match all 6 live-verified GitHub placements; validates side/number/text; single-hunk range rule; re-maps drafts by unique text after head moves, else outdated (never guesses) |
| 9   | Diff viewer                            | P0  | TODO    |                                                                                |
| 10  | Workspace shell + file nav             | P0  | TODO    |                                                                                |
| 11  | Review store                           | P0  | TODO    |                                                                                |
| 12  | Capture panel (Pin & Speak)            | P0  | TODO    |                                                                                |
| 13  | Comment cards                          | P0  | TODO    |                                                                                |
| 14  | Re-anchor + multi-line ranges          | P1  | TODO    |                                                                                |
| 15  | Keyboard & speed pass                  | P1  | TODO    |                                                                                |
| 16  | AI tidy + intent suggestion            | P2  | TODO    |                                                                                |
| 17  | GitHub App auth                        | P0  | TODO    |                                                                                |
| 18  | Publish preview + validation           | P0  | TODO    |                                                                                |
| 19  | Create pending review                  | P0  | TODO    |                                                                                |
| 20  | Submit review                          | P0  | TODO    |                                                                                |
| 21  | Errors & recovery                      | P0  | TODO    | V1 slice                                                                       |
| 22  | Review history gather                  | P0  | TODO    |                                                                                |
| 23  | Commit comparison + anchor tracking    | P0  | TODO    |                                                                                |
| 24  | Intent classification + short-circuits | P0  | TODO    |                                                                                |
| 25  | Verifier + structured output           | P0  | TODO    | G4                                                                             |
| 26  | Evidence validation                    | P0  | TODO    |                                                                                |
| 27  | Ledger UI + evidence inspector         | P0  | TODO    |                                                                                |
| 28  | CI context                             | P1  | TODO    |                                                                                |
| 29  | Overrides + consent + budget           | P0  | TODO    |                                                                                |
| 30  | Unresolved queue                       | P0  | TODO    |                                                                                |
| 31  | Fix-instruction generator              | P0  | TODO    |                                                                                |
| 32  | Thread reply + re-check                | P1  | TODO    | V2 full loop                                                                   |
| 33  | Design system + landing                | P1  | TODO    |                                                                                |
| 34  | Public demo                            | P0  | TODO    |                                                                                |
| 35  | Accessibility + responsive             | P1  | TODO    |                                                                                |
| 36  | Performance                            | P2  | TODO    |                                                                                |
| 37  | E2E + security review                  | P0  | TODO    |                                                                                |
| 38  | Ledger eval (20 scenarios)             | P0  | TODO    |                                                                                |
| 39  | Deploy                                 | P0  | TODO    |                                                                                |
| 40  | Demo + submission pack                 | P0  | TODO    |                                                                                |
