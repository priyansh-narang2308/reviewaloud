"use client";

import { createContext, useContext } from "react";
import type { PromiseItem, Verdict } from "@/lib/ledger/types";

/** Recorded data that powers the no-login demo. Simulated actions are always labelled. */
export type DemoData = {
  recordedAt: string;
  source: string;
  ledger: { headSha: string; prAuthor: string | null; reviewers: string[]; items: PromiseItem[] };
  verdicts: Record<string, Verdict>;
};

const DemoContext = createContext<DemoData | null>(null);
export const DemoProvider = DemoContext.Provider;
export const useDemo = () => useContext(DemoContext);

export function recordedLabel(d: DemoData) {
  const date = new Date(d.recordedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `Recorded live run · ${date}`;
}
