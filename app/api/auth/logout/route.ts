import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/http/guard";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
