"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { SERVER_SNAPSHOT, createReviewStore, storageKey, type ReviewStore } from "@/lib/store/review-store";
import type { PrRef } from "@/lib/github/pr";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useReviewStore(ref: PrRef): [ReviewStore, ReturnType<ReviewStore["getSnapshot"]>] {
  const key = storageKey(ref.owner, ref.repo, ref.number);
  const [store] = useState(() => createReviewStore(key, browserStorage()));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT);

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === key && store.reload();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, store]);

  return [store, state];
}
