"use client";

import type { Card } from "@/lib/store/review-store";
import { describeAnchor } from "@/lib/workspace/selection";
import { TYPE_STYLE } from "./comment-card";

export function DraftsList({
  cards,
  outdated,
  onJump,
}: {
  cards: Card[];
  /** Ids of cards whose anchor no longer matches the diff. */
  outdated: ReadonlySet<string>;
  onJump: (card: Card) => void;
}) {
  if (!cards.length) return null;
  return (
    <section aria-label="Draft comments" className="mt-6">
      <h2 className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted">
        Drafts <span className="text-faint">{cards.length}</span>
      </h2>
      <ol className="space-y-px" data-testid="drafts-list">
        {cards.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onJump(c)}
              className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
            >
              <span className="flex items-center gap-2 font-mono text-[11px] text-faint">
                <span className="truncate">{c.anchor.path.split("/").pop()}</span>
                <span className="text-accent">{describeAnchor(c.anchor)}</span>
                {c.type && <span className={`rounded-full border px-1.5 ${TYPE_STYLE[c.type].cls}`}>{TYPE_STYLE[c.type].label}</span>}
                {outdated.has(c.id) && <span className="text-danger">outdated</span>}
              </span>
              <span className="line-clamp-2 text-[13px] text-muted">{c.body}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
