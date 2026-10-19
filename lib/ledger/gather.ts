import "server-only";
import { parsePatch } from "@/lib/diff/parse";
import type { GitHubClient } from "@/lib/github/client";
import { type CiSummary, compareCommits, getCiSummary, getFileAt } from "@/lib/github/ledger-data";
import type { PrRef } from "@/lib/github/pr";
import { capPatch, excerpt, mapLine, originalAnchorLine, touchesRange } from "./linemap";
import type { PromiseItem } from "./types";

export type Signals = {
  commitsAfter: number;
  commitMessages: string[];
  anchorRegionChanged: boolean;
  anchoredLineDeleted: boolean;
  anchoredFileDeleted: boolean;
  otherFilesChanged: string[];
  authorReplies: number;
  ci: CiSummary | null;
};

export type Bundle = {
  signals: Signals;
  /** Head file texts we may cite (for evidence validation). */
  headFiles: Map<string, string>;
  prompt: {
    anchoredExcerpt: string | null;
    anchoredPatch: string;
    otherFiles: { path: string; patch: string; excerpt: string | null }[];
  };
};

const RADIUS = 25;
const MAX_OTHER = 3;

/** Deterministic evidence for one promise. No AI involved. */
export async function gather(gh: GitHubClient, ref: PrRef, p: PromiseItem, headSha: string): Promise<Bundle> {
  const sameCommit = p.originalCommit === headSha;
  const [cmp, ci] = await Promise.all([
    sameCommit ? Promise.resolve(null) : compareCommits(gh, ref, p.originalCommit, headSha),
    getCiSummary(gh, ref, headSha).catch(() => null),
  ]);

  const files = cmp?.files ?? [];
  const own = files.find((f) => f.filename === p.path || f.previous_filename === p.path);
  const ownParsed = own?.patch ? safeParse(own.patch) : null;
  const origLine = originalAnchorLine({ side: p.side, original_line: p.originalLine, diff_hunk: p.diffHunk });
  const mapped = origLine ? mapLine(origLine, ownParsed) : null;
  const headPath = own?.filename ?? p.path;
  const anchoredFileDeleted = own?.status === "removed";

  const headFiles = new Map<string, string>();
  const headText = anchoredFileDeleted ? null : await getFileAt(gh, ref, headPath, headSha);
  if (headText !== null) headFiles.set(headPath, headText);

  // Other changed files, largest change first, capped.
  const others = files
    .filter((f) => f !== own && f.patch)
    .sort((a, b) => (b.patch?.length ?? 0) - (a.patch?.length ?? 0))
    .slice(0, MAX_OTHER);
  const otherFiles = await Promise.all(
    others.map(async (f) => {
      const text = f.status === "removed" ? null : await getFileAt(gh, ref, f.filename, headSha);
      if (text !== null) headFiles.set(f.filename, text);
      const firstNew = safeParse(f.patch!)?.lines.find((l) => l.kind === "add")?.newNo;
      return {
        path: f.filename,
        patch: capPatch(f.patch, 60),
        excerpt: text !== null && firstNew ? excerpt(text, firstNew, 15).body : null,
      };
    }),
  );

  // Replies by anyone other than the reviewer (the author or the agent acting for them).
  const authorReplies = p.replies.filter((r) => r.author !== p.author).length;

  return {
    signals: {
      commitsAfter: cmp?.commits.length ?? 0,
      commitMessages: (cmp?.commits ?? []).slice(-5).map((c) => c.commit.message.split("\n")[0].slice(0, 120)),
      anchorRegionChanged: origLine ? touchesRange(ownParsed, origLine - 3, origLine + 3) : !!ownParsed,
      anchoredLineDeleted: !!mapped?.deleted,
      anchoredFileDeleted,
      otherFilesChanged: files.filter((f) => f !== own).map((f) => f.filename),
      authorReplies,
      ci,
    },
    headFiles,
    prompt: {
      anchoredExcerpt: headText !== null && mapped ? excerpt(headText, mapped.line, RADIUS).body : null,
      anchoredPatch: capPatch(own?.patch, 120),
      otherFiles,
    },
  };
}

function safeParse(patch: string) {
  try {
    return parsePatch(patch);
  } catch {
    return null;
  }
}
