"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AuthControl } from "@/components/auth/auth-control";
import { useViewer } from "@/components/auth/use-viewer";
import { CapturePanel } from "@/components/capture/capture-panel";
import { PublishDialog } from "@/components/publish/publish-dialog";
import { useReviewStore } from "@/components/capture/use-review-store";
import { type CardActions, CardActionsContext, type TidyState } from "@/components/cards/card-actions";
import { DraftsList } from "@/components/cards/drafts-list";
import { FileDiff } from "@/components/diff/file-diff";
import { validateAnchor } from "@/lib/diff/anchors";
import type { Card, CaptureSource } from "@/lib/store/review-store";
import { PROBLEM_TEXT, type Selection, describeAnchor, nextSelection, selectionToAnchor } from "@/lib/workspace/selection";
import type { WorkspaceData } from "@/lib/workspace/types";
import { FileTree } from "./file-tree";
import { Kbd } from "./kbd";
import { PrHeader } from "./pr-header";
import { ShortcutsDialog } from "./shortcuts";

const noopSubscribe = () => () => {};

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function Workspace({ data, aiEnabled }: { data: WorkspaceData; aiEnabled: boolean }) {
  const { pr, files } = data;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [currentFile, setCurrentFile] = useState(0);
  // Bumped on mouse selection: moves focus to the capture field so Wispr Flow
  // pastes there. Keyboard (j/k) selection doesn't steal focus.
  const [focusRequest, setFocusRequest] = useState(0);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [tidy, setTidy] = useState<ReadonlyMap<string, TidyState>>(new Map());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [viewer, refreshViewer] = useViewer();
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const [store, review] = useReviewStore(data.ref);
  // Marks when event handlers are live (used by e2e tests to avoid racing hydration).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const fileByPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const result = useMemo(() => {
    if (!selection) return null;
    const parsed = fileByPath.get(selection.path)?.parsed;
    return parsed ? selectionToAnchor(selection, parsed, pr.headSha) : null;
  }, [selection, fileByPath, pr.headSha]);

  const selectedRange = useMemo(
    () => (result?.ok ? { from: result.fromIdx, to: result.toIdx } : null),
    [result],
  );

  // Cards grouped by file and display index; cards whose anchor no longer
  // matches this diff are listed as outdated (handled before publishing).
  const { cardsByFile, outdated } = useMemo(() => {
    const byFile = new Map<string, Map<number, Card[]>>();
    const stale = new Set<string>();
    for (const c of review.cards) {
      const parsed = fileByPath.get(c.anchor.path)?.parsed;
      const v = parsed && validateAnchor(c.anchor, parsed);
      if (!v || !v.ok) {
        stale.add(c.id);
        continue;
      }
      const m = byFile.get(c.anchor.path) ?? new Map<number, Card[]>();
      m.set(v.line.idx, [...(m.get(v.line.idx) ?? []), c]);
      byFile.set(c.anchor.path, m);
    }
    return { cardsByFile: byFile, outdated: stale };
  }, [review.cards, fileByPath]);

  const onSelect = useCallback(
    (path: string, idx: number, extend: boolean) => {
      setSelection((prev) => nextSelection(prev, path, idx, extend));
      const i = files.findIndex((f) => f.path === path);
      if (i >= 0) setCurrentFile(i);
      setFocusRequest((n) => n + 1);
    },
    [files],
  );

  useEffect(() => {
    if (focusRequest && !movingId) captureRef.current?.focus({ preventScroll: true });
  }, [focusRequest, movingId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const goToFile = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(files.length - 1, i));
      setCurrentFile(clamped);
      document.getElementById(`file-${clamped}`)?.scrollIntoView({ block: "start" });
    },
    [files.length],
  );

  const moveTo = useCallback(
    (file: number, idx: number, extend: boolean) => {
      const f = files[file];
      setSelection((prev) => nextSelection(prev, f.path, idx, extend));
      document.querySelector(`#file-${file} [data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
    },
    [files],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      // Let open dialogs handle their own keys (Esc closes them natively).
      if (document.querySelector("dialog[open]")) return;
      const file = files[currentFile];
      const lines = file?.parsed?.lines;
      const at = selection?.path === file?.path ? selection.focusIdx : -1;
      if (e.key === "]") goToFile(currentFile + 1);
      else if (e.key === "[") goToFile(currentFile - 1);
      else if (e.key === "?") setShowShortcuts(true);
      else if (e.key === "Escape") {
        if (movingId) setMovingId(null);
        else setSelection(null);
      } else if ((e.key === "c" || e.key === "Enter") && !movingId) captureRef.current?.focus({ preventScroll: true });
      else if ((e.key === "j" || e.key === "k" || e.key === "J" || e.key === "K") && lines?.length) {
        const down = e.key.toLowerCase() === "j";
        moveTo(currentFile, Math.max(0, Math.min(lines.length - 1, at + (down ? 1 : -1))), e.shiftKey);
      } else if ((e.key === "n" || e.key === "p") && file?.parsed?.hunks.length) {
        const starts = file.parsed.hunks.map((h) => h.lineRange[0]);
        const target = e.key === "n" ? starts.find((s) => s > at) : [...starts].reverse().find((s) => s < at);
        if (target !== undefined) moveTo(currentFile, target, false);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentFile, files, goToFile, moveTo, selection, movingId]);

  const onSave = useCallback(
    (body: string, source: CaptureSource) => {
      if (!result?.ok) return;
      store.add({ anchor: result.anchor, body, source });
      setSelection(null);
      captureRef.current?.blur();
    },
    [result, store],
  );

  const runTidy = useCallback(async (card: Card) => {
    setTidy((m) => new Map(m).set(card.id, { status: "loading" }));
    let next: TidyState;
    try {
      const res = await fetch("/api/ai/tidy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: card.body,
          path: card.anchor.path,
          lineText: card.anchor.lineText,
          startLineText: card.anchor.startLineText,
        }),
      });
      const json = await res.json().catch(() => ({}));
      next = res.ok
        ? { status: "proposal", body: json.body, type: json.type ?? null, model: json.model }
        : { status: "error", message: json.error ?? `Tidy failed (${res.status})` };
    } catch {
      next = { status: "error", message: "Couldn't reach the server." };
    }
    setTidy((m) => new Map(m).set(card.id, next));
  }, []);

  const actions = useMemo<CardActions>(
    () => ({
      update: (id, patch) => store.update(id, patch),
      remove: (id) => {
        store.remove(id);
        setToast("Comment deleted");
      },
      startMove: (id) => {
        setMovingId((cur) => (cur === id ? null : id));
        setSelection(null);
      },
      tidy: aiEnabled ? runTidy : null,
      tidyState: (id) => tidy.get(id),
      resolveTidy: (id, accept) => {
        const t = tidy.get(id);
        if (accept && t?.status === "proposal") store.update(id, { body: t.body, ...(t.type ? { type: t.type } : {}) });
        setTidy((m) => {
          const n = new Map(m);
          n.delete(id);
          return n;
        });
      },
      movingId,
    }),
    [store, aiEnabled, runTidy, tidy, movingId],
  );

  const jumpToCard = useCallback(
    (card: Card) => {
      const i = files.findIndex((f) => f.path === card.anchor.path);
      if (i >= 0) setCurrentFile(i);
      const el = document.querySelector(`[data-card-id="${card.id}"]`);
      (el ?? document.getElementById(`file-${i}`))?.scrollIntoView({ block: "center" });
    },
    [files],
  );

  const moving = movingId ? review.cards.find((c) => c.id === movingId) : undefined;
  const returnTo = `/pr/${data.ref.owner}/${data.ref.repo}/${data.ref.number}`;
  // Shown once after an OAuth redirect; read client-side only.
  const authError = hydrated ? new URLSearchParams(window.location.search).get("auth_error") : null;
  const githubFilesUrl = `${pr.htmlUrl}/files`;

  return (
    <CardActionsContext.Provider value={actions}>
      <div className="flex min-h-screen flex-col" data-hydrated={hydrated || undefined}>
        <PrHeader
          pr={pr}
          fileCount={files.length}
          right={
            <>
              <AuthControl state={viewer} returnTo={returnTo} onSignedOut={refreshViewer} />
              <button
                type="button"
                data-testid="open-publish"
                disabled={review.cards.length === 0}
                onClick={() => setPublishOpen(true)}
                className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-black disabled:opacity-40"
              >
                Publish review{review.cards.length ? ` (${review.cards.length})` : ""}
              </button>
            </>
          }
        />
        {authError && (
          <p role="alert" className="border-b border-rose-500/30 bg-rose-500/10 px-6 py-2 text-sm">
            {authError}
          </p>
        )}
        {data.truncated && (
          <p role="status" className="border-b border-border bg-surface-2 px-6 py-2 text-sm text-muted">
            GitHub lists at most 3,000 files per pull request; some files aren&apos;t shown.
          </p>
        )}
        <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-6 px-4 py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
          <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
            <FileTree files={files} current={currentFile} onPick={goToFile} />
            <DraftsList cards={review.cards} outdated={outdated} onJump={jumpToCard} />
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="mt-6 px-2 text-xs text-faint hover:text-muted"
            >
              Keyboard shortcuts <Kbd>?</Kbd>
            </button>
          </div>
          <main className="flex min-w-0 flex-col gap-4 pb-8">
            {files.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface p-8 text-center text-muted">
                This pull request has no changed files.
              </p>
            ) : (
              files.map((f, i) => (
                <FileDiff
                  key={f.path}
                  file={f}
                  fileIndex={i}
                  selected={selection?.path === f.path ? selectedRange : null}
                  cardsByIdx={cardsByFile.get(f.path)}
                  onSelect={onSelect}
                  githubUrl={githubFilesUrl}
                />
              ))
            )}
          </main>
        </div>

        {toast && (
          <div role="status" className="fixed bottom-28 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border-strong bg-surface-2 px-4 py-2 text-sm shadow-lg">
            {toast}
            {review.lastDeleted && (
              <button
                type="button"
                className="font-medium text-accent"
                onClick={() => {
                  store.undoRemove();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}

        {moving ? (
          <section aria-label="Move comment" className="sticky bottom-0 z-20 border-t border-accent/50 bg-surface/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 text-sm lg:px-6">
              <span data-testid="move-bar">
                Moving comment from <span className="font-mono text-muted">{describeAnchor(moving.anchor)}</span> →{" "}
                {result?.ok ? (
                  <span className="font-mono text-accent">
                    {result.anchor.path} {describeAnchor(result.anchor)}
                  </span>
                ) : result ? (
                  <span className="text-danger">{PROBLEM_TEXT[result.problem]}</span>
                ) : (
                  <span className="text-muted">click a line or shift-click a range</span>
                )}
              </span>
              <span className="ml-auto flex gap-2">
                <button type="button" onClick={() => setMovingId(null)} className="rounded-lg px-3 py-1.5 text-muted hover:text-text">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!result?.ok}
                  onClick={() => {
                    if (!result?.ok) return;
                    store.update(moving.id, { anchor: result.anchor });
                    setMovingId(null);
                    setSelection(null);
                  }}
                  className="rounded-lg bg-accent px-4 py-1.5 font-medium text-black disabled:opacity-40"
                >
                  Move here
                </button>
              </span>
            </div>
          </section>
        ) : (
          <CapturePanel
            ref={captureRef}
            anchor={result?.ok ? result.anchor : null}
            problem={result && !result.ok ? PROBLEM_TEXT[result.problem] : null}
            draftCount={review.cards.length}
            storageWarning={review.loadError}
            onSave={onSave}
            onExit={() => captureRef.current?.blur()}
          />
        )}
        <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        <PublishDialog
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          prRef={data.ref}
          repoLabel={pr.repoFullName}
          prAuthor={pr.author?.login ?? null}
          cards={review.cards}
          outdatedIds={outdated}
          viewer={viewer}
          returnTo={returnTo}
          onApplyMoved={(moved) => moved.forEach((m) => store.update(m.cardId, { anchor: m.anchor }))}
          onSubmitted={(ids) => ids.forEach((id) => store.remove(id))}
          onJump={(c) => {
            setPublishOpen(false);
            jumpToCard(c);
          }}
        />
      </div>
    </CardActionsContext.Provider>
  );
}
