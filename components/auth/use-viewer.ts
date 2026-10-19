"use client";

import { useEffect, useState } from "react";

export type Viewer = { login: string; avatarUrl: string | null };
export type ViewerState =
  | { status: "loading" }
  | { status: "ready"; configured: boolean; viewer: Viewer | null; appSlug: string | null };

const DEMO_VIEWER: ViewerState = { status: "ready", configured: true, viewer: { login: "you (demo)", avatarUrl: null }, appSlug: null };

/** Who is signed in. Fetched client-side so pages stay cacheable. In the demo, a fixed sample viewer. */
export function useViewer(demo = false): [ViewerState, () => void] {
  const [state, setState] = useState<ViewerState>(demo ? DEMO_VIEWER : { status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (demo) return;
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
  }, [tick, demo]);
  return [state, () => setTick((t) => t + 1)];
}

export function loginHref(returnTo: string) {
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}
