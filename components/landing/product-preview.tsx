import { StatusChip } from "@/components/ledger/status";
import type { LedgerStatus } from "@/lib/ledger/types";
import snapshot from "@/fixtures/demo/sandbox-pr-2.json";

type V = { status: LedgerStatus; evidence: { quote: string; supports: boolean; path?: string; startLine?: number }[]; whatIsMissing: string | null; model: string | null };

const strip = (b: string) => b.replace(/^\*\*[A-Za-z]+:\*\*\s*/, "");

/**
 * A static preview built from the demo's REAL recorded ledger run (sandbox PR
 * #2), not invented copy. Shows the two moments that matter: pinning a spoken
 * comment to a line, and the ledger catching what the agent skipped.
 */
export function ProductPreview() {
  const items = snapshot.ledger.items.slice(0, 3);
  const verdicts = snapshot.verdicts as unknown as Record<string, V>;
  const kept = Object.values(verdicts).filter((v) => v.status === "addressed").length;
  const total = Object.keys(verdicts).length;

  return (
    <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Pin & Speak */}
      <figure className="min-w-0 self-start overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-2xl shadow-black/40">
        <figcaption className="mb-3 flex items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono">1 · Pin & speak</span>
          src/orders.ts
        </figcaption>
        <div className="overflow-hidden rounded-lg border border-border font-mono text-[12px] leading-[20px]">
          <div className="flex text-faint">
            <span className="w-9 shrink-0 pr-2 text-right">10</span>
            <span className="truncate whitespace-pre pl-2">{"  const sum = orders.reduce((n, o) => n + orderTotal(o), 0);"}</span>
          </div>
          <div className="flex bg-[var(--add-bg)] shadow-[inset_3px_0_0_var(--accent)]">
            <span className="w-9 shrink-0 bg-[var(--add-gutter)] pr-2 text-right text-[#b4bccb]">11</span>
            <span className="truncate whitespace-pre pl-2 text-text">{"  return sum / orders.length;"}</span>
          </div>
          <div className="flex text-faint">
            <span className="w-9 shrink-0 pr-2 text-right">12</span>
            <span className="whitespace-pre pl-2">{"}"}</span>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border-strong bg-bg p-3">
          <p className="mb-1 flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_var(--accent-soft)]" />
            <span className="font-mono text-text">
              src/orders.ts <span className="text-accent">R11</span>
            </span>
            <span className="text-emerald-300">new line 11</span>
          </p>
          <p className="text-sm leading-relaxed">{strip(items[1]?.body ?? "")}</p>
          <p className="mt-2 text-[11px] text-sky-300">Text received · dictated with Wispr Flow · ⌘↵ to save</p>
        </div>
      </figure>

      {/* Promise Ledger */}
      <figure className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-2xl shadow-black/40">
        <figcaption className="mb-3 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono">2 · Promise Ledger</span>
          <span>
            Follow-through <b className="text-text">{kept} of {total} kept</b>
          </span>
        </figcaption>
        <ol className="space-y-2.5">
          {items.map((it) => {
            const v = verdicts[String(it.commentId)];
            const quote = v?.evidence.find((e) => !e.supports) ?? v?.evidence[0];
            return (
              <li key={it.commentId} className="min-w-0 rounded-lg border border-border bg-bg p-3">
                <div className="mb-1.5">
                  <StatusChip status={v?.status ?? null} />
                </div>
                <p className="line-clamp-2 border-l-2 border-accent/70 pl-2 text-[13px] leading-snug">{strip(it.body)}</p>
                {v?.whatIsMissing && v.status !== "addressed" && (
                  <p className="mt-1.5 line-clamp-1 text-[12px] text-rose-200">
                    <span className="text-muted">Still missing: </span>
                    {v.whatIsMissing}
                  </p>
                )}
                {quote && (
                  <pre className="mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted">
                    <span className={quote.supports ? "text-emerald-300" : "text-rose-300"}>✓ </span>
                    {quote.quote.trim().split("\n")[0]}
                  </pre>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[11px] text-faint">
          Real output of one recorded run on a public sandbox PR whose last commit claimed to &ldquo;address all review comments&rdquo;.
        </p>
      </figure>
    </div>
  );
}
