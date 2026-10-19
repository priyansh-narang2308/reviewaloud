// Reports which features are configured. Prints variable NAMES only, never values.
import { readFileSync, existsSync } from "node:fs";
import { FEATURES, missingFor, parseEnv } from "../lib/env";

function loadDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const e = parseEnv({ ...loadDotEnv(".env.local"), ...process.env });
let ok = true;
for (const f of FEATURES) {
  const missing = missingFor(f, e);
  if (missing.length) ok = false;
  console.log(`${missing.length ? "MISSING" : "OK     "}  ${f}${missing.length ? `  (${missing.join(", ")})` : ""}`);
}
process.exit(ok ? 0 : 1);
