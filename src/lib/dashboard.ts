import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getLastSync, getSetting, resolveDunkestToken } from "@/lib/kv";
import { getCurrentMatchday } from "@/lib/players";
import { tradeWindowStatus } from "@/lib/trades/window";

export type ActionItem = {
  severity: "high" | "med" | "low";
  text: string;
  href?: string;
};

export type DashboardData = {
  actions: ActionItem[];
  roundCountdownDays: number | null;
  windowLabel: string;
  turnBalance: { fantasyTeamId: number; name: string; worstTurn: number; count: number }[];
};

export async function getDashboard(): Promise<DashboardData> {
  const matchday = await getCurrentMatchday();
  const lastSync = getLastSync(db);
  const hasToken = Boolean(resolveDunkestToken(db));
  const round = getSetting<{ number: number | null; startedAt: string | null }>(db, "currentRound");
  const window = tradeWindowStatus(round);

  const actions: ActionItem[] = [];

  if (!hasToken) {
    actions.push({ severity: "high", text: "No Dunkest token set — live sync disabled", href: "/settings" });
  }
  if (!lastSync) {
    actions.push({ severity: "med", text: "Never synced", href: "/settings" });
  } else if (!lastSync.ok) {
    actions.push({ severity: "high", text: `Last sync failed: ${lastSync.error ?? "unknown"}`, href: "/settings" });
  } else {
    const ageH = (Date.now() - new Date(lastSync.startedAt).getTime()) / 3.6e6;
    if (ageH > 24) {
      actions.push({
        severity: "med",
        text: `Sync is ${Math.round(ageH / 24)}d old`,
        href: "/settings",
      });
    }
  }

  // round countdown
  let roundCountdownDays: number | null = null;
  if (round?.startedAt) {
    const ms = new Date(round.startedAt).getTime() - Date.now();
    roundCountdownDays = ms > 0 ? Math.ceil(ms / 8.64e7) : 0;
  }

  const syncedTeams = await db.select().from(schema.syncedTeams);
  const mappedCount = syncedTeams.filter((s) => s.mappedFantasyTeamId != null).length;
  if (mappedCount < 3) {
    actions.push({
      severity: "low",
      text: `Only ${mappedCount}/3 real teams created & mapped`,
      href: "/settings",
    });
  }

  // pending trades per team (not applied)
  if (matchday) {
    const openTrades = await db
      .select({
        fantasyTeamId: schema.trades.fantasyTeamId,
      })
      .from(schema.trades)
      .where(
        and(eq(schema.trades.matchdayId, matchday.id), eq(schema.trades.applied, false)),
      );
    const byTeam = new Map<number, number>();
    for (const r of openTrades) byTeam.set(r.fantasyTeamId, (byTeam.get(r.fantasyTeamId) ?? 0) + 1);
    for (const [teamId, n] of byTeam) {
      actions.push({
        severity: window.locked ? "low" : "med",
        text: `Team ${teamId}: ${n} unmade move${n === 1 ? "" : "s"}${
          window.locked ? " (round locked — apply after)" : ""
        }`,
        href: "/trades",
      });
    }
  }

  // turn balance check on the current optimizer rosters
  const turnBalance: DashboardData["turnBalance"] = [];
  if (matchday) {
    const rows = await db
      .select({
        fantasyTeamId: schema.rosterEntries.fantasyTeamId,
        turn: schema.playerSnapshots.roundNumber,
        position: schema.players.position,
      })
      .from(schema.rosterEntries)
      .innerJoin(schema.players, eq(schema.players.id, schema.rosterEntries.playerId))
      .leftJoin(
        schema.playerSnapshots,
        and(
          eq(schema.playerSnapshots.playerId, schema.rosterEntries.playerId),
          eq(schema.playerSnapshots.matchdayId, matchday.id),
        ),
      )
      .where(
        and(
          eq(schema.rosterEntries.matchdayId, matchday.id),
          eq(schema.rosterEntries.source, "optimizer"),
        ),
      );

    const fantasyTeams = await db.select().from(schema.fantasyTeams);
    const nameById = new Map(fantasyTeams.map((f) => [f.id, f.name]));
    const perTeam = new Map<number, Map<number, number>>();
    for (const r of rows) {
      if (r.position === "Head Coach" || r.turn == null) continue;
      const m = perTeam.get(r.fantasyTeamId) ?? new Map<number, number>();
      m.set(r.turn, (m.get(r.turn) ?? 0) + 1);
      perTeam.set(r.fantasyTeamId, m);
    }
    for (const [teamId, m] of perTeam) {
      if (m.size < 2) continue;
      let worstTurn = 0;
      let count = 99;
      for (const [turn, n] of m) if (n < count) ((count = n), (worstTurn = turn));
      if (count < 5) {
        turnBalance.push({ fantasyTeamId: teamId, name: nameById.get(teamId) ?? "", worstTurn, count });
        actions.push({
          severity: "med",
          text: `Team ${teamId} has only ${count} outfielders in Turn ${worstTurn}`,
          href: "/planner",
        });
      }
    }
  }

  const order = { high: 0, med: 1, low: 2 };
  actions.sort((a, b) => order[a.severity] - order[b.severity]);

  return { actions, roundCountdownDays, windowLabel: window.label, turnBalance };
}
