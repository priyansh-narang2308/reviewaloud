import { describe, expect, it } from "vitest";
import type { Anchor } from "@/lib/diff/anchors";
import { createReviewStore, storageKey } from "./review-store";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const anchor: Anchor = { path: "src/cart.ts", commitId: "518baaa", side: "RIGHT", line: 17, lineText: "const MAX_QUANTITY = 99;" };
const KEY = storageKey("o", "r", 1);

describe("review store", () => {
  it("adds, updates and persists cards; a fresh store reads them back", () => {
    const s = memoryStorage();
    let t = 1000;
    const store = createReviewStore(KEY, s, () => t);
    const card = store.add({ anchor, body: "Why 99?", source: "paste" });
    t = 2000;
    store.update(card.id, { body: "Why 99?\nMake it configurable.", type: "question" });

    const reloaded = createReviewStore(KEY, s).getSnapshot();
    expect(reloaded.cards).toHaveLength(1);
    expect(reloaded.cards[0]).toMatchObject({
      body: "Why 99?\nMake it configurable.",
      type: "question",
      source: "paste",
      createdAt: 1000,
      updatedAt: 2000,
      anchor,
    });
  });

  it("keeps drafts separate per PR", () => {
    const s = memoryStorage();
    createReviewStore(storageKey("o", "r", 1), s).add({ anchor, body: "a", source: "typed" });
    expect(createReviewStore(storageKey("o", "r", 2), s).getSnapshot().cards).toHaveLength(0);
  });

  it("deletes with undo restoring the original position", () => {
    const store = createReviewStore(KEY, memoryStorage());
    const a = store.add({ anchor, body: "a", source: "typed" });
    store.add({ anchor, body: "b", source: "typed" });
    store.remove(a.id);
    expect(store.getSnapshot().cards.map((c) => c.body)).toEqual(["b"]);
    store.undoRemove();
    expect(store.getSnapshot().cards.map((c) => c.body)).toEqual(["a", "b"]);
    expect(store.getSnapshot().lastDeleted).toBeNull();
  });

  it("removes the storage entry when the last card is gone", () => {
    const s = memoryStorage();
    const store = createReviewStore(KEY, s);
    store.remove(store.add({ anchor, body: "a", source: "typed" }).id);
    expect(s.data.has(KEY)).toBe(false);
  });

  it("sets corrupted data aside instead of overwriting it", () => {
    const s = memoryStorage({ [KEY]: "{not json" });
    const store = createReviewStore(KEY, s);
    expect(store.getSnapshot().loadError).toMatch(/set aside/);
    expect(s.data.get(`${KEY}:corrupt`)).toBe("{not json");
    expect(store.getSnapshot().cards).toEqual([]);
  });

  it("rejects data from an unknown schema version", () => {
    const s = memoryStorage({ [KEY]: JSON.stringify({ v: 99, cards: [] }) });
    expect(createReviewStore(KEY, s).getSnapshot().loadError).toMatch(/set aside/);
  });

  it("rejects structurally invalid cards", () => {
    const bad = { v: 1, cards: [{ id: "x", anchor: { ...anchor, line: -1 }, body: "", type: null, source: "paste", createdAt: 0, updatedAt: 0 }] };
    expect(createReviewStore(KEY, memoryStorage({ [KEY]: JSON.stringify(bad) })).getSnapshot().loadError).not.toBeNull();
  });

  it("survives storage that throws (private mode, quota)", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    const store = createReviewStore(KEY, throwing);
    expect(store.getSnapshot().loadError).toMatch(/unavailable/);
    store.add({ anchor, body: "still works in memory", source: "typed" });
    expect(store.getSnapshot().cards).toHaveLength(1);
    expect(store.getSnapshot().loadError).toMatch(/Couldn't save/);
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const store = createReviewStore(KEY, null);
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.add({ anchor, body: "a", source: "typed" });
    off();
    store.add({ anchor, body: "b", source: "typed" });
    expect(calls).toBe(1);
  });

  it("reload picks up changes made by another tab", () => {
    const s = memoryStorage();
    const tabA = createReviewStore(KEY, s);
    const tabB = createReviewStore(KEY, s);
    tabA.add({ anchor, body: "from A", source: "typed" });
    tabB.reload();
    expect(tabB.getSnapshot().cards.map((c) => c.body)).toEqual(["from A"]);
  });
});
