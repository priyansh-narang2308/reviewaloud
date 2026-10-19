import { z } from "zod";
import { NextResponse } from "next/server";
import { structuredCompletion } from "@/lib/ai/openrouter";
import { getSession, takeAiBudget, userToken } from "@/lib/auth/session";
import { env, missingFor } from "@/lib/env";
import { createGitHubClient } from "@/lib/github/client";
import { listReviewComments, listThreadStates } from "@/lib/github/ledger-data";
import { getPullRequest } from "@/lib/github/pr";
import { clientKey, createLimiter, isSameOrigin } from "@/lib/http/guard";
import { gather } from "@/lib/ledger/gather";
import { buildPromises } from "@/lib/ledger/promises";
import { verifyMessages } from "@/lib/ledger/prompt";
import { ruleVerdict, signalNotes, validateAiVerdict } from "@/lib/ledger/rules";
import { type Verdict, aiVerdictJsonSchema, aiVerdictSchema } from "@/lib/ledger/types";
import { prRefSchema } from "@/lib/publish/plan";
import { fail, githubFailure } from "@/lib/publish/server";

const bodySchema = z.object({
  ref: prRefSchema,
  commentId: z.number().int().positive(),
  /** Reviewer agreed to send private code to the AI provider. */
  consentPrivate: z.boolean().optional(),
});

const ipLimit = createLimiter(60, 60 * 60 * 1000);

// Checks ONE human review request against the PR's latest commit.
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return fail(403, "cross_origin", "Cross-origin request refused.");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "Invalid verify request.");
  const { ref, commentId, consentPrivate } = parsed.data;

  // Sign-in required: verification spends the shared free-tier AI quota.
  const session = await getSession();
  const token = await userToken(session);
  if (!token) return fail(401, "signed_out", "Sign in with GitHub to run the Promise Ledger.");
  const rl = ipLimit(clientKey(req));
  if (!rl.ok) return fail(429, "rate_limited", "Too many checks from this network. Try again later.");

  const gh = createGitHubClient({ token });
  try {
    const pr = await getPullRequest(gh, ref);
    if (pr.isPrivate && !consentPrivate) {
      return fail(412, "bad_request", "This is a private repository. Confirm that its code may be sent to the AI provider.", { consentRequired: true });
    }
    const [comments, threads] = await Promise.all([listReviewComments(gh, ref), listThreadStates(gh, ref).catch(() => new Map())]);
    const p = buildPromises(comments, threads).find((x) => x.commentId === commentId);
    if (!p) return fail(404, "bad_request", "That review comment isn't on this pull request (or it's a reply).");

    const bundle = await gather(gh, ref, p, pr.headSha);
    const notes = signalNotes(p, bundle.signals);
    const base = { commentId, notes, headSha: pr.headSha, checkedAt: Date.now(), droppedEvidence: 0 };

    const rule = ruleVerdict(p, bundle.signals);
    if (rule) {
      const v: Verdict = { ...base, ...rule, whatIsMissing: null, evidence: [], decidedBy: "rules", model: null };
      return NextResponse.json(v);
    }

    const e = env();
    if (missingFor("ai", e).length) return fail(503, "unknown", "AI verification isn't configured on this server (OPENROUTER_API_KEY).");
    if (!takeAiBudget(session, e.AI_DAILY_CALL_CAP)) {
      return fail(429, "rate_limited", `Daily AI check limit reached (${e.AI_DAILY_CALL_CAP}). Free-tier models are rate-limited; try tomorrow.`);
    }
    await session.save();

    const ai = await structuredCompletion(
      { apiKey: e.OPENROUTER_API_KEY!, appUrl: e.APP_URL },
      {
        models: [e.OPENROUTER_MODEL, ...e.OPENROUTER_FALLBACK_MODELS],
        messages: verifyMessages(p, bundle),
        schemaName: "promise_verdict",
        jsonSchema: aiVerdictJsonSchema,
        validate: aiVerdictSchema,
        maxTokens: 1600,
        timeoutMs: 30_000,
      },
    );
    if (!ai.ok) return fail(ai.error === "rate_limited" ? 429 : 502, "unknown", `AI check failed: ${ai.message}. Try again.`);

    const replies = new Map(p.replies.map((r) => [r.id, r.body]));
    const checked = validateAiVerdict(ai.value, bundle.headFiles, replies);
    const v: Verdict = {
      ...base,
      status: checked.status,
      intent: ai.value.intent,
      rationale: ai.value.rationale,
      whatIsMissing: ai.value.whatIsMissing,
      evidence: checked.evidence,
      decidedBy: "ai",
      model: ai.model,
      droppedEvidence: checked.dropped,
      notes: checked.downgradeReason ? [checked.downgradeReason, ...notes] : notes,
    };
    return NextResponse.json(v);
  } catch (err) {
    return githubFailure(err);
  }
}
