import type { PrRecord } from "@/lib/ledger/score";
import type { LedgerStatus, Verdict } from "@/lib/ledger/types";

// Per-viewer, per-PR ledger cache in localStorage: verdicts (keyed by comment),
// reviewer overrides, and a cross-PR follow-through history.

type KV = Pick<Storage, "getItem" | "setItem">;
export type Override = { status: LedgerStatus; note: string; at: number };
type LedgerFile = { v: 1; verdicts: Record<string, Verdict>; overrides: Record<string, Override> };

export const ledgerKey = (owner: string, repo: string, n: number) => `reviewaloud:ledger:v1:${owner}/${repo}#${n}`;
const HISTORY_KEY = "reviewaloud:followthrough:v1";

const storage = (): KV | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function readLedger(key: string, s: KV | null = storage()): LedgerFile {
  try {
    const raw = s?.getItem(key);
    const j = raw ? JSON.parse(raw) : null;
    if (j?.v === 1 && j.verdicts && j.overrides) return j;
  } catch {
    /* fall through */
  }
  return { v: 1, verdicts: {}, overrides: {} };
}

export function writeLedger(key: string, f: LedgerFile, s: KV | null = storage()) {
  try {
    s?.setItem(key, JSON.stringify(f));
  } catch {
    /* in-memory only */
  }
}

export function readHistory(s: KV | null = storage()): PrRecord[] {
  try {
    const j = JSON.parse(s?.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export function upsertHistory(r: PrRecord, s: KV | null = storage()) {
  const all = readHistory(s).filter((x) => x.pr !== r.pr);
  all.push(r);
  try {
    s?.setItem(HISTORY_KEY, JSON.stringify(all.slice(-50)));
  } catch {
    /* ignore */
  }
}
