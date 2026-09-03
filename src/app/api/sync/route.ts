import { NextResponse } from "next/server";

import { db } from "@/db";
import { DunkestError } from "@/lib/dunkest/client";
import { resolveDunkestToken } from "@/lib/kv";
import { runFullRefresh } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// sync (~12s) + 3 MILP solves (~5s); give it headroom.
export const maxDuration = 60;

async function runSync(optimize: boolean) {
  const token = await resolveDunkestToken(db);
  if (!token) {
    return NextResponse.json(
      { error: "No Dunkest token configured. Add one on the Settings page." },
      { status: 400 },
    );
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

/** Manual trigger from the Settings "Sync now" button. */
export async function POST(req: Request) {
  let optimize = true;
  try {
    const body = await req.json();
    if (body && body.optimize === false) optimize = false;
  } catch {
    // no body — default
  }
  return runSync(optimize);
}

/**
 * Vercel Cron trigger (GET). When CRON_SECRET is set in the environment, Vercel
 * sends it as a Bearer token; reject anything else so the endpoint isn't a
 * public "refresh my account" button.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  return runSync(true);
}
