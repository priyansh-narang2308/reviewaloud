"use client";

import type { LineTokens } from "./tokenize";

export type { LineTokens } from "./tokenize";

// Main-thread facade: sends lines to a Web Worker and resolves with tokens.
// Falls back to plain text (null) if workers are unavailable.

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, (t: LineTokens[] | null) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./shiki.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; tokens: LineTokens[] | null }>) => {
      pending.get(e.data.id)?.(e.data.tokens);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      pending.forEach((resolve) => resolve(null));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function highlightLines(path: string, lines: string[]): Promise<LineTokens[] | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, path, lines });
  });
}
