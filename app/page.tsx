import Link from "next/link";
import { Suspense } from "react";
import { Logo, LogoGlyph } from "@/components/brand/logo";
import { Mascot } from "@/components/landing/mascot";
import { OpenPrForm } from "@/components/landing/open-pr-form";
import { ProductPreview } from "@/components/landing/product-preview";
import { Separator } from "@/components/ui/separator";
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

const display = "text-[3.6rem] leading-[0.95] sm:text-7xl md:text-8xl xl:text-[9.5rem] font-light tracking-[0.04em]";

function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-muted">
      <span className="font-mono text-accent">{n}</span>
      <span>{children}</span>
      <Separator className="flex-1" />
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip">
      {/* Dot grid, fading out below the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1100px] bg-[radial-gradient(circle,_rgb(255_255_255/0.9)_1px,_transparent_1px)] opacity-[0.09] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[700px] bg-[radial-gradient(50%_45%_at_50%_10%,rgb(245_165_36/0.10),transparent_70%)]" />

      <header className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 pt-6 md:px-8">
        <Link href="/" aria-label="ReviewAloud home">
          <Logo />
        </Link>
        <nav aria-label="Site" className="ml-auto hidden items-center gap-7 text-sm md:flex">
          <a href="#product" className="font-medium text-text transition-opacity hover:opacity-60">
            Product
          </a>
          <a href="#how" className="text-muted transition-opacity hover:opacity-60">
            How it works
          </a>
          <a href="#why" className="text-muted transition-opacity hover:opacity-60">
            Why
          </a>
          <a href={SITE.repoUrl} target="_blank" rel="noreferrer" className="text-muted transition-opacity hover:opacity-60">
            GitHub
          </a>
        </nav>
        <Link href="/demo" className="btn ml-auto rounded-full bg-text px-4 py-1.5 text-sm font-medium text-bg hover:bg-white md:ml-0">
          Try the demo
        </Link>
      </header>

      <main className="relative">
        {/* Editorial hero */}
        <section className="relative px-6 pb-16 pt-16 md:pt-24">
          <h1 aria-label="Review aloud. Prove it." className="flex w-full flex-col gap-3 md:items-center md:gap-2">
            <span aria-hidden className="rise rise-1 gap-6 md:flex md:items-center">
              <span className="mb-3 block max-w-[230px] text-xs leading-5 text-muted md:mb-0 md:max-w-[190px] md:text-right md:text-sm">
                For developers reviewing pull requests written by AI agents.
              </span>
              <span className={display}>REVIEW</span>
            </span>
            <span aria-hidden className="rise rise-2 gap-6 md:flex md:items-center">
              <span className={`${display} flex items-center`}>
                <span>AL</span>
                <LogoGlyph className="mx-[0.04em] h-[0.74em] w-[0.82em] translate-y-[0.02em] text-accent" />
                <span>UD</span>
              </span>
              <span className="mt-3 block max-w-[250px] text-xs leading-5 text-muted md:mt-0 md:max-w-[200px] md:pt-8 md:text-sm">
                Speak your review with Wispr Flow. Every word lands pinned to the exact line.
              </span>
            </span>
            <span aria-hidden className="rise rise-3 md:flex md:items-center">
              <span className={`${display} flex items-center`}>
                <span>PROVE</span>
                <svg viewBox="0 0 24 24" className="mx-[0.12em] h-[0.7em] w-[0.7em] text-accent" aria-hidden>
                  <circle cx="12" cy="12" r="11" fill="currentColor" />
                  <path d="M7 12.4l3.3 3.2L17.2 8.8" fill="none" stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>IT</span>
              </span>
            </span>
          </h1>

          <div className="rise rise-4 mx-auto mt-10 w-full max-w-7xl md:px-8">
            <div className="grid items-center gap-3 md:flex md:justify-end">
              <Separator className="mx-auto my-4 max-w-3xl md:my-0" />
              <div className="text-xs uppercase tracking-[0.16em] text-muted md:whitespace-nowrap md:text-sm">WeMakeDevs × Wispr Flow · No Hands 2026</div>
              <div className="flex shrink-0 items-end gap-3 whitespace-nowrap">
                <span className="text-2xl font-thin md:text-4xl">SAY IT OUT</span>
                <span className="text-3xl font-bold italic text-accent md:text-5xl">loud</span>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-12 grid w-full max-w-7xl gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-end md:px-8">
            <div className="flex flex-col gap-5">
              <Link
                href="/demo"
                data-testid="hero-demo"
                className="btn inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 font-medium text-black shadow-[0_10px_34px_-10px_rgb(245_165_36/0.65)] hover:brightness-110 sm:w-fit"
              >
                Try the live demo, no login <span aria-hidden>→</span>
              </Link>
              <div className="max-w-xl">
                <Suspense fallback={<OpenPrForm example={SITE.demoPrUrl} />}>
                  <FormWithQuery searchParams={searchParams} />
                </Suspense>
              </div>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted md:justify-self-end md:text-base md:leading-7">
              Then ReviewAloud checks every later commit against <span className="text-text">your exact words</span>, quoting the code it relied on.
              Not the agent&apos;s summary. <span className="text-text">The agent wrote the code. You gave the feedback. Did the fix actually land?</span>
            </p>
          </div>

          <a
            href={SITE.repoUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="ReviewAloud on GitHub"
            className="absolute bottom-2 right-6 hidden text-muted transition-opacity hover:opacity-60 md:right-12 md:block"
          >
            <GitHubIcon />
          </a>
        </section>

        {/* Vertical tab, a sticky ribbon on the right edge */}
        <Link
          href="/demo"
          data-testid="side-tab"
          className="fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 items-center bg-accent px-2.5 py-6 text-xs font-bold uppercase tracking-[0.2em] text-black transition-[padding] duration-200 hover:pr-4 sm:flex"
        >
          <span className="rotate-180 [writing-mode:vertical-rl]">Try the demo</span>
        </Link>

        <div className="mx-auto w-full max-w-7xl px-6 md:px-8">
          <section id="product" aria-label="Product preview" className="scroll-mt-10 pb-24">
            <SectionLabel n="01">The product, on a real PR</SectionLabel>
            <ProductPreview />
          </section>

          <section id="how" className="scroll-mt-10 pb-24">
            <SectionLabel n="02">How it works</SectionLabel>
            <h2 className="max-w-3xl text-3xl font-light tracking-tight sm:text-5xl">
              One loop, from your voice to a <span className="font-semibold italic text-accent">kept</span> promise.
            </h2>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="bg-bg p-5">
                  <p className="mb-6 font-mono text-xs text-accent">0{i + 1}</p>
                  <h3 className="mb-2 text-lg font-medium">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="why" className="scroll-mt-10 pb-24">
            <SectionLabel n="03">Why it&apos;s different</SectionLabel>
            <div className="grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div>
                <h2 className="text-3xl font-light tracking-tight sm:text-5xl">
                  The accountability layer between you and your <span className="font-semibold italic text-accent">agents</span>.
                </h2>
                <p className="mt-5 max-w-md leading-relaxed text-muted">
                  Coding agents can fix review comments, but checking that they fixed <i>yours</i>, the way you asked, is still on you. ReviewAloud
                  does that check with you, in the open.
                </p>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {PRINCIPLES.map(([title, body], i) => (
                  <article key={title} className="grid gap-2 py-6 sm:grid-cols-[3rem_1fr]">
                    <span className="font-mono text-xs text-faint">/0{i + 1}</span>
                    <div>
                      <h3 className="mb-1.5 text-lg font-medium">{title}</h3>
                      <p className="text-sm leading-relaxed text-muted">{body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="pb-24">
            <SectionLabel n="04">Built for Wispr Flow, built with Wispr Flow</SectionLabel>
            <div className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
              <div>
                <h2 className="text-3xl font-light tracking-tight sm:text-5xl">
                  Talking is faster than <span className="font-semibold italic text-accent">typing</span> review comments.
                </h2>
                <p className="mt-5 max-w-lg leading-relaxed text-muted">
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
                  <li key={k} className="flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5">
                    <kbd className="min-w-16 rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 text-center font-mono text-[11px]">{k}</kbd>
                    <span className="text-muted">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>

      <Mascot />

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8 pl-[96px] text-xs text-faint sm:pl-[136px] md:px-8 lg:pl-8">
          <Logo size={20} className="opacity-80" />
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
