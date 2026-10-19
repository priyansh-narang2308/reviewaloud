import { z } from "zod";
import type { Anchor } from "@/lib/diff/anchors";

// Draft review comments for one PR, persisted in localStorage. Keyed by PR
// (not head SHA) so drafts survive new commits; each anchor carries the commit
// it was pinned on and is re-validated before publishing (Task 18).

export const COMMENT_TYPES = ["blocking", "suggestion", "question", "nit", "praise"] as const;
export type CommentType = (typeof COMMENT_TYPES)[number];
export type CaptureSource = "paste" | "typed" | "mixed";

const side = z.enum(["LEFT", "RIGHT"]);
export const anchorSchema = z.object({
  path: z.string().min(1),
  commitId: z.string().min(1),
  side,
  line: z.number().int().positive(),
  startSide: side.optional(),
  startLine: z.number().int().positive().optional(),
  lineText: z.string(),
  startLineText: z.string().optional(),
}) satisfies z.ZodType<Anchor>;

const cardSchema = z.object({
  id: z.string().min(1),
  anchor: anchorSchema,
  body: z.string(),
  type: z.enum(COMMENT_TYPES).nullable(),
  source: z.enum(["paste", "typed", "mixed"]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Card = z.infer<typeof cardSchema>;

const VERSION = 1;
const fileSchema = z.object({ v: z.literal(VERSION), cards: z.array(cardSchema) });

export type ReviewState = {
  cards: Card[];
  /** Last deleted card, for undo. Not persisted. */
  lastDeleted: { card: Card; index: number } | null;
  /** Set when stored data existed but could not be read. */
  loadError: string | null;
};

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const storageKey = (owner: string, repo: string, number: number) =>
  `reviewaloud:drafts:v${VERSION}:${owner}/${repo}#${number}`;

const EMPTY: ReviewState = { cards: [], lastDeleted: null, loadError: null };

function load(storage: KV | null, key: string): ReviewState {
  if (!storage) return EMPTY;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { ...EMPTY, loadError: "Browser storage is unavailable; drafts won't be saved." };
  }
  if (!raw) return EMPTY;
  try {
    const parsed = fileSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { ...EMPTY, cards: parsed.data.cards };
  } catch {
    /* fall through */
  }
  // Keep the unreadable copy aside rather than silently overwriting it.
  try {
    storage.setItem(`${key}:corrupt`, raw);
  } catch {
    /* ignore */
  }
  return { ...EMPTY, loadError: "Saved drafts for this PR couldn't be read and were set aside." };
}

let counter = 0;
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${(counter++).toString(36)}`;

export type NewCard = { anchor: Anchor; body: string; source: CaptureSource; type?: CommentType | null };

export function createReviewStore(key: string, storage: KV | null, now: () => number = Date.now) {
  let state = load(storage, key);
  const listeners = new Set<() => void>();

  function set(next: ReviewState) {
    state = next;
    if (storage) {
      try {
        if (next.cards.length) storage.setItem(key, JSON.stringify({ v: VERSION, cards: next.cards }));
        else storage.removeItem(key);
      } catch {
        state = { ...state, loadError: "Couldn't save drafts to browser storage." };
      }
    }
    listeners.forEach((l) => l());
  }

  return {
    getSnapshot: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    add(input: NewCard): Card {
      const t = now();
      const card: Card = {
        id: newId(),
        anchor: input.anchor,
        body: input.body,
        type: input.type ?? null,
        source: input.source,
        createdAt: t,
        updatedAt: t,
      };
      set({ ...state, cards: [...state.cards, card], lastDeleted: null });
      return card;
    },
    update(id: string, patch: Partial<Pick<Card, "body" | "type" | "anchor">>) {
      if (!state.cards.some((c) => c.id === id)) return;
      set({
        ...state,
        cards: state.cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now() } : c)),
      });
    },
    remove(id: string) {
      const index = state.cards.findIndex((c) => c.id === id);
      if (index < 0) return;
      set({ ...state, cards: state.cards.filter((c) => c.id !== id), lastDeleted: { card: state.cards[index], index } });
    },
    undoRemove() {
      const d = state.lastDeleted;
      if (!d) return;
      const cards = [...state.cards];
      cards.splice(Math.min(d.index, cards.length), 0, d.card);
      set({ ...state, cards, lastDeleted: null });
    },
    clear() {
      set({ ...EMPTY });
    },
    /** Re-read storage, e.g. after another tab changed it. */
    reload() {
      state = { ...load(storage, key), lastDeleted: null };
      listeners.forEach((l) => l());
    },
  };
}

export type ReviewStore = ReturnType<typeof createReviewStore>;

export const SERVER_SNAPSHOT = EMPTY;
