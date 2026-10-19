"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FileDiff } from "@/components/diff/file-diff";
import {
  PROBLEM_TEXT,
  type Selection,
  describeAnchor,
  nextSelection,
  selectionToAnchor,
} from "@/lib/workspace/selection";
import type { WorkspaceData } from "@/lib/workspace/types";
import { FileTree } from "./file-tree";
import { PrHeader } from "./pr-header";

const noopSubscribe = () => () => {};

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function Workspace({ data }: { data: WorkspaceData }) {
  const { pr, files } = data;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [currentFile, setCurrentFile] = useState(0);
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

  const onSelect = useCallback((path: string, idx: number, extend: boolean) => {
    setSelection((prev) => nextSelection(prev, path, idx, extend));
    const i = files.findIndex((f) => f.path === path);
    if (i >= 0) setCurrentFile(i);
  }, [files]);

  const goToFile = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(files.length - 1, i));
    setCurrentFile(clamped);
    document.getElementById(`file-${clamped}`)?.scrollIntoView({ block: "start" });
  }, [files.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "]") goToFile(currentFile + 1);
      else if (e.key === "[") goToFile(currentFile - 1);
      else if (e.key === "Escape") setSelection(null);
      else if (e.key === "j" || e.key === "k") {
        const file = files[currentFile];
        const lines = file?.parsed?.lines;
        if (!lines?.length) return;
        const at = selection?.path === file.path ? selection.focusIdx : -1;
        const next = Math.max(0, Math.min(lines.length - 1, at + (e.key === "j" ? 1 : -1)));
        setSelection((prev) => nextSelection(prev, file.path, next, e.shiftKey));
        document
          .querySelector(`#file-${currentFile} [data-idx="${next}"]`)
          ?.scrollIntoView({ block: "nearest" });
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentFile, files, goToFile, selection]);

  const githubFilesUrl = `${pr.htmlUrl}/files`;

  return (
    <div className="flex min-h-screen flex-col" data-hydrated={hydrated || undefined}>
      <PrHeader pr={pr} fileCount={files.length} />
      {data.truncated && (
        <p role="status" className="border-b border-border bg-surface-2 px-6 py-2 text-sm text-muted">
          GitHub lists at most 3,000 files per pull request; some files aren&apos;t shown.
        </p>
      )}
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-6 px-4 py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
        <FileTree files={files} current={currentFile} onPick={goToFile} />
        <main className="flex min-w-0 flex-col gap-4 pb-24">
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
                onSelect={onSelect}
                githubUrl={githubFilesUrl}
              />
            ))
          )}
        </main>
      </div>

      <footer
        aria-live="polite"
        className="sticky bottom-0 z-20 border-t border-border bg-surface/95 px-6 py-3 text-sm backdrop-blur"
      >
        {!result ? (
          <span className="text-muted">
            Click a line to pin it · Shift-click to select a range · <Kbd>j</Kbd>/<Kbd>k</Kbd> lines ·{" "}
            <Kbd>[</Kbd>/<Kbd>]</Kbd> files
          </span>
        ) : result.ok ? (
          <span data-testid="selection">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" aria-hidden />
            Pinned <span className="font-mono">{result.anchor.path}</span>{" "}
            <span className="font-mono text-accent">{describeAnchor(result.anchor)}</span>
            <span className="text-muted"> · Esc to clear</span>
          </span>
        ) : (
          <span role="alert" data-testid="selection-error" className="text-danger">
            {PROBLEM_TEXT[result.problem]}
          </span>
        )}
      </footer>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-px font-mono text-[11px] text-text">
      {children}
    </kbd>
  );
}
