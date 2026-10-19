import Link from "next/link";
import type { GitHubErrorKind } from "@/lib/github/errors";

const COPY: Record<GitHubErrorKind, { title: string; body: string }> = {
  not_found: {
    title: "Pull request not found",
    body: "It may not exist, or it's in a private repository. Private repositories will work after you sign in with GitHub.",
  },
  unauthorized: { title: "GitHub rejected the credentials", body: "Sign in again to continue." },
  forbidden: {
    title: "No access to this repository",
    body: "The ReviewAloud GitHub App may not be installed on it, or your account can't see it.",
  },
  rate_limited: {
    title: "GitHub rate limit reached",
    body: "Too many requests to GitHub for now. Wait a moment and try again.",
  },
  validation: { title: "GitHub refused the request", body: "" },
  invalid_response: { title: "Unexpected response from GitHub", body: "Try again; if it persists, the API may have changed." },
  network: { title: "Couldn't reach GitHub", body: "Check your connection and try again." },
  unknown: { title: "Something went wrong talking to GitHub", body: "Try again in a moment." },
};

export function WorkspaceError({ kind, message, resetAt }: { kind: GitHubErrorKind; message: string; resetAt?: number }) {
  const copy = COPY[kind];
  const reset = resetAt ? new Date(resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div role="alert" data-testid="workspace-error" className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <h1 className="mb-2 text-lg font-semibold">{copy.title}</h1>
        <p className="mb-1 text-sm text-muted">{copy.body || message}</p>
        {reset && <p className="text-sm text-muted">GitHub says the limit resets at {reset}.</p>}
        {copy.body && message && <p className="mt-3 font-mono text-xs text-faint">GitHub: {message}</p>}
        <Link href="/" className="mt-5 inline-block text-sm text-accent hover:underline">
          ← Try another pull request
        </Link>
      </div>
    </main>
  );
}
