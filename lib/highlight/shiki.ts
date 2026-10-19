"use client";

import type { HighlighterCore, ThemedToken } from "shiki/core";

// Client-side, lazily loaded highlighter: core + JS regex engine (no WASM),
// one theme, and grammars imported only when a file needs them.

const LANGS = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
} as const;
type Lang = keyof typeof LANGS;

const EXT: Record<string, Lang> = {
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  json: "json", css: "css", html: "html", htm: "html", md: "markdown", mdx: "markdown",
  yml: "yaml", yaml: "yaml", py: "python", go: "go", rs: "rust", java: "java", sh: "bash", bash: "bash", zsh: "bash",
};

export function langFor(path: string): Lang | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT[ext] ?? null;
}

export const THEME = "github-dark-default";
let highlighter: Promise<HighlighterCore> | undefined;
const loaded = new Set<Lang>();

async function get(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, theme] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("shiki/themes/github-dark-default.mjs"),
    ]);
    return createHighlighterCore({ themes: [theme.default], langs: [], engine: createJavaScriptRegexEngine() });
  })();
  return highlighter;
}

export type LineTokens = Pick<ThemedToken, "content" | "color">[];

/**
 * Tokenises diff lines in display order. Lines are joined so multi-line
 * constructs mostly highlight correctly; old and new lines interleave, so
 * results are approximate at hunk boundaries. Returns null for unknown
 * languages (rendered as plain text).
 */
export async function highlightLines(path: string, lines: string[]): Promise<LineTokens[] | null> {
  const lang = langFor(path);
  if (!lang) return null;
  const hl = await get();
  if (!loaded.has(lang)) {
    await hl.loadLanguage((await LANGS[lang]()).default);
    loaded.add(lang);
  }
  const tokens = hl.codeToTokensBase(lines.join("\n"), { lang, theme: THEME });
  // codeToTokensBase returns one array per line; keep only what we render.
  return tokens.map((line) => line.map((t) => ({ content: t.content, color: t.color })));
}
