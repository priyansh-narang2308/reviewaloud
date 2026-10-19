"use client";

import { Fragment, memo, useEffect, useRef, useState } from "react";
import { CommentCard } from "@/components/cards/comment-card";
import type { DiffLine } from "@/lib/diff/parse";
import type { Card } from "@/lib/store/review-store";
import { highlightLines, type LineTokens } from "@/lib/highlight/shiki";
import type { WorkspaceFile } from "@/lib/workspace/types";

const COLLAPSE_OVER = 1500;

const STATUS_LABEL: Record<string, string> = {
  added: "Added",
  removed: "Deleted",
  modified: "Modified",
  renamed: "Renamed",
  copied: "Copied",
  changed: "Changed",
  unchanged: "Unchanged",
};

type Props = {
  file: WorkspaceFile;
  fileIndex: number;
  /** Selected display-index range in this file, if any. */
  selected: { from: number; to: number } | null;
  /** Draft comments keyed by the display index of their (last) anchored line. */
  cardsByIdx?: ReadonlyMap<number, Card[]>;
  onSelect: (path: string, idx: number, extend: boolean) => void;
  githubUrl: string;
};

function useHighlight(file: WorkspaceFile, enabled: boolean) {
  const [tokens, setTokens] = useState<LineTokens[] | null>(null);
  useEffect(() => {
    if (!enabled || !file.parsed) return;
    let cancelled = false;
    highlightLines(file.path, file.parsed.lines.map((l) => l.text))
      .then((t) => !cancelled && setTokens(t))
      .catch(() => {}); // plain text on failure
    return () => {
      cancelled = true;
    };
  }, [enabled, file]);
  return tokens;
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

export const FileDiff = memo(function FileDiff({ file, fileIndex, selected, cardsByIdx, onSelect, githubUrl }: Props) {
  const lineCount = file.parsed?.lines.length ?? 0;
  const [expanded, setExpanded] = useState(lineCount <= COLLAPSE_OVER);
  const [ref, inView] = useInView<HTMLElement>();
  const tokens = useHighlight(file, inView && expanded);
  const renamed = file.previousPath && file.previousPath !== file.path;

  return (
    <section
      ref={ref}
      id={`file-${fileIndex}`}
      data-path={file.path}
      aria-label={file.path}
      className="diff-file overflow-hidden rounded-lg border border-border bg-surface"
    >
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface-2/95 px-4 py-2 backdrop-blur">
        <span className="rounded border border-border px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">
          {STATUS_LABEL[file.status] ?? file.status}
        </span>
        <h3 className="min-w-0 truncate font-mono text-[13px]">
          {renamed && <span className="text-muted">{file.previousPath} → </span>}
          {file.path}
        </h3>
        <span className="ml-auto shrink-0 font-mono text-xs">
          <span className="text-emerald-400">+{file.additions}</span>{" "}
          <span className="text-rose-400">−{file.deletions}</span>
        </span>
      </header>

      {!file.parsed ? (
        <p className="px-4 py-6 text-sm text-muted">
          {file.parseError
            ? `This diff couldn't be read (${file.parseError}).`
            : "No diff to show: binary file, pure rename, or too large for GitHub to send."}{" "}
          <a className="text-accent underline underline-offset-2" href={githubUrl} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </p>
      ) : !expanded ? (
        <div className="flex items-center justify-between px-4 py-6 text-sm text-muted">
          <span>Large diff: {lineCount.toLocaleString()} lines.</span>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-md border border-border-strong px-3 py-1 text-text hover:bg-surface-2"
          >
            Load diff
          </button>
        </div>
      ) : (
        <div role="grid" aria-label={`Diff of ${file.path}`} className="overflow-x-auto font-mono text-[12.5px] leading-[20px]">
          {file.parsed.hunks.map((h) => (
            <div key={h.idx} role="rowgroup">
              <div role="row" className="flex bg-[var(--hunk-bg)] text-muted">
                <span role="gridcell" className="w-[88px] shrink-0" />
                <span role="gridcell" className="truncate px-3 py-1">
                  {h.header}
                </span>
              </div>
              {file.parsed!.lines.slice(h.lineRange[0], h.lineRange[1] + 1).map((l) => {
                const cards = cardsByIdx?.get(l.idx);
                return (
                  <Fragment key={l.idx}>
                    <Row
                      line={l}
                      tokens={tokens?.[l.idx]}
                      selected={!!selected && l.idx >= selected.from && l.idx <= selected.to}
                      marked={!!cards}
                      onSelect={(extend) => onSelect(file.path, l.idx, extend)}
                    />
                    {cards && (
                      <div role="row" className="border-y border-border bg-bg px-3 py-2 sm:pl-[108px]">
                        <div role="gridcell" className="flex max-w-3xl flex-col gap-2">
                          {cards.map((c) => (
                            <CommentCard key={c.id} card={c} />
                          ))}
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
});

const Row = memo(function Row({
  line,
  tokens,
  selected,
  marked,
  onSelect,
}: {
  line: DiffLine;
  tokens: LineTokens | undefined;
  selected: boolean;
  marked: boolean;
  onSelect: (extend: boolean) => void;
}) {
  const sign = line.kind === "add" ? "+" : line.kind === "del" ? "−" : " ";
  const label = `${line.kind === "add" ? "Added" : line.kind === "del" ? "Deleted" : "Unchanged"} line ${
    line.kind === "del" ? line.oldNo : line.newNo
  }`;
  return (
    <div
      role="row"
      data-kind={line.kind}
      data-idx={line.idx}
      aria-selected={selected}
      data-marked={marked || undefined}
      className="diff-row group flex min-w-max cursor-pointer hover:brightness-125"
      onClick={(e) => onSelect(e.shiftKey)}
    >
      <span role="gridcell" className="diff-gutter flex w-[88px] shrink-0 select-none text-right text-faint">
        <span className="w-10 pr-2">{line.oldNo ?? ""}</span>
        <span className="w-10 pr-2">{line.newNo ?? ""}</span>
      </span>
      {marked && <span className="sr-only">Has a draft comment.</span>}
      <span role="gridcell" className="w-5 shrink-0 select-none text-center text-faint">
        <button
          type="button"
          aria-label={`Select ${label}`}
          className="w-full opacity-0 focus:opacity-100 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(e.shiftKey);
          }}
        >
          {sign === " " ? "·" : sign}
        </button>
      </span>
      <span role="gridcell" className="whitespace-pre pr-6">
        {tokens ? tokens.map((t, i) => <span key={i} style={{ color: t.color }}>{t.content}</span>) : line.text}
        {line.noNewlineAtEof && <span className="ml-2 text-faint" title="No newline at end of file">⏎̸</span>}
      </span>
    </div>
  );
});
