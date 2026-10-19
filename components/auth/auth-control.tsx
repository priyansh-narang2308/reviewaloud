"use client";

import { loginHref, type ViewerState } from "./use-viewer";

export function AuthControl({ state, returnTo, onSignedOut }: { state: ViewerState; returnTo: string; onSignedOut: () => void }) {
  if (state.status === "loading") return <span className="h-7 w-24 animate-pulse rounded-full bg-surface-2" aria-hidden />;
  if (!state.configured) {
    return (
      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted" title="GitHub sign-in isn't configured on this server">
        Read-only preview
      </span>
    );
  }
  if (!state.viewer) {
    return (
      <a href={loginHref(returnTo)} data-testid="sign-in" className="rounded-full border border-border-strong px-3 py-1 text-xs text-text hover:bg-surface-2">
        Sign in with GitHub
      </a>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs" data-testid="viewer">
      {state.viewer.avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny avatar from GitHub's CDN
        <img src={state.viewer.avatarUrl} alt="" width={20} height={20} className="rounded-full" />
      )}
      <span className="text-text">{state.viewer.login}</span>
      <button
        type="button"
        className="text-muted hover:text-text"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          onSignedOut();
        }}
      >
        Sign out
      </button>
    </span>
  );
}
