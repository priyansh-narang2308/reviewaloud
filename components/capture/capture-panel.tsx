"use client";

import { forwardRef, useState } from "react";
import type { Anchor } from "@/lib/diff/anchors";
import type { CaptureSource } from "@/lib/store/review-store";
import { describeAnchor } from "@/lib/workspace/selection";

type Status = "idle" | "received" | "typing" | "saved";

type Props = {
  anchor: Anchor | null;
  /** Explanation when the current selection can't be an anchor. */
  problem: string | null;
  draftCount: number;
  storageWarning: string | null;
  onSave: (body: string, source: CaptureSource) => void;
  /** Escape from the textarea: hand keyboard control back to the diff. */
  onExit: () => void;
};

/**
 * Pin & Speak capture. Wispr Flow inserts dictated text into the focused field
 * after the shortcut is released (via paste), so the anchor lives in app state
 * and this field only receives text. We never claim to know Wispr is listening.
 */
export const CapturePanel = forwardRef<HTMLTextAreaElement, Props>(function CapturePanel(
  { anchor, problem, draftCount, storageWarning, onSave, onExit },
  ref,
) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [sources, setSources] = useState<ReadonlySet<"paste" | "typed">>(new Set());
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const canSave = !!anchor && text.trim().length > 0;

  const save = () => {
    if (!canSave || !anchor) return;
    const source: CaptureSource = sources.size > 1 ? "mixed" : sources.has("paste") ? "paste" : "typed";
    onSave(text.trim(), source);
    setSavedTo(`${anchor.path} ${describeAnchor(anchor)}`);
    setText("");
    setSources(new Set());
    setStatus("saved");
  };

  const discard = () => {
    setText("");
    setSources(new Set());
    setStatus("idle");
  };

  let hint: React.ReactNode;
  if (problem) hint = <span data-testid="selection-error" className="text-danger">{problem}</span>;
  else if (status === "received" && anchor) hint = <>Text received · <b>⌘↵</b> to save</>;
  else if (status === "typing" && anchor) hint = <><b>⌘↵</b> to save</>;
  else if (text && !anchor) hint = <span className="text-accent">Pin a line to attach this comment, then press ⌘↵.</span>;
  else if (status === "saved" && savedTo) hint = <>Saved to <span className="font-mono">{savedTo}</span> · pin the next line</>;
  else if (anchor) hint = <>Dictate with Wispr Flow (hold your shortcut, speak, release) or type</>;
  else hint = <>Click a diff line to pin it · shift-click for a range</>;

  return (
    <section
      aria-label="Comment capture"
      className="sticky bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-3 lg:flex-row lg:items-start lg:gap-4 lg:px-6">
        <div className="flex shrink-0 items-center gap-2 lg:w-[280px] lg:pt-2">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${anchor ? "bg-accent shadow-[0_0_0_4px_var(--accent-soft)]" : "border border-border-strong"}`}
          />
          <span data-testid="capture-anchor" className="min-w-0 truncate font-mono text-[13px]">
            {anchor ? (
              <>
                {anchor.path} <span className="text-accent">{describeAnchor(anchor)}</span>
              </>
            ) : (
              <span className="text-muted">No line pinned</span>
            )}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor="capture" className="sr-only">
            Review comment for the pinned line
          </label>
          <textarea
            id="capture"
            ref={ref}
            data-testid="capture"
            value={text}
            rows={text.includes("\n") || text.length > 90 ? 4 : 2}
            placeholder={anchor ? "Speak or type your comment…" : "Pin a line first"}
            aria-describedby="capture-hint"
            className="block w-full resize-y rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm leading-relaxed placeholder:text-faint"
            onChange={(e) => {
              const it = (e.nativeEvent as InputEvent).inputType;
              const kind = it === "insertFromPaste" ? "paste" : "typed";
              setSources((s) => (s.has(kind) ? s : new Set(s).add(kind)));
              setStatus(kind === "paste" ? "received" : "typing");
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onExit();
              }
            }}
          />
          <p id="capture-hint" role="status" data-testid="capture-status" className="mt-1.5 text-xs text-muted">
            {hint}
          </p>
          {storageWarning && <p className="mt-1 text-xs text-danger">{storageWarning}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:pt-1">
          {text && (
            <button type="button" onClick={discard} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text">
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black enabled:hover:brightness-110 disabled:opacity-40"
          >
            Save comment
          </button>
          <span data-testid="draft-count" className="ml-2 whitespace-nowrap text-xs text-muted">
            {draftCount} {draftCount === 1 ? "draft" : "drafts"}
          </span>
        </div>
      </div>
    </section>
  );
});
