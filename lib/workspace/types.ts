import type { ParsedPatch } from "@/lib/diff/parse";
import type { PrFile, PrRef, PullRequest } from "@/lib/github/pr";

export type WorkspaceFile = PrFile & {
  /** null when GitHub sent no patch (binary/too large) or it failed to parse. */
  parsed: ParsedPatch | null;
  parseError: string | null;
};

export type WorkspaceData = {
  ref: PrRef;
  pr: PullRequest;
  files: WorkspaceFile[];
  /** GitHub caps PR file listings at 3000 files. */
  truncated: boolean;
};
