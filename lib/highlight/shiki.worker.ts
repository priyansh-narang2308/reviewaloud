/// <reference lib="webworker" />
// Runs Shiki off the main thread: grammar parsing and tokenising never block clicks.
import { tokenize } from "./tokenize";

self.onmessage = async (e: MessageEvent<{ id: number; path: string; lines: string[] }>) => {
  const { id, path, lines } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, tokens: await tokenize(path, lines) });
  } catch {
    (self as unknown as Worker).postMessage({ id, tokens: null });
  }
};
