import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/workspace";
import type { DemoData } from "@/components/demo/demo-context";
import { parsePatch } from "@/lib/diff/parse";
import type { PrFile, PullRequest } from "@/lib/github/pr";
import type { WorkspaceData } from "@/lib/workspace/types";
import snapshot from "@/fixtures/demo/sandbox-pr-2.json";

export const metadata: Metadata = {
  title: "Live demo · ReviewAloud",
  description: "Try ReviewAloud without signing in: a real sandbox PR, voice-friendly review, and a recorded Promise Ledger run.",
};

// No login, no keys: a snapshot of a real public sandbox PR plus one recorded
// live ledger run. Everything simulated is labelled in the UI.
export default function DemoPage() {
  const data: WorkspaceData = {
    ref: snapshot.ref,
    pr: snapshot.pr as PullRequest,
    truncated: false,
    files: (snapshot.files as PrFile[]).map((f) => ({ ...f, parsed: f.patch ? parsePatch(f.patch) : null, parseError: null })),
  };
  const demo: DemoData = {
    recordedAt: snapshot.recordedAt,
    source: snapshot.source,
    ledger: snapshot.ledger as DemoData["ledger"],
    verdicts: snapshot.verdicts as unknown as DemoData["verdicts"],
  };
  return <Workspace data={data} aiEnabled={false} demo={demo} />;
}
