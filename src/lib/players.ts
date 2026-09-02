import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";

export type PlayerRow = {
  id: number;
  firstName: string;
  lastName: string;
  position: string;
  teamAbbr: string;
  teamName: string;
  quotation: number;
  avgPts: number;
  popularity: number;
  isInjured: boolean;
  probabilityOfPlaying: number;
  opponentAbbr: string | null;
  roundNumber: number | null;
  label: string | null;
};

export type MatchdayRow = typeof schema.matchdays.$inferSelect;

export async function getCurrentMatchday(): Promise<MatchdayRow | null> {
  const [current] = await db
    .select()
    .from(schema.matchdays)
    .where(eq(schema.matchdays.isCurrent, true))
    .limit(1);
  if (current) return current;
  const [latest] = await db
    .select()
    .from(schema.matchdays)
    .orderBy(desc(schema.matchdays.number))
    .limit(1);
  return latest ?? null;
}

export async function getPlayersForCurrentMatchday(): Promise<{
  matchday: MatchdayRow | null;
  players: PlayerRow[];
}> {
  const matchday = await getCurrentMatchday();
  if (!matchday) return { matchday: null, players: [] };

  const rows = await db
    .select({
      id: schema.players.id,
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      position: schema.players.position,
      teamAbbr: schema.players.realTeamAbbr,
      teamName: schema.realTeams.name,
      quotation: schema.playerSnapshots.quotation,
      avgPts: schema.playerSnapshots.avgPts,
      popularity: schema.playerSnapshots.popularity,
      isInjured: schema.playerSnapshots.isInjured,
      probabilityOfPlaying: schema.playerSnapshots.probabilityOfPlaying,
      opponentAbbr: schema.playerSnapshots.opponentAbbr,
      roundNumber: schema.playerSnapshots.roundNumber,
      label: schema.playerSnapshots.label,
    })
    .from(schema.playerSnapshots)
    .innerJoin(schema.players, eq(schema.players.id, schema.playerSnapshots.playerId))
    .innerJoin(schema.realTeams, eq(schema.realTeams.abbr, schema.players.realTeamAbbr))
    .where(eq(schema.playerSnapshots.matchdayId, matchday.id));

  return { matchday, players: rows };
}
