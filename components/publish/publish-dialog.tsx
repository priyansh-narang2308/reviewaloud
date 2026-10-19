"use client";

import { useEffect, useRef, useState } from "react";
import { TYPE_STYLE } from "@/components/cards/comment-card";
import { loginHref, type ViewerState } from "@/components/auth/use-viewer";
import type { Anchor } from "@/lib/diff/anchors";
import type { PrRef } from "@/lib/github/pr";
import { type DraftReviewRecord, publishedKey, readDraftRecord, writeDraftRecord } from "@/lib/store/published-store";
import type { Card } from "@/lib/store/review-store";
import { describeAnchor } from "@/lib/workspace/selection";
import { useDemo } from "@/components/demo/demo-context";

type ApiError = { code: string; message: string; installUrl?: string | null; reviewId?: number; htmlUrl?: string; outdated?: { cardId: string; reason: string }[]; moved?: { cardId: string; anchor: Anchor }[] };

type Phase =
  | { k: "preview" }
  | { k: "working"; label: string }
  | { k: "moved"; moved: { cardId: string; anchor: Anchor }[] }
  | { k: "pending_exists"; reviewId: number; htmlUrl: string }
  | { k: "draft"; record: DraftReviewRecord }
  | { k: "confirm"; record: DraftReviewRecord; event: "COMMENT" | "REQUEST_CHANGES" }
  | { k: "submitted"; htmlUrl: string; count: number; alreadySubmitted: boolean };

type Props = {
  open: boolean;
  onClose: () => void;
  prRef: PrRef;
  repoLabel: string;
  prAuthor: string | null;
  cards: Card[];
  outdatedIds: ReadonlySet<string>;
  viewer: ViewerState;
  returnTo: string;
  onApplyMoved: (moved: { cardId: string; anchor: Anchor }[]) => void;
  onSubmitted: (cardIds: string[]) => void;
  onJump: (card: Card) => void;
};

const now = () => Date.now();

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Demo: same flow, no network. Responses mirror the real API's shapes. */
async function simulate(url: string, body: { comments?: { cardId: string }[] }, source: string) {
  await new Promise((r) => setTimeout(r, 450));
  if (url.endsWith("/create")) {
    return { ok: true as const, json: { reviewId: 1, state: "PENDING", htmlUrl: source, commitId: "demo", cardIds: (body.comments ?? []).map((c) => c.cardId), moved: [] } };
  }
  if (url.endsWith("/submit")) return { ok: true as const, json: { state: "COMMENTED", htmlUrl: source, alreadySubmitted: false } };
  return { ok: true as const, json: { ok: true } };
}

async function post(url: string, body: unknown): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, json };
    return { ok: false, error: { code: json.code ?? "unknown", message: json.message ?? `Request failed (${res.status})`, ...json } };
  } catch {
    return { ok: false, error: { code: "network", message: "Couldn't reach the ReviewAloud server. Your drafts are kept." } };
  }
}

