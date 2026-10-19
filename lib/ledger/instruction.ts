import type { PromiseItem, Verdict } from "./types";

export type AgentMention = "none" | "@claude" | "@copilot";

const strip = (body: string) => body.replace(/^\*\*[A-Za-z]+:\*\*\s*/, "").trim();

/**
 * A precise follow-up built only from the reviewer's own words and verified
 * evidence (no AI). Used both as a GitHub thread reply and as a prompt to
 * paste into a coding agent.
 */
export function followUpInstruction(p: PromiseItem, v: Verdict | undefined, mention: AgentMention = "none"): string {
  const where = `\`${p.path}\`${p.originalLine ? ` (${p.side === "LEFT" ? "deleted " : ""}line ${p.originalLine} when reviewed)` : ""}`;
  const lines: string[] = [];
  if (mention !== "none") lines.push(mention);
  lines.push(`This review request is still open (checked by ReviewAloud against the latest commit${v ? ` ${v.headSha.slice(0, 7)}` : ""}):`);
  lines.push("");
  lines.push(`> ${strip(p.body).split("\n").join("\n> ")}`);
  lines.push("");
  lines.push(`Where: ${where}`);
  if (v?.whatIsMissing) lines.push(`Still missing: ${v.whatIsMissing}`);
  const contra = v?.evidence.filter((e) => e.verified && !e.supports && e.kind === "code") ?? [];
  if (contra.length) {
    lines.push("Current code:");
    for (const e of contra.slice(0, 2)) lines.push(`- \`${e.path}:${e.startLine}\`: \`${e.quote.trim().slice(0, 160)}\``);
  }
  lines.push("");
  lines.push("Please fix this exactly as requested, or reply here explaining why not.");
  return lines.join("\n");
}

/** Plain prompt for pasting into Claude Code / another agent (no @mention). */
export function agentPrompt(p: PromiseItem, v: Verdict | undefined, prUrl: string): string {
  return `${followUpInstruction(p, v)}\n\nPR: ${prUrl}`;
}
