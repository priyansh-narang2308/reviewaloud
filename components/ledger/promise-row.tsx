"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { type AgentMention, agentPrompt, followUpInstruction } from "@/lib/ledger/instruction";
import { STATUSES, type LedgerStatus, type PromiseItem, type Verdict } from "@/lib/ledger/types";
import type { Override } from "@/lib/store/ledger-store";
import { STATUS_META, StatusChip } from "./status";
import { recordedLabel, useDemo } from "@/components/demo/demo-context";

type Props = {
  item: PromiseItem;
  verdict: Verdict | undefined;
  override: Override | undefined;
  headSha: string;
  prUrl: string;
  checking: boolean;
  error: string | null;
  canCheck: boolean;
  canReply: boolean;
  onCheck: () => void;
  onOverride: (status: LedgerStatus | null) => void;
  onReply: (body: string) => Promise<{ ok: true; url: string } | { ok: false; message: string }>;
};

const strip = (b: string) => b.replace(/^\*\*([A-Za-z]+):\*\*\s*/, "");
const typeOf = (b: string) => b.match(/^\*\*([A-Za-z]+):\*\*/)?.[1] ?? null;

export function PromiseRow(p: Props) {
  const { item, verdict: v, override } = p;
  const status = override?.status ?? v?.status ?? null;
  const stale = !!v && v.headSha !== p.headSha;
  const needsFollowUp = status === "unresolved" || status === "needs_human" || status === "reply_needed";
  const [open, setOpen] = useState(false);
  const demo = useDemo();

  return (
    <li data-testid="promise" data-comment-id={item.commentId} className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <StatusChip status={status} override={!!override} />
        {stale && (
          <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-200" title={`Checked at ${v!.headSha.slice(0, 7)}; latest is ${p.headSha.slice(0, 7)}`}>
            New commits since this check
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs">
          <a href={item.htmlUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-text">
            Thread ↗
          </a>
          <OverrideMenu current={override?.status ?? null} onPick={p.onOverride} />
          <button
            type="button"
            data-testid="check"
            disabled={!p.canCheck || p.checking}
            onClick={p.onCheck}
            className="rounded-md border border-border-strong px-2.5 py-1 hover:bg-surface-2 disabled:opacity-40"
          >
            {p.checking ? "Checking…" : v ? "Re-check" : "Check"}
          </button>
        </span>
      </div>

      <blockquote className="mt-3 border-l-2 border-accent/70 pl-3">
        <p className="mb-1 font-mono text-[11px] text-faint">
          Your words · {item.path} {item.side === "LEFT" ? "deleted line" : "line"} {item.originalLine ?? "?"}
          {typeOf(item.body) && <> · {typeOf(item.body)}</>} · {item.author}
        </p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{strip(item.body)}</p>
      </blockquote>

      {p.checking && <p className="mt-3 text-xs text-muted">Checking the latest code against your request… free models can take up to ~30 s.</p>}
      {p.error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {p.error}
        </p>
      )}

      {v && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-text">{v.rationale}</p>
          {v.whatIsMissing && status !== "addressed" && (
            <p data-testid="missing" className="text-rose-200">
              <span className="text-muted">Still missing: </span>
              {v.whatIsMissing}
            </p>
          )}
          {v.evidence.length > 0 && (
            <ul className="space-y-1.5" data-testid="evidence">
              {v.evidence.map((e, i) => (
                <li key={i} className="rounded-lg border border-border bg-bg p-2">
                  <p className="mb-1 flex items-center gap-2 text-[11px] text-faint">
                    <span className={e.supports ? "text-emerald-300" : "text-rose-300"}>{e.supports ? "supports" : "contradicts"}</span>
                    <span className="font-mono">{e.kind === "code" ? `${e.path}:${e.startLine}${e.endLine && e.endLine !== e.startLine ? `–${e.endLine}` : ""}` : `reply #${e.replyId}`}</span>
                    <span title="This exact text was found at the cited place">✓ verified quote</span>
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] text-text">{e.quote}</pre>
                </li>
              ))}
            </ul>
          )}
          <details className="text-xs text-muted">
            <summary>
              {demo && <span className="mr-1 rounded border border-accent/40 px-1 text-accent">{recordedLabel(demo)}</span>}
              How this was decided · {v.decidedBy === "rules" ? "deterministic rules (no AI)" : `AI (${v.model})`} at {v.headSha.slice(0, 7)}
            </summary>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {v.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
              {v.droppedEvidence > 0 && <li>{v.droppedEvidence} quote(s) from the model weren&apos;t found in the code and were discarded.</li>}
              <li>Your words are the contract: the agent&apos;s commit messages and summaries aren&apos;t trusted as evidence.</li>
            </ul>
          </details>
        </div>
      )}

      {needsFollowUp && (
        <div className="mt-3">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="follow-up-toggle" className="text-xs font-medium text-accent">
            {open ? "Hide follow-up" : "Hand back to the agent →"}
          </button>
          {open && <FollowUp item={item} verdict={v} prUrl={p.prUrl} canReply={p.canReply} onReply={p.onReply} />}
        </div>
      )}
    </li>
  );
}

function OverrideMenu({ current, onPick }: { current: LedgerStatus | null; onPick: (s: LedgerStatus | null) => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger data-testid="override" className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-text">
        Override
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 min-w-[200px] rounded-xl border border-border-strong bg-surface-2/95 p-1 text-sm shadow-2xl backdrop-blur">
          <Menu.Label className="px-2.5 py-1 text-[11px] text-faint">Your verdict wins over the check</Menu.Label>
          <Menu.RadioGroup value={current ?? ""} onValueChange={(v) => onPick((v || null) as LedgerStatus | null)}>
            {STATUSES.map((s) => (
              <Menu.RadioItem key={s} value={s} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-bg/70">
                <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
                {STATUS_META[s].label}
                <Menu.ItemIndicator className="ml-auto text-accent">✓</Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.RadioItem value="" className="rounded-lg px-2.5 py-1.5 text-xs text-muted outline-none data-[highlighted]:bg-bg/70">
              Clear override
            </Menu.RadioItem>
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function FollowUp({
  item,
  verdict,
  prUrl,
  canReply,
  onReply,
}: {
  item: PromiseItem;
  verdict: Verdict | undefined;
  prUrl: string;
  canReply: boolean;
  onReply: Props["onReply"];
}) {
  const [mention, setMention] = useState<AgentMention>("none");
  const [text, setText] = useState(() => followUpInstruction(item, verdict, "none"));
  const [edited, setEdited] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState<{ k: "idle" } | { k: "posting" } | { k: "posted"; url: string } | { k: "error"; message: string }>({ k: "idle" });
  const [copied, setCopied] = useState(false);
  const demo = useDemo();

  const pickMention = (m: AgentMention) => {
    setMention(m);
    if (!edited) setText(followUpInstruction(item, verdict, m));
  };

  return (
    <div data-testid="follow-up" className="mt-2 rounded-lg border border-accent/30 bg-accent-soft/40 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Address it to:</span>
        {(["none", "@claude", "@copilot"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mention === m}
            onClick={() => pickMention(m)}
            className={`rounded-full border px-2 py-0.5 ${mention === m ? "border-accent text-text" : "border-border-strong text-muted hover:text-text"}`}
          >
            {m === "none" ? "No mention" : m}
          </button>
        ))}
        <span className="text-faint">Mentions only trigger agents installed on the repo.</span>
      </div>
      <label htmlFor={`fu-${item.commentId}`} className="sr-only">
        Follow-up instruction
      </label>
      <textarea
        id={`fu-${item.commentId}`}
        data-testid="follow-up-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEdited(true);
        }}
        rows={Math.min(12, text.split("\n").length + 1)}
        className="block w-full resize-y rounded-md border border-border-strong bg-bg px-2.5 py-2 font-mono text-[12px] leading-relaxed"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(mention === "none" && !edited ? agentPrompt(item, verdict, prUrl) : text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-md border border-border-strong px-3 py-1 text-xs hover:bg-surface-2"
        >
          {copied ? "Copied ✓" : "Copy for Claude Code"}
        </button>
        {state.k === "posted" ? (
          <a href={state.url} target="_blank" rel="noreferrer" data-testid="reply-posted" className="text-xs text-accent underline">
            {demo ? "Simulated: reply not sent (demo) · see the real sandbox PR ↗" : "Reply posted on GitHub ↗"}
          </a>
        ) : confirm ? (
          <>
            <span className="text-xs">{demo ? "Demo: this is simulated, nothing is posted." : "Post this publicly on the thread?"}</span>
            <button
              type="button"
              disabled={state.k === "posting"}
              onClick={async () => {
                setState({ k: "posting" });
                const r = await onReply(text);
                setState(r.ok ? { k: "posted", url: r.url } : { k: "error", message: r.message });
                setConfirm(false);
              }}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-black disabled:opacity-40"
            >
              {state.k === "posting" ? "Posting…" : "Yes, post reply"}
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="text-xs text-muted">
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!canReply}
            title={canReply ? undefined : "Sign in with GitHub to reply"}
            onClick={() => setConfirm(true)}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-black disabled:opacity-40"
          >
            Reply on GitHub thread
          </button>
        )}
        {state.k === "error" && (
          <span role="alert" className="text-xs text-danger">
            {state.message}
          </span>
        )}
      </div>
    </div>
  );
}