export function PublishDialog(props: Props) {
  const { open, onClose, prRef, cards, outdatedIds, viewer } = props;
  const demo = useDemo();
  const send = (url: string, body: Record<string, unknown>) => (demo ? simulate(url, body as { comments?: { cardId: string }[] }, demo.source) : post(url, body));
  const ref = useRef<HTMLDialogElement>(null);
  const key = publishedKey(prRef.owner, prRef.repo, prRef.number) + (demo ? ":demo" : "");
  const [phase, setPhase] = useState<Phase>({ k: "preview" });
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [serverOutdated, setServerOutdated] = useState<{ cardId: string; reason: string }[]>([]);
  const busy = phase.k === "working";
  // Synchronous lock: a fast double-click can fire before React re-renders.
  const inflight = useRef(false);
  const once = async (fn: () => Promise<void>) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      await fn();
    } finally {
      inflight.current = false;
    }
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Resume an existing GitHub draft instead of creating another.
      const rec = readDraftRecord(storage(), key);
      setPhase(rec ? { k: "draft", record: rec } : { k: "preview" });
      setError(null);
      setServerOutdated([]);
    }
    if (!open && d.open) d.close();
  }, [open, key]);

  const signedIn = viewer.status === "ready" && !!viewer.viewer;
  const isAuthor = signedIn && viewer.status === "ready" && viewer.viewer?.login === props.prAuthor;
  const blocked = cards.filter((c) => outdatedIds.has(c.id));
  const publishable = cards.filter((c) => !outdatedIds.has(c.id));

  async function createDraft(confirmMoved = false) {
    setError(null);
    setPhase({ k: "working", label: "Creating draft review on GitHub…" });
    const r = await send("/api/gh/review/create", {
      ref: prRef,
      summary,
      confirmMoved,
      comments: publishable.map((c) => ({ cardId: c.id, anchor: c.anchor, body: c.body, type: c.type })),
    });
    if (r.ok) {
      const moved = (r.json.moved as { cardId: string; anchor: Anchor }[]) ?? [];
      if (moved.length) props.onApplyMoved(moved);
      const record: DraftReviewRecord = {
        reviewId: r.json.reviewId as number,
        htmlUrl: r.json.htmlUrl as string,
        cardIds: r.json.cardIds as string[],
        commitId: r.json.commitId as string,
        createdAt: now(),
      };
      writeDraftRecord(storage(), key, record);
      setPhase({ k: "draft", record });
      return;
    }
    const e = r.error;
    if (e.code === "moved" && e.moved) return setPhase({ k: "moved", moved: e.moved });
    if (e.code === "pending_exists" && e.reviewId && e.htmlUrl) return setPhase({ k: "pending_exists", reviewId: e.reviewId, htmlUrl: e.htmlUrl });
    if (e.code === "outdated" && e.outdated) setServerOutdated(e.outdated);
    setError(e);
    setPhase({ k: "preview" });
  }

  async function submit(record: DraftReviewRecord, event: "COMMENT" | "REQUEST_CHANGES") {
    setError(null);
    setPhase({ k: "working", label: "Submitting review…" });
    const r = await send("/api/gh/review/submit", { ref: prRef, reviewId: record.reviewId, event, body: summary || undefined });
    if (!r.ok) {
      setError(r.error);
      return setPhase({ k: "draft", record });
    }
    writeDraftRecord(storage(), key, null);
    props.onSubmitted(record.cardIds);
    setPhase({ k: "submitted", htmlUrl: r.json.htmlUrl as string, count: record.cardIds.length, alreadySubmitted: !!r.json.alreadySubmitted });
  }

  async function discard(reviewId: number) {
    setError(null);
    setPhase({ k: "working", label: "Discarding the draft on GitHub…" });
    const r = await send("/api/gh/review/discard", { ref: prRef, reviewId });
    if (!r.ok) {
      setError(r.error);
      const rec = readDraftRecord(storage(), key);
      return setPhase(rec ? { k: "draft", record: rec } : { k: "preview" });
    }
    writeDraftRecord(storage(), key, null);
    setPhase({ k: "preview" });
  }

  const cardById = new Map(cards.map((c) => [c.id, c]));

  return (
    <dialog
      ref={ref}
      aria-labelledby="publish-title"
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="m-auto w-full max-w-2xl rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="border-b border-border px-5 py-4">
          <h2 id="publish-title" className="text-base font-semibold">
            Publish review · <span className="font-mono text-muted">{props.repoLabel}#{prRef.number}</span>
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm" data-testid="publish-body">
          {error && (
            <div role="alert" data-testid="publish-error" className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
              <p>{error.message}</p>
              {error.code === "signed_out" && (
                <a className="mt-1 inline-block text-accent underline" href={loginHref(props.returnTo)}>
                  Sign in with GitHub
                </a>
              )}
              {error.installUrl && (
                <a className="mt-1 inline-block text-accent underline" href={error.installUrl} target="_blank" rel="noreferrer">
                  Install the ReviewAloud GitHub App on this repository ↗
                </a>
              )}
            </div>
          )}

          {(phase.k === "preview" || phase.k === "working") && (
            <>
              {blocked.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" data-testid="publish-blocked">
                  <p className="mb-1 font-medium">{blocked.length} comment(s) no longer match this diff and won&apos;t be published:</p>
                  <ul className="list-inside list-disc text-muted">
                    {blocked.map((c) => (
                      <li key={c.id}>
                        <span className="font-mono">{describeAnchor(c.anchor)}</span> “{c.body.slice(0, 60)}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {serverOutdated.length > 0 && (
                <ul className="mb-4 space-y-1 text-xs text-danger" data-testid="server-outdated">
                  {serverOutdated.map((o) => (
                    <li key={o.cardId}>
                      {cardById.get(o.cardId)?.body.slice(0, 50) ?? o.cardId}: {o.reason}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mb-2 text-muted">
                {publishable.length} comment{publishable.length === 1 ? "" : "s"} will be created as a <b className="text-text">draft review</b>. Only you can see it on GitHub until you submit.
              </p>
              <ol className="mb-4 space-y-2" data-testid="publish-list">
                {publishable.map((c) => (
                  <li key={c.id} className="rounded-lg border border-border bg-bg p-2.5">
                    <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-faint">
                      <button type="button" className="hover:text-text" onClick={() => props.onJump(c)}>
                        {c.anchor.path} <span className="text-accent">{describeAnchor(c.anchor)}</span>
                      </button>
                      {c.type && <span className={`rounded-full border px-1.5 font-sans ${TYPE_STYLE[c.type].cls}`}>{TYPE_STYLE[c.type].label}</span>}
                    </div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ol>
              <label htmlFor="review-summary" className="mb-1 block text-xs text-muted">
                Overall summary (optional, dictation works here too)
              </label>
              <textarea
                id="review-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                className="block w-full resize-y rounded-lg border border-border-strong bg-bg px-3 py-2"
              />
            </>
          )}

          {phase.k === "moved" && (
            <div data-testid="publish-moved">
              <p className="mb-2">New commits were pushed. These comments will be placed on their lines&apos; new positions:</p>
              <ul className="mb-2 space-y-1 font-mono text-xs">
                {phase.moved.map((m) => (
                  <li key={m.cardId}>
                    {cardById.get(m.cardId) && describeAnchor(cardById.get(m.cardId)!.anchor)} → <span className="text-accent">{describeAnchor(m.anchor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {phase.k === "pending_exists" && (
            <div data-testid="publish-pending-exists">
              <p className="mb-2">You already have an unsubmitted draft review on this pull request (GitHub allows one per person).</p>
              <a href={phase.htmlUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                View it on GitHub ↗
              </a>
            </div>
          )}

          {(phase.k === "draft" || phase.k === "confirm") && (
            <div data-testid="publish-draft">
              {demo ? (
                <>
                  <p className="mb-1 font-medium">Simulated draft review · {phase.record.cardIds.length} comment(s)</p>
                  <p className="mb-2 text-muted">Demo: nothing was sent to GitHub. In the live app this creates a pending review only you can see.</p>
                </>
              ) : (
                <>
                  <p className="mb-1 font-medium">Draft review created on GitHub · {phase.record.cardIds.length} comment(s)</p>
                  <p className="mb-2 text-muted">It&apos;s only visible to you until you submit it.</p>
                  <a href={phase.record.htmlUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                    Check it on GitHub ↗
                  </a>
                </>
              )}
              {phase.k === "confirm" && (
                <p role="alert" data-testid="publish-confirm" className="mt-4 rounded-lg border border-accent/50 bg-accent-soft p-3">
                  This publishes {phase.record.cardIds.length} comment(s) on <b>{props.repoLabel}#{prRef.number}</b> as{" "}
                  <b>{phase.event === "COMMENT" ? "a comment review" : "Request changes"}</b>. Everyone with access will see it.
                </p>
              )}
            </div>
          )}

          {phase.k === "submitted" && (
            <div data-testid="publish-submitted">
              <p className="mb-2 font-medium">
                {demo
                  ? `Simulated: review with ${phase.count} comment(s) would now be public on GitHub.`
                  : phase.alreadySubmitted
                    ? "This review was already submitted."
                    : `Review submitted with ${phase.count} comment(s).`}
              </p>
              <a href={phase.htmlUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                {demo ? "See the real sandbox PR (reviewed with ReviewAloud) ↗" : "Open the review on GitHub ↗"}
              </a>
            </div>
          )}

          {phase.k === "working" && (
            <p role="status" className="mt-3 text-muted">
              {phase.label}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3 text-sm">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1.5 text-muted hover:text-text disabled:opacity-40">
            Close
          </button>
          <span className="ml-auto flex flex-wrap gap-2">
            {(phase.k === "preview" || phase.k === "working") &&
              (signedIn || demo ? (
                <button
                  type="button"
                  disabled={busy || publishable.length === 0}
                  onClick={() => once(() => createDraft(false))}
                  className="rounded-lg bg-accent px-4 py-1.5 font-medium text-black disabled:opacity-40"
                >
                  {demo ? "Create draft (simulated)" : "Create draft on GitHub"}
                </button>
              ) : (
                <a href={loginHref(props.returnTo)} className="rounded-lg bg-accent px-4 py-1.5 font-medium text-black">
                  Sign in with GitHub to publish
                </a>
              ))}
            {phase.k === "moved" && (
              <>
                <button type="button" onClick={() => setPhase({ k: "preview" })} className="rounded-lg px-3 py-1.5 text-muted hover:text-text">
                  Back
                </button>
                <button type="button" onClick={() => once(() => createDraft(true))} className="rounded-lg bg-accent px-4 py-1.5 font-medium text-black">
                  Publish at new positions
                </button>
              </>
            )}
            {phase.k === "pending_exists" && (
              <>
                <button type="button" onClick={() => once(() => discard(phase.reviewId))} className="rounded-lg border border-border-strong px-3 py-1.5 hover:bg-surface-2">
                  Discard that draft
                </button>
              </>
            )}
            {phase.k === "draft" && (
              <>
                <button type="button" onClick={() => once(() => discard(phase.record.reviewId))} className="rounded-lg px-3 py-1.5 text-muted hover:text-text">
                  Discard draft
                </button>
                <button
                  type="button"
                  disabled={isAuthor}
                  title={isAuthor ? "GitHub doesn't allow requesting changes on your own pull request" : undefined}
                  onClick={() => setPhase({ k: "confirm", record: phase.record, event: "REQUEST_CHANGES" })}
                  className="rounded-lg border border-border-strong px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40"
                >
                  Submit: request changes
                </button>
                <button
                  type="button"
                  onClick={() => setPhase({ k: "confirm", record: phase.record, event: "COMMENT" })}
                  className="rounded-lg bg-accent px-4 py-1.5 font-medium text-black"
                >
                  Submit: comment
                </button>
              </>
            )}
            {phase.k === "confirm" && (
              <>
                <button type="button" onClick={() => setPhase({ k: "draft", record: phase.record })} className="rounded-lg px-3 py-1.5 text-muted hover:text-text">
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => once(() => submit(phase.record, phase.event))}
                  className="rounded-lg bg-accent px-4 py-1.5 font-medium text-black disabled:opacity-40"
                >
                  Yes, submit publicly
                </button>
              </>
            )}
          </span>
        </footer>
      </div>
    </dialog>
  );
}
