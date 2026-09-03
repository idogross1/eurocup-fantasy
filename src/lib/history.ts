import { asc, eq } from "drizzle-orm";

import { db, schema } from "@/db";

export type HistoryPoint = {
  matchdayNumber: number;
  globalPosition: number | null;
  matchdayPts: number | null;
  totalPts: number | null;
  rosterValue: number | null;
  capturedAt: string;
};

export type TeamHistory = {
  dunkestTeamId: number;
  name: string;
  mappedFantasyTeamId: number | null;
  strategy: string | null;
  points: HistoryPoint[];
  latest: HistoryPoint | null;
  deltaPosition: number | null; // last - first (negative = climbed)
};

export async function getHistory(): Promise<TeamHistory[]> {
  const teams = await db.select().from(schema.syncedTeams).orderBy(schema.syncedTeams.dunkestTeamId);
  const fantasyTeams = await db.select().from(schema.fantasyTeams);
  const stratById = new Map(fantasyTeams.map((f) => [f.id, f.strategy]));

  const out: TeamHistory[] = [];
  for (const t of teams) {
    const rows = await db
      .select()
      .from(schema.teamHistory)
      .where(eq(schema.teamHistory.dunkestTeamId, t.dunkestTeamId))
      .orderBy(asc(schema.teamHistory.matchdayNumber));

    const points: HistoryPoint[] = rows.map((r) => ({
      matchdayNumber: r.matchdayNumber,
      globalPosition: r.globalPosition,
      matchdayPts: r.matchdayPts,
      totalPts: r.totalPts,
      rosterValue: r.rosterValue,
      capturedAt: r.capturedAt,
    }));

    const withPos = points.filter((p) => p.globalPosition != null);
    const deltaPosition =
      withPos.length >= 2
        ? (withPos[withPos.length - 1].globalPosition as number) -
          (withPos[0].globalPosition as number)
        : null;

    out.push({
      dunkestTeamId: t.dunkestTeamId,
      name: t.name,
      mappedFantasyTeamId: t.mappedFantasyTeamId,
      strategy: t.mappedFantasyTeamId ? (stratById.get(t.mappedFantasyTeamId) ?? null) : null,
      points,
      latest: points.at(-1) ?? null,
      deltaPosition,
    });
  }
  return out;
}
