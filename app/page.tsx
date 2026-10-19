import Link from "next/link";
import { Suspense } from "react";
import { OpenPrForm } from "@/components/landing/open-pr-form";
import { ProductPreview } from "@/components/landing/product-preview";
import { Mascot } from "@/components/landing/mascot";
import { parsePrInput } from "@/lib/github/url";
import { SITE } from "@/lib/site";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Reads ?pr-url= set by the no-JS fallback (/open). Recomputes the error from
// the input rather than echoing a query parameter.
async function FormWithQuery({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const input = typeof sp["pr-url"] === "string" ? sp["pr-url"] : "";
  const parsed = input ? parsePrInput(input) : null;
  return <OpenPrForm example={SITE.demoPrUrl} initialValue={input} initialError={parsed && !parsed.ok ? parsed.error : null} />;
}

const STEPS = [
  ["Speak", "Click a line, hold your Wispr Flow key and talk. Your words land as a comment pinned to that exact line, or a range."],
  ["Pin", "Deleted, new and unchanged lines are told apart, and every anchor is checked against GitHub's own numbering."],
  ["Publish", "Review the cards, then create a real GitHub draft review. Nothing goes public until you confirm."],
  ["Verify", "After the agent pushes, the Promise Ledger checks each request against the latest code and quotes the evidence."],
  ["Hand back", "Anything still open goes back to the agent in your words: as a thread reply or a prompt for Claude Code."],
] as const;

const PRINCIPLES = [
  [
    "Your words are the contract",
    "The ledger checks what you asked for, verbatim. Commit messages like “addressed all comments” and the agent's own summary are never treated as evidence.",
  ],
  [
    "Evidence, not vibes",
    "Every verdict quotes the code it relied on, and each quote is checked against the real file. If the evidence can't be found, it isn't “addressed”. It's flagged for you.",
  ],
  [
    "You stay in charge",
    "AI can be wrong, so you can override any verdict. ReviewAloud never resolves threads, approves PRs or posts anything without your confirmation.",
  ],
] as const;

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip">
      {/* Soft accent glow behind the hero */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(245_165_36/0.14),transparent_70%)]" />

      <header className="mx-auto flex w-full max-w-6xl items-center gap-6 px-5 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[13px] font-bold text-black">
            ◉
          </span>
          {SITE.name}
        </Link>
        <nav aria-label="Site" className="ml-auto flex items-center gap-5 text-sm text-muted">
          <a href="#how" className="hidden hover:text-text sm:inline">
            How it works
          </a>
          <a href="#why" className="hidden hover:text-text sm:inline">
            Why it&apos;s different
          </a>
          <a href={SITE.repoUrl} target="_blank" rel="noreferrer" className="hover:text-text">
            GitHub
          </a>
          <Link href="/demo" className="btn rounded-full bg-text px-3.5 py-1.5 text-sm font-medium text-bg hover:bg-white">
            Try the demo
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5">
        <section className="pb-14 pt-10 text-center sm:pt-16">
          <p className="rise rise-1 mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/60 px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            For developers reviewing AI-written pull requests
          </p>
          <h1 className="rise rise-2 mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Review by voice. <span className="text-accent">Prove the fix landed.</span>
          </h1>
          <p className="rise rise-3 mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            ReviewAloud turns what you say into line-anchored GitHub review comments. Then it checks every later commit against your exact
            words and shows quoted evidence, not the agent&apos;s summary.
          </p>
          <div className="rise rise-4 mx-auto mt-8 flex max-w-xl flex-col items-center gap-5">
            <Link
              href="/demo"
              data-testid="hero-demo"
              className="btn w-full rounded-xl bg-accent px-5 py-3 text-center font-medium text-black shadow-[0_8px_30px_-8px_rgb(245_165_36/0.6)] hover:brightness-110 sm:w-auto"
            >
              Try the live demo, no login →
            </Link>
            <div className="flex w-full items-center gap-3 text-xs text-faint">
              <span className="h-px flex-1 bg-border" />
              or open a public pull request
              <span className="h-px flex-1 bg-border" />
            </div>
            <Suspense fallback={<OpenPrForm example={SITE.demoPrUrl} />}>
              <FormWithQuery searchParams={searchParams} />
            </Suspense>
          </div>
        </section>

        <section aria-label="Product preview" className="pb-24">
          <ProductPreview />
        </section>

        <section id="how" className="scroll-mt-10 pb-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">One loop, from your voice to a kept promise</h2>
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-xl border border-border bg-surface p-4">
                <p className="mb-2 font-mono text-xs text-accent">0{i + 1}</p>
                <h3 className="mb-1.5 font-medium">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="why" className="scroll-mt-10 pb-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">The accountability layer between you and your agents</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
            Coding agents can fix review comments, but checking that they fixed <i>yours</i>, the way you asked, is still on you. ReviewAloud does
            that check with you, in the open.
          </p>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {PRINCIPLES.map(([title, body]) => (
              <article key={title} className="rounded-xl border border-border bg-surface p-5">
                <h3 className="mb-2 font-medium">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-24 rounded-2xl border border-border bg-surface p-6 sm:p-10">
          <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-accent">Built for Wispr Flow, built with Wispr Flow</p>
              <h2 className="text-2xl font-semibold tracking-tight">Talking is faster than typing review comments</h2>
              <p className="mt-3 leading-relaxed text-muted">
                Hold your Wispr Flow shortcut, speak, release: the text lands in the focused comment box and stays pinned to the line you clicked.
                No plugin or API needed. ReviewAloud was built the same way: specs and prompts dictated with Wispr Flow.
              </p>
            </div>
            <ul className="space-y-2 text-sm">
              {[
                ["Click", "a diff line (shift-click for a range)"],
                ["Hold", "your Wispr Flow key and speak"],
                ["Release", "the comment appears, pinned"],
                ["⌘↵", "save, then keep reviewing with j / k"],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2">
                  <kbd className="min-w-14 rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 text-center font-mono text-[11px]">{k}</kbd>
                  <span className="text-muted">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <Mascot />

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 pl-[96px] text-xs text-faint sm:pl-[136px] lg:pl-5">
          <span>{SITE.name} · open source</span>
          <a href={SITE.repoUrl} target="_blank" rel="noreferrer" className="hover:text-muted">
            Source on GitHub
          </a>
          <a href={SITE.sandboxUrl} target="_blank" rel="noreferrer" className="hover:text-muted">
            Test sandbox (planted cases)
          </a>
          <span className="ml-auto">Built for the WeMakeDevs × Wispr Flow &ldquo;No Hands&rdquo; challenge</span>
        </div>
      </footer>
    </div>
  );
}
