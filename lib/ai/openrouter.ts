import "server-only";
import type { z } from "zod";

// Minimal OpenRouter chat client: strict JSON-schema output, Zod validation,
// one repair attempt per model, then the next model in the fallback chain.
// https://openrouter.ai/docs/guides/features/structured-outputs

const URL = "https://openrouter.ai/api/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type StructuredRequest<T> = {
  models: string[];
  messages: ChatMessage[];
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  validate: z.ZodType<T>;
  maxTokens: number;
  timeoutMs?: number;
};

export type StructuredResult<T> =
  | { ok: true; value: T; model: string; attempts: number }
  | { ok: false; error: AiErrorKind; message: string; attempts: number };

export type AiErrorKind = "rate_limited" | "unavailable" | "invalid_output" | "auth" | "network";

export class AiCallError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

type Deps = { apiKey: string; fetch?: typeof fetch; appUrl?: string };

async function callOnce(deps: Deps, model: string, req: StructuredRequest<unknown>, messages: ChatMessage[]) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await (deps.fetch ?? fetch)(URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${deps.apiKey}`,
        "Content-Type": "application/json",
        ...(deps.appUrl ? { "HTTP-Referer": deps.appUrl } : {}),
        "X-Title": "ReviewAloud",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: req.maxTokens,
        response_format: {
          type: "json_schema",
          json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
        },
        // Only route to endpoints that honour response_format.
        provider: { require_parameters: true },
      }),
    });
  } catch (e) {
    throw new AiCallError("network", e instanceof Error && e.name === "AbortError" ? "Model timed out" : "Network error");
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  } | null;
  if (res.status === 401 || res.status === 403) throw new AiCallError("auth", body?.error?.message ?? "AI key rejected");
  if (res.status === 429) throw new AiCallError("rate_limited", body?.error?.message ?? "Free-tier rate limit reached");
  if (!res.ok) throw new AiCallError("unavailable", body?.error?.message ?? `Model error ${res.status}`);
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new AiCallError("invalid_output", "Model returned no content");
  return content;
}

function parseJson(content: string): unknown {
  // Some models wrap JSON in a fence despite the schema; strip it.
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export async function structuredCompletion<T>(deps: Deps, req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const started = Date.now();
  const r = await run(deps, req);
  // Timing and outcome only; never prompt or output content.
  console.info(`[ai] ${req.schemaName} ${r.ok ? `ok model=${r.model}` : `fail ${r.error}`} attempts=${r.attempts} ms=${Date.now() - started}`);
  return r;
}

async function run<T>(deps: Deps, req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  let attempts = 0;
  let last: { kind: AiErrorKind; message: string } = { kind: "unavailable", message: "No models configured" };

  for (const model of req.models) {
    let messages = req.messages;
    for (let repair = 0; repair < 2; repair++) {
      attempts++;
      try {
        const content = await callOnce(deps, model, req as StructuredRequest<unknown>, messages);
        let candidate: unknown;
        try {
          candidate = parseJson(content);
        } catch {
          throw new AiCallError("invalid_output", "Model output was not JSON");
        }
        const parsed = req.validate.safeParse(candidate);
        if (parsed.success) return { ok: true, value: parsed.data, model, attempts };
        const issue = parsed.error.issues[0];
        last = { kind: "invalid_output", message: `Output failed validation: ${issue?.path.join(".")} ${issue?.message}` };
        // One repair turn with the validation error, then move on.
        messages = [
          ...req.messages,
          { role: "assistant", content },
          { role: "user", content: `That JSON is invalid (${last.message}). Reply with corrected JSON only.` },
        ];
      } catch (e) {
        if (!(e instanceof AiCallError)) throw e;
        last = { kind: e.kind, message: e.message };
        if (e.kind === "auth") return { ok: false, error: e.kind, message: e.message, attempts };
        break; // try next model
      }
    }
  }
  return { ok: false, error: last.kind, message: last.message, attempts };
}
