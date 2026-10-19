// Task 6 live smoke: fetch real PRs through lib/github, unauthenticated (60 req/h).
//   pnpm tsx scripts/smoke-pr-fetch.ts
import { createGitHubClient } from "../lib/github/client";
import { GitHubError } from "../lib/github/errors";
import { getPullRequest, listPullRequestFiles } from "../lib/github/pr";

const gh = createGitHubClient();
const targets = [
  { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: 1 },
  { owner: "cli", repo: "cli", number: 14751 },
  { owner: "priyansh-narang2308", repo: "reviewaloud-sandbox", number: 9999 },
];

for (const t of targets) {
  const label = `${t.owner}/${t.repo}#${t.number}`;
  try {
    const pr = await getPullRequest(gh, t);
    const { files, truncated } = await listPullRequestFiles(gh, t);
    const noPatch = files.filter((f) => !f.patch).length;
    console.log(`OK   ${label}: "${pr.title}" · ${files.length} files (${noPatch} without patch)${truncated ? " · truncated" : ""}`);
  } catch (e) {
    console.log(`ERR  ${label}: ${e instanceof GitHubError ? `${e.kind} (${e.status})` : String(e)}`);
  }
}
