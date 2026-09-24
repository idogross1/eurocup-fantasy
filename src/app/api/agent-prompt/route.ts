import { NextResponse } from "next/server";

import { db } from "@/db";
import { buildAllTeamsAgentPrompt } from "@/lib/agentPrompt";
import { DunkestError } from "@/lib/dunkest/client";
import { LEAGUE } from "@/lib/league";
import { resolveDunkestToken } from "@/lib/kv";
import { getCurrentMatchday } from "@/lib/players";
import { getRoundPlan } from "@/lib/planner";
import { runFullRefresh } from "@/lib/pipeline";
import { computeTradePlan } from "@/lib/trades/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// sync + 3 MILP solves + plan/prompt build; same budget as /api/sync.
export const maxDuration = 60;

/**
 * Same freshness as /api/sync (pulls live data, reprojects, reoptimizes) but
 * returns the combined 3-team agent prompt instead of a sync summary — for
 * the daily "auto-prep the lineup prompt" schedule and for the `apply-lineup`
 * Claude Code skill to fetch on demand, so both always see today's data
 * without the user opening /planner first.
 *
 * GET only (read + refresh, no state mutation beyond the refresh itself,
 * mirroring /api/sync's cron trigger). Gated by the same CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const token = await resolveDunkestToken(db);
  if (!token) {
    return NextResponse.json(
      { error: "No Dunkest token configured. Add one on the Settings page." },
      { status: 400 },
    );
  }

  try {
    await runFullRefresh(db, { token, optimize: true });
  } catch (e) {
    if (e instanceof DunkestError) {
      return NextResponse.json({ error: e.message, status: e.status }, { status: 502 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const md = await getCurrentMatchday();
  const tradePlan = md ? await computeTradePlan(db, md.id) : null;
  const { teams } = await getRoundPlan(db);

  if (!tradePlan || teams.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nothing to plan yet — no matchday/teams after refresh." },
      { status: 200 },
    );
  }

  const tradeByFt = new Map(tradePlan.teams.map((t) => [t.fantasyTeamId, t]));
  const prompt = buildAllTeamsAgentPrompt(
    teams.map((team) => ({ team, trade: tradeByFt.get(team.id) })),
    LEAGUE.shortName,
    tradePlan.window,
  );

  return NextResponse.json({
    ok: true,
    league: LEAGUE.shortName,
    generatedAt: new Date().toISOString(),
    windowLabel: tradePlan.window.label,
    prompt,
  });
}
