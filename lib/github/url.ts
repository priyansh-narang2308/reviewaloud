import type { PrRef } from "./pr";

const NAME = "[A-Za-z0-9_.-]+";
const FORMS = [
  // https://github.com/o/r/pull/1, optionally with /files, /commits, query, hash
  new RegExp(`^(?:https?://)?(?:www\\.)?github\\.com/(${NAME})/(${NAME})/pull/(\\d+)(?:[/?#].*)?$`, "i"),
  // o/r#1
  new RegExp(`^(${NAME})/(${NAME})#(\\d+)$`),
  // o/r/pull/1
  new RegExp(`^(${NAME})/(${NAME})/pulls?/(\\d+)$`),
];

export type ParseResult = { ok: true; ref: PrRef } | { ok: false; error: string };

export function parsePrInput(input: string): ParseResult {
  const s = input.trim();
  if (!s) return { ok: false, error: "Paste a GitHub pull request URL." };
  for (const re of FORMS) {
    const m = s.match(re);
    if (m) {
      const [, owner, repo, n] = m;
      const number = Number(n);
      if (owner === "." || owner === ".." || repo === "." || repo === ".." || number < 1) break;
      return { ok: true, ref: { owner, repo, number } };
    }
  }
  if (/github\.com\/[^/]+\/[^/]+\/issues\/\d+/i.test(s)) {
    return { ok: false, error: "That's an issue link. Paste a pull request link (…/pull/123)." };
  }
  return { ok: false, error: "Use a link like https://github.com/owner/repo/pull/123 or owner/repo#123." };
}

export const workspacePath = ({ owner, repo, number }: PrRef) => `/pr/${owner}/${repo}/${number}`;
