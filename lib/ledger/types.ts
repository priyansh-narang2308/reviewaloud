import { z } from "zod";

export const STATUSES = ["addressed", "unresolved", "needs_human", "reply_needed"] as const;
export type LedgerStatus = (typeof STATUSES)[number];

export const INTENTS = ["change_request", "question", "discussion", "nit", "praise_or_info"] as const;
export type Intent = (typeof INTENTS)[number];

export type Evidence = {
  kind: "code" | "reply";
  path?: string;
  startLine?: number;
  endLine?: number;
  replyId?: number;
  quote: string;
  supports: boolean;
  /** True only if the quote was found verbatim at the cited place. */
  verified: boolean;
};

export type Verdict = {
  commentId: number;
  status: LedgerStatus;
  intent: Intent;
  rationale: string;
  whatIsMissing: string | null;
  evidence: Evidence[];
  decidedBy: "rules" | "ai";
  model: string | null;
  /** Deterministic observations shown next to the verdict. */
  notes: string[];
  droppedEvidence: number;
  headSha: string;
  checkedAt: number;
};

/** One human review request ("promise") as listed in the ledger. */
export type PromiseItem = {
  commentId: number;
  author: string;
  body: string;
  path: string;
  /** Where it was pinned when written (GitHub line + side, original commit). */
  side: "LEFT" | "RIGHT";
  originalLine: number | null;
  originalCommit: string;
  /** The diff context GitHub stored with the comment (ends at the commented line). */
  diffHunk: string | null;
  createdAt: string;
  htmlUrl: string;
  isResolved: boolean;
  isOutdated: boolean;
  replies: { id: number; author: string; body: string; createdAt: string }[];
};

// What the model must return. Evidence is re-checked against real code before use.
export const aiVerdictSchema = z.object({
  intent: z.enum(INTENTS),
  status: z.enum(STATUSES),
  rationale: z.string().min(1).max(1200),
  whatIsMissing: z.string().max(800).nullable(),
  evidence: z
    .array(
      z.object({
        kind: z.enum(["code", "reply"]),
        path: z.string().max(400).nullable(),
        startLine: z.number().int().positive().nullable(),
        endLine: z.number().int().positive().nullable(),
        replyId: z.number().int().nullable(),
        quote: z.string().min(1).max(600),
        supports: z.boolean(),
      }),
    )
    .max(6),
});
export type AiVerdict = z.infer<typeof aiVerdictSchema>;

export const aiVerdictJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "status", "rationale", "whatIsMissing", "evidence"],
  properties: {
    intent: { type: "string", enum: [...INTENTS] },
    status: { type: "string", enum: [...STATUSES] },
    rationale: { type: "string", description: "1–3 sentences explaining the status, citing what you saw." },
    whatIsMissing: { anyOf: [{ type: "string" }, { type: "null" }], description: "If not addressed: what is still missing. Else null." },
    evidence: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "path", "startLine", "endLine", "replyId", "quote", "supports"],
        properties: {
          kind: { type: "string", enum: ["code", "reply"] },
          path: { anyOf: [{ type: "string" }, { type: "null" }] },
          startLine: { anyOf: [{ type: "integer" }, { type: "null" }] },
          endLine: { anyOf: [{ type: "integer" }, { type: "null" }] },
          replyId: { anyOf: [{ type: "integer" }, { type: "null" }] },
          quote: { type: "string", description: "Exact text copied from the cited lines or reply." },
          supports: { type: "boolean", description: "true if this supports the request being met; false if it contradicts it." },
        },
      },
    },
  },
};
