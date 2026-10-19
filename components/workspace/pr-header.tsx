import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import type { PullRequest } from "@/lib/github/pr";

function StateBadge({ pr }: { pr: PullRequest }) {
  const [label, cls] = pr.merged
    ? ["Merged", "border-violet-500/40 text-violet-300"]
    : pr.state === "closed"
      ? ["Closed", "border-rose-500/40 text-rose-300"]
      : pr.draft
        ? ["Draft", "border-border-strong text-muted"]
        : ["Open", "border-emerald-500/40 text-emerald-300"];
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

export function PrHeader({ pr, fileCount, right }: { pr: PullRequest; fileCount: number; right?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <Link href="/" aria-label="ReviewAloud home" className="transition-opacity hover:opacity-80">
            <Logo size={22} />
          </Link>
          <span className="text-faint">/</span>
          <span className="min-w-0 max-w-full truncate font-mono">{pr.repoFullName}</span>
          <span className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">{right}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {pr.title} <span className="font-normal text-faint">#{pr.number}</span>
          </h1>
          <StateBadge pr={pr} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {pr.author && <span>{pr.author.login}</span>}
          <span className="font-mono text-xs">
            {pr.baseRef} ← {pr.headRef}
          </span>
          <span className="font-mono text-xs" title="Head commit">
            {pr.headSha.slice(0, 7)}
          </span>
          <span>
            {fileCount} {fileCount === 1 ? "file" : "files"} ·{" "}
            <span className="text-emerald-400">+{pr.additions}</span>{" "}
            <span className="text-rose-400">−{pr.deletions}</span>
          </span>
          <a href={pr.htmlUrl} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">
            Open on GitHub ↗
          </a>
        </div>
      </div>
    </header>
  );
}
