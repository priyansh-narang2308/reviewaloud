import "server-only";
import { createGitHubClient } from "@/lib/github/client";
import { GitHubError, type GitHubErrorKind } from "@/lib/github/errors";
import { getPullRequest, listPullRequestFiles, type PrRef } from "@/lib/github/pr";
import { env } from "@/lib/env";
import { parsePatch } from "@/lib/diff/parse";
import type { WorkspaceData, WorkspaceFile } from "./types";

export type LoadResult =
  | { ok: true; data: WorkspaceData }
  | { ok: false; kind: GitHubErrorKind; message: string; resetAt?: number };

/** Server-side: fetch a PR and its files, parse every patch once. */
export async function loadWorkspace(ref: PrRef, userToken?: string): Promise<LoadResult> {
  const gh = createGitHubClient({ token: userToken ?? env().GITHUB_PUBLIC_READ_TOKEN });
  try {
    const [pr, { files, truncated }] = await Promise.all([
      getPullRequest(gh, ref),
      listPullRequestFiles(gh, ref),
    ]);
    const mapped: WorkspaceFile[] = files.map((f) => {
      let parsed: WorkspaceFile["parsed"] = null;
      let parseError: string | null = null;
      if (f.patch) {
        try {
          parsed = parsePatch(f.patch);
        } catch (e) {
          parseError = e instanceof Error ? e.message : "Could not parse diff";
        }
      }
      return { ...f, parsed, parseError };
    });
    return { ok: true, data: { ref, pr, files: mapped, truncated } };
  } catch (e) {
    if (e instanceof GitHubError) return { ok: false, kind: e.kind, message: e.message, resetAt: e.resetAt };
    throw e;
  }
}
