import { NextResponse } from "next/server";
import { structuredCompletion } from "@/lib/ai/openrouter";
import { inventedIdentifiers, tidyInputSchema, tidyJsonSchema, tidyMessages, tidyOutputSchema } from "@/lib/ai/tidy";
import { env, missingFor } from "@/lib/env";
import { clientKey, createLimiter, isSameOrigin } from "@/lib/http/guard";

// Free-tier models allow ~50 requests/day per key; keep tidy well below that.
const limit = createLimiter(10, 60 * 60 * 1000);

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  const e = env();
  if (missingFor("ai", e).length) {
    return NextResponse.json({ error: "AI tidy isn't configured on this server (OPENROUTER_API_KEY)." }, { status: 503 });
  }
  const rl = limit(clientKey(req));
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Tidy limit reached. Try again in ${Math.ceil(rl.retryAfterMs / 60000)} min.` },
      { status: 429 },
    );
  }
  const parsed = tidyInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = parsed.data;

  const result = await structuredCompletion(
    { apiKey: e.OPENROUTER_API_KEY!, appUrl: e.APP_URL },
    {
      models: [e.OPENROUTER_MODEL, ...e.OPENROUTER_FALLBACK_MODELS],
      messages: tidyMessages(input),
      schemaName: "tidied_comment",
      jsonSchema: tidyJsonSchema,
      validate: tidyOutputSchema,
      maxTokens: 600,
    },
  );
  if (!result.ok) {
    const status = result.error === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: `AI tidy failed: ${result.message}` }, { status });
  }
  const invented = inventedIdentifiers(input, result.value.body);
  if (invented.length) {
    return NextResponse.json(
      { error: `Suggestion rejected: it introduced ${invented.slice(0, 3).map((t) => `"${t}"`).join(", ")}, which you didn't say.` },
      { status: 422 },
    );
  }
  return NextResponse.json({ body: result.value.body, type: result.value.type, model: result.model });
}
