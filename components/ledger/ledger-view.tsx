"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loginHref, type ViewerState } from "@/components/auth/use-viewer";
import type { PrRef } from "@/lib/github/pr";
import { aggregate, followThrough } from "@/lib/ledger/score";
import type { LedgerStatus, PromiseItem, Verdict } from "@/lib/ledger/types";
import { ledgerKey, readHistory, readLedger, upsertHistory, writeLedger } from "@/lib/store/ledger-store";
import { PromiseRow } from "./promise-row";
import { STATUS_META } from "./status";

type ListData = { headSha: string; prAuthor: string | null; isPrivate: boolean; reviewers: string[]; items: PromiseItem[] };
type ListState = { k: "loading" } | { k: "error"; message: string } | { k: "ready"; data: ListData };

const POLL_MS = 30_000;
const now = () => Date.now();

async function getJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message ?? `Request failed (${r.status})`);
  return j;
}

export function LedgerView({ prRef, prUrl, viewer, returnTo }: { prRef: PrRef; prUrl: string; viewer: ViewerState; returnTo: string }) {
  const key = ledgerKey(prRef.owner, prRef.repo, prRef.number);
  const [list, setList] = useState<ListState>({ k: "loading" });
  const [reviewer, setReviewer] = useState<string>("");
  const [file, setFile] = useState(() => readLedger(key));
  const [checking, setChecking] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(new Map());
  const [needsConsent, setNeedsConsent] = useState(false);
  const consent = useRef(false);
  const [newHead, setNewHead] = useState<string | null>(null);
  const [autoRecheck, setAutoRecheck] = useState(true);
  const [tick, setTick] = useState(0);
  const queueRunning = useRef(false);

  const signedIn = viewer.status === "ready" && !!viewer.viewer;
  const q = `owner=${prRef.owner}&repo=${prRef.repo}&number=${prRef.number}`;

  useEffect(() => {
    let cancelled = false;
    getJson(`/api/ledger/list?${q}`)
      .then((data: ListData) => {
        if (cancelled) return;
        setList({ k: "ready", data });
        setNewHead(null);
      })
      .catch((e) => !cancelled && setList({ k: "error", message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [q, tick]);

  // Default the reviewer filter to the signed-in user when they reviewed this PR.
  const me = viewer.status === "ready" ? viewer.viewer?.login : undefined;
  const effectiveReviewer = reviewer || (list.k === "ready" && me && list.data.reviewers.includes(me) ? me : "");

  const headSha = list.k === "ready" ? list.data.headSha : null;
  useEffect(() => {
    if (!headSha) return;
    const t = setInterval(async () => {
      try {
        const j = await getJson(`/api/ledger/head?${q}`);
        if (j.headSha && j.headSha !== headSha) setNewHead(j.headSha);
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [q, headSha]);

  const items = useMemo(
    () => (list.k === "ready" ? list.data.items.filter((i) => !effectiveReviewer || i.author === effectiveReviewer) : []),
    [list, effectiveReviewer],
  );
  const verdicts = useMemo(() => new Map(Object.entries(file.verdicts).map(([k, v]) => [Number(k), v])), [file]);
  const overrides = useMemo(() => new Map(Object.entries(file.overrides).map(([k, v]) => [Number(k), v.status])), [file]);
  const score = useMemo(() => followThrough(items, verdicts, overrides), [items, verdicts, overrides]);

  const save = useCallback(
    (next: typeof file) => {
      writeLedger(key, next);
      setFile(next);
    },
    [key],
  );

  // Record this PR's follow-through for the cross-PR score.
  const prAuthor = list.k === "ready" ? list.data.prAuthor : null;
  useEffect(() => {
    if (list.k !== "ready" || !score.total || score.unchecked === score.total) return;
    upsertHistory({ pr: `${prRef.owner}/${prRef.repo}#${prRef.number}`, author: prAuthor, checkedAt: now(), ...score });
  }, [score, list.k, prAuthor, prRef]);

  const verify = useCallback(
    async (commentId: number): Promise<"ok" | "stop"> => {
      setChecking((s) => new Set(s).add(commentId));
      setErrors((m) => {
        const n = new Map(m);
        n.delete(commentId);
        return n;
      });
      try {
        const res = await fetch("/api/ledger/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: prRef, commentId, consentPrivate: consent.current }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 412 && j.consentRequired) {
          setNeedsConsent(true);
          return "stop";
        }
        if (!res.ok) {
          setErrors((m) => new Map(m).set(commentId, j.message ?? `Check failed (${res.status})`));
          return res.status === 401 || res.status === 429 ? "stop" : "ok";
        }
        setFile((f) => {
          const next = { ...f, verdicts: { ...f.verdicts, [commentId]: j as Verdict } };
          writeLedger(key, next);
          return next;
        });
        return "ok";
      } catch {
        setErrors((m) => new Map(m).set(commentId, "Couldn't reach the server."));
        return "ok";
      } finally {
        setChecking((s) => {
          const n = new Set(s);
          n.delete(commentId);
          return n;
        });
      }
    },
    [prRef, key],
  );

  // One at a time: free models allow ~20 requests/min and few per day.
  const runQueue = useCallback(
    async (ids: number[]) => {
      if (queueRunning.current) return;
      queueRunning.current = true;
      try {
        for (const id of ids) if ((await verify(id)) === "stop") break;
      } finally {
        queueRunning.current = false;
      }
    },
    [verify],
  );

  const pending = items.filter((i) => verdicts.get(i.commentId)?.headSha !== headSha).map((i) => i.commentId);

  // New commits: reload, then (optionally) re-check everything not yet kept.
  const reloadForNewHead = useCallback(() => setTick((t) => t + 1), []);
  const lastAutoHead = useRef<string | null>(null);
  useEffect(() => {
    if (!autoRecheck || !signedIn || !headSha || lastAutoHead.current === headSha) return;
    const prev = lastAutoHead.current;
    lastAutoHead.current = headSha;
    if (prev === null) return; // first load: don't spend quota automatically
    const toRecheck = items
      .filter((i) => {
        const st = overrides.get(i.commentId) ?? verdicts.get(i.commentId)?.status;
        return st && st !== "addressed";
      })
      .map((i) => i.commentId);
    void runQueue(toRecheck);
  }, [headSha, autoRecheck, signedIn, items, overrides, verdicts, runQueue]);

  const onReply = useCallback(
    async (commentId: number, body: string) => {
      try {
        const res = await fetch("/api/gh/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: prRef, commentId, body }),
        });
        const j = await res.json().catch(() => ({}));
        return res.ok ? ({ ok: true, url: j.htmlUrl } as const) : ({ ok: false, message: j.message ?? `Reply failed (${res.status})` } as const);
      } catch {
        return { ok: false, message: "Couldn't reach the server." } as const;
      }
    },
    [prRef],
  );

  if (list.k === "loading") return <p className="p-6 text-sm text-muted">Loading review requests…</p>;
  if (list.k === "error") {
    return (
      <p role="alert" className="p-6 text-sm text-danger">
        {list.message}
      </p>
    );
  }

  const history = aggregate(readHistory());
  const authorHistory = prAuthor ? aggregate(readHistory(), prAuthor) : null;
  const pct = (n: number) => `${score.total ? (n / score.total) * 100 : 0}%`;

  return (
    <section aria-label="Promise Ledger" className="flex flex-col gap-4 pb-10" data-testid="ledger">
      <header className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">Promise Ledger</h2>
          <p className="text-sm text-muted">Did the fixes actually land? Each review request, checked against the latest commit with quoted evidence.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Follow-through{prAuthor ? ` · ${prAuthor}` : ""}</p>
            <p data-testid="score" className="text-3xl font-semibold tabular-nums">
              {score.kept}
              <span className="text-lg text-muted"> of {score.total} kept</span>
            </p>
          </div>
          <dl className="flex gap-4 text-sm">
            {(
              [
                ["Open", score.open, "unresolved"],
                ["Needs reply", score.needsReply, "reply_needed"],
                ["Unclear", score.unclear, "needs_human"],
              ] as const
            ).map(([label, n, s]) => (
              <div key={label}>
                <dt className="flex items-center gap-1.5 text-xs text-muted">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s as LedgerStatus].dot}`} />
                  {label}
                </dt>
                <dd className="tabular-nums">{n}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-muted">Not checked</dt>
              <dd className="tabular-nums">{score.unchecked}</dd>
            </div>
          </dl>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {list.data.reviewers.length > 1 && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                Reviewer
                <select
                  value={effectiveReviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  className="rounded-md border border-border-strong bg-bg px-2 py-1 text-text"
                >
                  <option value="">Everyone</option>
                  {list.data.reviewers.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {signedIn ? (
              <button
                type="button"
                data-testid="check-all"
                disabled={!pending.length || checking.size > 0}
                onClick={() => runQueue(pending)}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
              >
                {checking.size ? "Checking…" : pending.length ? `Check ${pending.length} request${pending.length === 1 ? "" : "s"}` : "All checked"}
              </button>
            ) : (
              <a href={loginHref(returnTo)} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-black">
                Sign in to run checks
              </a>
            )}
          </div>
        </div>
        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <span className="bg-emerald-400" style={{ width: pct(score.kept) }} />
          <span className="bg-rose-400" style={{ width: pct(score.open) }} />
          <span className="bg-violet-400" style={{ width: pct(score.needsReply) }} />
          <span className="bg-amber-400" style={{ width: pct(score.unclear) }} />
        </div>
        {history.prs > 1 && (
          <p data-testid="history" className="mt-3 text-xs text-muted">
            Across {history.prs} PRs you&apos;ve checked: {history.kept} of {history.total} requests kept
            {authorHistory && authorHistory.prs > 1 ? ` · ${prAuthor}: ${authorHistory.kept} of ${authorHistory.total} over ${authorHistory.prs} PRs` : ""}.
          </p>
        )}
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={autoRecheck} onChange={(e) => setAutoRecheck(e.target.checked)} />
          When new commits arrive, re-check everything not yet kept
        </label>
      </header>

      {newHead && (
        <div role="status" data-testid="new-commits" className="flex items-center gap-3 rounded-xl border border-accent/50 bg-accent-soft p-3 text-sm">
          New commits were pushed ({headSha?.slice(0, 7)} → {newHead.slice(0, 7)}).
          <button type="button" onClick={reloadForNewHead} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-black">
            Load and {autoRecheck ? "re-check" : "review"}
          </button>
        </div>
      )}

      {needsConsent && (
        <div role="alertdialog" aria-label="Send private code to AI?" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="mb-2">
            This is a <b>private</b> repository. Checking sends your comment, the changed code around it and thread replies to an AI model via OpenRouter (free-tier providers may log prompts).
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                consent.current = true;
                setNeedsConsent(false);
                void runQueue(pending);
              }}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-black"
            >
              I understand, check it
            </button>
            <button type="button" onClick={() => setNeedsConsent(false)} className="rounded-md px-3 py-1 text-xs text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
          No review requests on this PR yet{effectiveReviewer ? ` from ${effectiveReviewer}` : ""}. Publish a review first, then come back after the next commit.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((i) => (
            <PromiseRow
              key={i.commentId}
              item={i}
              verdict={verdicts.get(i.commentId)}
              override={file.overrides[i.commentId]}
              headSha={headSha!}
              prUrl={prUrl}
              checking={checking.has(i.commentId)}
              error={errors.get(i.commentId) ?? null}
              canCheck={signedIn}
              canReply={signedIn}
              onCheck={() => runQueue([i.commentId])}
              onOverride={(s) => {
                const overridesNext = { ...file.overrides };
                if (s) overridesNext[i.commentId] = { status: s, note: "", at: now() };
                else delete overridesNext[i.commentId];
                save({ ...file, overrides: overridesNext });
              }}
              onReply={(body) => onReply(i.commentId, body)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
