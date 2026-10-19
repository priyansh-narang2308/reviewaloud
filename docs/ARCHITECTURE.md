# Architecture

Workflow: **Speak → Anchor → Review → Publish → Verify → Follow up.** The reviewer approves every external write.

## Stack
Next.js 16 (App Router) · TypeScript strict · Tailwind 4 · Zod 4 · Vitest · Playwright · OpenRouter (free models, OpenAI-compatible HTTP, server-only) · Vercel Hobby. No database: drafts and reviewer overrides live in `localStorage` (keyed `owner/repo#pr@headSha`); the GitHub user token lives in an encrypted httpOnly session cookie.

## Layout
```
app/            routes: landing, /demo, /pr/[owner]/[repo]/[n], /api/*
lib/diff/       pure diff parsing + anchor mapping (unit-tested heavily)
lib/github/     REST/GraphQL wrappers with typed errors
lib/ledger/     gather → signals → rules → AI verify → evidence validation
lib/ai/         OpenRouter client, model fallback, budgets
lib/store/      client review store
components/     diff/, capture/, cards/, ledger/, ui/
fixtures/       demo PR snapshot, eval scenarios
scripts/        env-check, live-github-check, snapshot-demo, eval-ledger
```

## Wispr Flow compatibility
No Wispr SDK/API is used or assumed. Per Wispr's help center, dictated text is inserted into the **focused field after the shortcut is released**, via a brief clipboard paste. So:
- Selecting a diff line stores the anchor in app state, then focuses the capture textarea. Focus never changes the anchor.
- The UI shows "Text received" when an `insertFromPaste` input arrives. It never shows a "listening" state: the browser cannot observe it.
- The same textarea is the typing fallback.

## Environment
`lib/env.ts` validates server env with Zod. Nothing is required at boot (the demo needs no keys); each feature calls `requireFeature()` and fails naming the missing variable. `pnpm env:check` prints which features are configured (names only, never values).

| Feature | Variables |
|---|---|
| githubAuth | `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG` |
| publicRead | `GITHUB_PUBLIC_READ_TOKEN` |
| ai | `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODELS`) |
| session | `SESSION_SECRET` |
| optional | `APP_URL`, `WRITE_REPO_ALLOWLIST`, `AI_DAILY_CALL_CAP` |

## GitHub App
Create at GitHub → Settings → Developer settings → GitHub Apps → New GitHub App:
- **Homepage URL:** `http://localhost:3000` (update after deploy)
- **Callback URL:** `http://localhost:3000/api/auth/callback` (add the Vercel URL later)
- **Expire user authorization tokens:** on · **Request user authorization during installation:** on
- **Webhook:** off (uncheck Active)
- **Repository permissions:** Pull requests: Read & write · Contents: Read · Checks: Read · Commit statuses: Read · Metadata: Read (mandatory)
- **Account permissions:** none
- **Where can it be installed:** Any account
After creating: copy the Client ID, generate a client secret, note the app slug (from its URL), and install it on the sandbox repo only. Put the values in `.env.local` yourself.

## Ledger statuses
Addressed · Unresolved · Needs human verification · Reply needed. "Addressed" requires at least one evidence quote that matches the head code at the cited lines and no matching contradicting quote. CI results are context only. Threads are never auto-resolved. No confidence percentages.

## Security
Tokens server-side only · origin check + SameSite=Lax on POSTs · Zod on all inputs and model outputs · optional write allowlist · per-session AI cap + free-tier daily limit · repo content passed to models inside delimited untrusted blocks · all model/repo text rendered as plain text · consent before sending private repo code to OpenRouter (free-model providers may log prompts).
