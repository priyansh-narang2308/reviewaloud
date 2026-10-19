"use client";

import { useEffect, useState } from "react";

export type Viewer = { login: string; avatarUrl: string | null };
export type ViewerState =
  | { status: "loading" }
  | { status: "ready"; configured: boolean; viewer: Viewer | null; appSlug: string | null };

/** Who is signed in. Fetched client-side so pages stay cacheable. */
export function useViewer(): [ViewerState, () => void] {
  const [state, setState] = useState<ViewerState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setState({ status: "ready", configured: !!j.configured, viewer: j.viewer ?? null, appSlug: j.appSlug ?? null });
      })
      .catch(() => !cancelled && setState({ status: "ready", configured: false, viewer: null, appSlug: null }));
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return [state, () => setTick((t) => t + 1)];
}

export function loginHref(returnTo: string) {
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}
