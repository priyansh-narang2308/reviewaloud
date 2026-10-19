import { NextResponse, type NextRequest } from "next/server";
import { parsePrInput, workspacePath } from "@/lib/github/url";

// No-JS fallback for the landing form (also covers submits before hydration).
export function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get("pr-url") ?? "";
  const r = parsePrInput(input);
  const to = new URL(r.ok ? workspacePath(r.ref) : "/", req.nextUrl);
  if (!r.ok) to.searchParams.set("pr-url", input.slice(0, 300));
  return NextResponse.redirect(to, 303);
}
