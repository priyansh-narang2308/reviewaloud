import { z } from "zod";
import type { GitHubClient } from "./client";
import { githubUrl, prPath, type PrRef } from "./pr";

// Read-only GitHub data the Promise Ledger needs.

const side = z.enum(["LEFT", "RIGHT"]).nullable().optional();
const reviewCommentSchema = z.object({
  id: z.number(),
  in_reply_to_id: z.number().nullable().optional(),
  pull_request_review_id: z.number().nullable().optional(),
  path: z.string(),
  body: z.string(),
  html_url: githubUrl,
  diff_hunk: z.string().nullable().optional(),
  line: z.number().nullable().optional(),
  side,
  start_line: z.number().nullable().optional(),
  start_side: side,
  original_line: z.number().nullable().optional(),
  original_start_line: z.number().nullable().optional(),
  original_commit_id: z.string(),
  commit_id: z.string(),
  subject_type: z.string().nullable().optional(),
  created_at: z.string(),
  user: z.object({ login: z.string(), type: z.string().optional() }).nullable(),
});
export type ReviewComment = z.infer<typeof reviewCommentSchema>;

export async function listReviewComments(gh: GitHubClient, ref: PrRef): Promise<ReviewComment[]> {
  const { items } = await gh.paginate(`${prPath(ref)}/comments?per_page=100`, {
    schema: z.array(reviewCommentSchema),
    maxPages: 10,
  });
  return items;
}

const threadsSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({
          nodes: z.array(
            z.object({
              isResolved: z.boolean(),
              isOutdated: z.boolean(),
              comments: z.object({ nodes: z.array(z.object({ databaseId: z.number().nullable() })) }),
            }),
          ),
        }),
      }),
    }),
  }),
});

export type ThreadState = { isResolved: boolean; isOutdated: boolean };

/** Thread resolution state keyed by the thread's first comment id. Up to 100 threads. */
export async function listThreadStates(gh: GitHubClient, ref: PrRef): Promise<Map<number, ThreadState>> {
  const query = `query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved isOutdated comments(first:1){nodes{databaseId}}}}}}}`;
  const res = await gh.request("POST", "/graphql", {
    schema: threadsSchema,
    body: { query, variables: { owner: ref.owner, repo: ref.repo, n: ref.number } },
  });
  const map = new Map<number, ThreadState>();
  for (const t of res.data.repository.pullRequest.reviewThreads.nodes) {
    const id = t.comments.nodes[0]?.databaseId;
    if (id) map.set(id, { isResolved: t.isResolved, isOutdated: t.isOutdated });
  }
  return map;
}

const compareSchema = z.object({
  status: z.string(),
  ahead_by: z.number(),
  behind_by: z.number(),
  commits: z.array(
    z.object({
      sha: z.string(),
      commit: z.object({ message: z.string(), author: z.object({ date: z.string() }).nullable() }),
      author: z.object({ login: z.string() }).nullable(),
    }),
  ),
  files: z
    .array(z.object({ filename: z.string(), status: z.string(), patch: z.string().optional(), previous_filename: z.string().optional() }))
    .optional()
    .default([]),
});
export type Comparison = z.infer<typeof compareSchema>;

export async function compareCommits(gh: GitHubClient, ref: PrRef, base: string, head: string): Promise<Comparison> {
  if (!/^[0-9a-f]{7,40}$/.test(base) || !/^[0-9a-f]{7,40}$/.test(head)) throw new Error("Invalid commit sha");
  return gh.request("GET", `/repos/${ref.owner}/${ref.repo}/compare/${base}...${head}`, { schema: compareSchema });
}

const contentSchema = z.object({ type: z.literal("file"), encoding: z.string(), content: z.string(), size: z.number() });

/** File text at a commit, or null if it doesn't exist there (or is too large / binary). */
export async function getFileAt(gh: GitHubClient, ref: PrRef, path: string, sha: string): Promise<string | null> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  try {
    const f = await gh.request("GET", `/repos/${ref.owner}/${ref.repo}/contents/${encoded}?ref=${sha}`, { schema: contentSchema });
    if (f.encoding !== "base64" || f.size > 400_000) return null;
    return Buffer.from(f.content, "base64").toString("utf8");
  } catch (e) {
    if (e && typeof e === "object" && "kind" in e && (e.kind === "not_found" || e.kind === "invalid_response")) return null;
    throw e;
  }
}

const checkRunsSchema = z.object({
  total_count: z.number(),
  check_runs: z.array(z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() })),
});
const statusSchema = z.object({ state: z.string(), total_count: z.number() });

export type CiSummary = {
  state: "success" | "failure" | "pending" | "none";
  passed: number;
  failed: number;
  pending: number;
  failing: string[];
};

export async function getCiSummary(gh: GitHubClient, ref: PrRef, sha: string): Promise<CiSummary> {
  const [runs, status] = await Promise.all([
    gh.request("GET", `/repos/${ref.owner}/${ref.repo}/commits/${sha}/check-runs?per_page=100`, { schema: checkRunsSchema }),
    gh.request("GET", `/repos/${ref.owner}/${ref.repo}/commits/${sha}/status`, { schema: statusSchema }),
  ]);
  let passed = 0;
  let failed = 0;
  let pending = 0;
  const failing: string[] = [];
  for (const r of runs.check_runs) {
    if (r.status !== "completed") pending++;
    else if (["success", "neutral", "skipped"].includes(r.conclusion ?? "")) passed++;
    else {
      failed++;
      failing.push(r.name);
    }
  }
  if (status.total_count) {
    if (status.state === "success") passed++;
    else if (status.state === "pending") pending++;
    else {
      failed++;
      failing.push("commit status");
    }
  }
  const state = failed ? "failure" : pending ? "pending" : passed ? "success" : "none";
  return { state, passed, failed, pending, failing };
}

const replySchema = z.object({ id: z.number(), html_url: githubUrl, in_reply_to_id: z.number().nullable().optional() });

export async function replyToReviewComment(gh: GitHubClient, ref: PrRef, commentId: number, body: string) {
  return gh.request("POST", `${prPath(ref)}/comments/${commentId}/replies`, { schema: replySchema, body: { body } });
}
