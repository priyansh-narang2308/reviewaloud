import { describe, expect, it } from "vitest";
import { MissingEnvError, missingFor, parseEnv, requireFeature } from "./env";

describe("parseEnv", () => {
  it("boots with no variables so the demo needs no credentials", () => {
    const e = parseEnv({});
    expect(e.AI_DAILY_CALL_CAP).toBe(60);
    expect(e.WRITE_REPO_ALLOWLIST).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    expect(parseEnv({ ANTHROPIC_API_KEY: "" }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("rejects a short session secret and names the variable", () => {
    expect(() => parseEnv({ SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("parses and validates the write allowlist", () => {
    expect(parseEnv({ WRITE_REPO_ALLOWLIST: "me/sandbox, me/other" }).WRITE_REPO_ALLOWLIST).toEqual([
      "me/sandbox",
      "me/other",
    ]);
    expect(() => parseEnv({ WRITE_REPO_ALLOWLIST: "not-a-slug" })).toThrow(/WRITE_REPO_ALLOWLIST/);
  });
});

describe("feature requirements", () => {
  it("names exactly the missing keys", () => {
    const e = parseEnv({ GITHUB_APP_CLIENT_ID: "x" });
    expect(missingFor("githubAuth", e)).toEqual(["GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_SLUG"]);
    try {
      requireFeature("ai", e);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MissingEnvError);
      expect((err as Error).message).toContain("ANTHROPIC_API_KEY");
    }
  });

  it("passes when the feature is configured", () => {
    expect(() => requireFeature("ai", parseEnv({ ANTHROPIC_API_KEY: "k" }))).not.toThrow();
  });
});
