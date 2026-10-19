# ReviewAloud

> The agent wrote the code. You gave the feedback. Did the fix actually land?

Voice-first GitHub pull request reviews with evidence-backed verification of follow-up fixes. Built for the WeMakeDevs × Wispr Flow "No Hands" challenge (Builders track).

**Status: in development.** See [docs/TASKS.md](docs/TASKS.md) for what is done and tested.

## Develop
```bash
pnpm install
cp .env.example .env.local   # fill in values yourself
pnpm env:check               # shows which features are configured
pnpm dev
```

Test fixtures live in a separate repo: [reviewaloud-sandbox](https://github.com/priyansh-narang2308/reviewaloud-sandbox).
