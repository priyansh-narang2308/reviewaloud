import { z } from "zod";

// Server-only environment. Every variable is optional at boot so the public
// demo runs with no credentials; each feature asks for exactly what it needs
// and fails with the name of the missing variable.

const repoSlug = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo");

const schema = z.object({
  GITHUB_APP_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_APP_SLUG: z.string().min(1).optional(),
  GITHUB_PUBLIC_READ_TOKEN: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
  APP_URL: z.url().optional(),
  // Comma-separated owner/repo list. When set, write actions are refused for
  // any other repository.
  WRITE_REPO_ALLOWLIST: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    )
    .pipe(z.array(repoSlug).optional()),
  AI_DAILY_CALL_CAP: z.coerce.number().int().positive().default(60),
});

export type ServerEnv = z.infer<typeof schema>;

export class MissingEnvError extends Error {
  constructor(public readonly keys: string[]) {
    super(`Missing required environment variable(s): ${keys.join(", ")}`);
    this.name = "MissingEnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  // Treat empty strings as unset so a blank line in .env.local doesn't pass validation.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("lib/env is server-only");
  }
  cached ??= parseEnv(process.env);
  return cached;
}

type Feature = "githubAuth" | "publicRead" | "ai" | "session";

const requirements: Record<Feature, (keyof ServerEnv)[]> = {
  githubAuth: ["GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_SLUG"],
  publicRead: ["GITHUB_PUBLIC_READ_TOKEN"],
  ai: ["ANTHROPIC_API_KEY"],
  session: ["SESSION_SECRET"],
};

export function missingFor(feature: Feature, e: ServerEnv = env()): string[] {
  return requirements[feature].filter((k) => e[k] === undefined);
}

export function requireFeature(feature: Feature, e: ServerEnv = env()): void {
  const missing = missingFor(feature, e);
  if (missing.length) throw new MissingEnvError(missing);
}

export const FEATURES = Object.keys(requirements) as Feature[];
