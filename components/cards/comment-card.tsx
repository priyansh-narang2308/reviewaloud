"use client";

import { memo, useState } from "react";
import { COMMENT_TYPES, type Card, type CommentType } from "@/lib/store/review-store";
import { describeAnchor } from "@/lib/workspace/selection";
import { useCardActions } from "./card-actions";

export const TYPE_STYLE: Record<CommentType, { label: string; cls: string }> = {
  blocking: { label: "Blocking", cls: "border-rose-500/50 text-rose-300 bg-rose-500/10" },
  suggestion: { label: "Suggestion", cls: "border-sky-500/50 text-sky-300 bg-sky-500/10" },
  question: { label: "Question", cls: "border-violet-500/50 text-violet-300 bg-violet-500/10" },
  nit: { label: "Nit", cls: "border-border-strong text-muted bg-surface-2" },
  praise: { label: "Praise", cls: "border-emerald-500/50 text-emerald-300 bg-emerald-500/10" },
};

const SOURCE_LABEL = { paste: "dictated / pasted", typed: "typed", mixed: "dictated + typed" } as const;

export const CommentCard = memo(function CommentCard({ card }: { card: Card }) {
  const actions = useCardActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.body);
  const tidy = actions.tidyState(card.id);
  const moving = actions.movingId === card.id;

  const saveEdit = () => {
    const body = draft.trim();
    if (body) actions.update(card.id, { body });
    setEditing(false);
  };

  return (
    <article
      data-testid="comment-card"
      data-card-id={card.id}
      aria-label={`Draft comment on ${card.anchor.path} ${describeAnchor(card.anchor)}`}
      className={`rounded-lg border bg-surface p-3 font-sans text-sm shadow-sm ${moving ? "border-accent" : "border-border-strong"}`}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="sr-only" htmlFor={`type-${card.id}`}>
          Comment type
        </label>
        <select
          id={`type-${card.id}`}
          data-testid="card-type"
          value={card.type ?? ""}
          onChange={(e) => actions.update(card.id, { type: (e.target.value || null) as CommentType | null })}
          className={`rounded-full border px-2 py-0.5 ${card.type ? TYPE_STYLE[card.type].cls : "border-dashed border-border-strong bg-transparent text-faint"}`}
        >
          <option value="">Add type</option>
          {COMMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_STYLE[t].label}
            </option>
          ))}
        </select>
        <span className="font-mono text-faint">{describeAnchor(card.anchor)}</span>
        <span className="text-faint">· {SOURCE_LABEL[card.source]}</span>
        <span className="ml-auto flex gap-1">
          {!editing && (
            <>
              <CardButton onClick={() => (setDraft(card.body), setEditing(true))}>Edit</CardButton>
              <CardButton onClick={() => actions.startMove(card.id)} pressed={moving}>
                {moving ? "Moving…" : "Move"}
              </CardButton>
              {actions.tidy && (
                <CardButton onClick={() => actions.tidy!(card)} disabled={tidy?.status === "loading"}>
                  {tidy?.status === "loading" ? "Tidying…" : "Tidy (AI)"}
                </CardButton>
              )}
              <CardButton onClick={() => actions.remove(card.id)} danger>
                Delete
              </CardButton>
            </>
          )}
        </span>
      </header>

      {editing ? (
        <div>
          <label className="sr-only" htmlFor={`edit-${card.id}`}>
            Edit comment
          </label>
          <textarea
            id={`edit-${card.id}`}
            data-testid="card-edit"
            autoFocus
            value={draft}
            rows={Math.min(8, Math.max(2, draft.split("\n").length + 1))}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                saveEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setEditing(false);
              }
            }}
            className="block w-full resize-y rounded-md border border-border-strong bg-bg px-2 py-1.5 leading-relaxed"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={saveEdit} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-black">
              Save (⌘↵)
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-md px-3 py-1 text-xs text-muted hover:text-text">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p data-testid="card-body" className="whitespace-pre-wrap leading-relaxed text-text">
          {card.body}
        </p>
      )}

      {tidy?.status === "error" && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {tidy.message}{" "}
          <button type="button" className="underline" onClick={() => actions.resolveTidy(card.id, false)}>
            Dismiss
          </button>
        </p>
      )}
      {tidy?.status === "proposal" && (
        <div data-testid="tidy-proposal" className="mt-3 rounded-md border border-accent/40 bg-accent-soft p-2">
          <p className="mb-1 text-xs text-muted">
            Suggested wording · AI ({tidy.model}) · review before accepting
            {tidy.type && tidy.type !== card.type && (
              <>
                {" "}
                · type: <b>{TYPE_STYLE[tidy.type].label}</b>
              </>
            )}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">{tidy.body}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => actions.resolveTidy(card.id, true)}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-black"
            >
              Use suggestion
            </button>
            <button
              type="button"
              onClick={() => actions.resolveTidy(card.id, false)}
              className="rounded-md px-3 py-1 text-xs text-muted hover:text-text"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}
    </article>
  );
});

function CardButton({
  children,
  onClick,
  danger,
  pressed,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`rounded px-2 py-0.5 text-xs hover:bg-surface-2 disabled:opacity-50 ${danger ? "text-rose-300" : "text-muted hover:text-text"}`}
    >
      {children}
    </button>
  );
}
