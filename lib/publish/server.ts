import "server-only";
import { NextResponse } from "next/server";
import { getSession, userToken } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { createGitHubClient, type GitHubClient } from "@/lib/github/client";
import { GitHubError } from "@/lib/github/errors";
import type { PrRef } from "@/lib/github/pr";
import { isSameOrigin } from "@/lib/http/guard";

export type PublishErrorCode =
  | "cross_origin"
  | "signed_out"
  | "not_allowlisted"
  | "no_access"
  | "pending_exists"
  | "outdated"
  | "moved"
  | "github_rejected"
  | "rate_limited"
  | "network"
  | "bad_request"
  | "unknown";

export function fail(status: number, code: PublishErrorCode, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ code, message, ...extra }, { status });
}

export function installUrl(): string | null {
  const slug = env().GITHUB_APP_SLUG;
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

/** Common checks for every write: same origin, signed in, repo allowed. */
export async function authorizeWrite(
  req: Request,
  ref: PrRef,
): Promise<{ ok: true; gh: GitHubClient; login: string } | { ok: false; res: NextResponse }> {
  if (!isSameOrigin(req)) return { ok: false, res: fail(403, "cross_origin", "Cross-origin request refused.") };
  const session = await getSession();
  const token = await userToken(session);
  if (!token || !session.login) {
    return { ok: false, res: fail(401, "signed_out", "Sign in with GitHub to publish reviews.") };
  }
  const allow = env().WRITE_REPO_ALLOWLIST;
  if (allow && !allow.includes(`${ref.owner}/${ref.repo}`)) {
    return {
      ok: false,
      res: fail(403, "not_allowlisted", `This deployment only publishes to: ${allow.join(", ")}.`),
    };
  }
  return { ok: true, gh: createGitHubClient({ token }), login: session.login };
}

/** Maps GitHub failures to actionable responses. Drafts are never touched here. */
export function githubFailure(e: unknown): NextResponse {
  if (!(e instanceof GitHubError)) throw e;
  switch (e.kind) {
    case "unauthorized":
      return fail(401, "signed_out", "Your GitHub session expired. Sign in again; your drafts are kept.");
    case "forbidden":
    case "not_found":
      return fail(403, "no_access", "ReviewAloud can't write to this repository. Install the GitHub App on it, or check your access.", {
        installUrl: installUrl(),
      });
    case "rate_limited":
      return fail(429, "rate_limited", "GitHub rate limit reached. Try again shortly; your drafts are kept.", { resetAt: e.resetAt });
    case "validation":
      return fail(422, "github_rejected", `GitHub refused the request: ${e.message}`);
    case "network":
      return fail(502, "network", "Couldn't reach GitHub. Your drafts are kept; try again.");
    default:
      return fail(502, "unknown", `GitHub error: ${e.message}`);
  }
}
