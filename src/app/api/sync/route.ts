import { NextResponse } from "next/server";

import { db } from "@/db";
import { DunkestError } from "@/lib/dunkest/client";
import { resolveDunkestToken } from "@/lib/kv";
import { runFullRefresh } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = await resolveDunkestToken(db);
  if (!token) {
    return NextResponse.json(
      { error: "No Dunkest token configured. Add one on the Settings page." },
      { status: 400 },
    );
  }

  let optimize = true;
  try {
    const body = await req.json();
    if (body && body.optimize === false) optimize = false;
  } catch {
    // no body — default
  }

  try {
    const result = await runFullRefresh(db, { token, optimize });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof DunkestError) {
      return NextResponse.json({ error: e.message, status: e.status }, { status: 502 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
