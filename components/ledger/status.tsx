import type { LedgerStatus } from "@/lib/ledger/types";

export const STATUS_META: Record<LedgerStatus, { label: string; short: string; cls: string; dot: string; bar: string }> = {
  addressed: { label: "Addressed", short: "Kept", cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200", dot: "bg-emerald-400", bar: "bg-emerald-400" },
  unresolved: { label: "Unresolved", short: "Open", cls: "border-rose-500/50 bg-rose-500/10 text-rose-200", dot: "bg-rose-400", bar: "bg-rose-400" },
  needs_human: { label: "Needs human check", short: "Unclear", cls: "border-amber-500/50 bg-amber-500/10 text-amber-200", dot: "bg-amber-400", bar: "bg-amber-400" },
  reply_needed: { label: "Reply needed", short: "Reply", cls: "border-violet-500/50 bg-violet-500/10 text-violet-200", dot: "bg-violet-400", bar: "bg-violet-400" },
};

export function StatusChip({ status, override }: { status: LedgerStatus | null; override?: boolean }) {
  if (!status) {
    return <span className="rounded-full border border-dashed border-border-strong px-2 py-0.5 text-xs text-faint">Not checked</span>;
  }
  const m = STATUS_META[status];
  return (
    <span data-testid="status-chip" data-status={status} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${m.cls}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
      {override && <span className="text-[10px] uppercase tracking-wide opacity-70">· reviewer override</span>}
    </span>
  );
}
