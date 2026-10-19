import { z } from "zod";
import type { GitHubClient } from "./client";

const slug = /^[\w.-]+$/;

export type PrRef = { owner: string; repo: string; number: number };

export function prPath({ owner, repo, number }: PrRef) {
  if (!slug.test(owner) || !slug.test(repo) || !Number.isInteger(number) || number < 1) {
    throw new Error("Invalid pull request reference");
  }
  return `/repos/${owner}/${repo}/pulls/${number}`;
}

const pullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  draft: z.boolean().optional().default(false),
  merged: z.boolean().optional().default(false),
  html_url: z.string(),
  body: z.string().nullable(),
  user: z.object({ login: z.string(), avatar_url: z.string() }).nullable(),
  head: z.object({ sha: z.string(), ref: z.string() }),
  base: z.object({ sha: z.string(), ref: z.string(), repo: z.object({ private: z.boolean(), full_name: z.string() }) }),
  changed_files: z.number(),
  additions: z.number(),
  deletions: z.number(),
});

export type PullRequest = {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  htmlUrl: string;
  body: string | null;
  author: { login: string; avatarUrl: string } | null;
  headSha: string;
  headRef: string;
  baseSha: string;
  baseRef: string;
  isPrivate: boolean;
  repoFullName: string;
  changedFiles: number;
  additions: number;
  deletions: number;
};

export async function getPullRequest(gh: GitHubClient, ref: PrRef): Promise<PullRequest> {
  const p = await gh.request("GET", prPath(ref), { schema: pullRequestSchema });
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft,
    merged: p.merged,
    htmlUrl: p.html_url,
    body: p.body,
    author: p.user ? { login: p.user.login, avatarUrl: p.user.avatar_url } : null,
    headSha: p.head.sha,
    headRef: p.head.ref,
    baseSha: p.base.sha,
    baseRef: p.base.ref,
    isPrivate: p.base.repo.private,
    repoFullName: p.base.repo.full_name,
    changedFiles: p.changed_files,
    additions: p.additions,
    deletions: p.deletions,
  };
}

const fileSchema = z.object({
  filename: z.string(),
  status: z.enum(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"]),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  // Absent for binary files and diffs GitHub considers too large.
  patch: z.string().optional(),
  previous_filename: z.string().optional(),
  sha: z.string().nullable().optional(),
});

export type PrFile = {
  path: string;
  status: z.infer<typeof fileSchema>["status"];
  additions: number;
  deletions: number;
  patch: string | null;
  previousPath: string | null;
};

// GitHub serves at most 3000 files for a PR (30 pages of 100).
const MAX_FILE_PAGES = 30;

export async function listPullRequestFiles(
  gh: GitHubClient,
  ref: PrRef,
): Promise<{ files: PrFile[]; truncated: boolean }> {
  const { items, truncated } = await gh.paginate(`${prPath(ref)}/files?per_page=100`, {
    schema: z.array(fileSchema),
    maxPages: MAX_FILE_PAGES,
  });
  return {
    truncated,
    files: items.map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
      previousPath: f.previous_filename ?? null,
    })),
  };
}
