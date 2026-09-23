import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { FORMATIONS } from "@/lib/optimizer/formations";

import { getCurrentMatchday } from "./players";

export type TeamRosterPlayer = {
  id: number;
  name: string;
  position: string;
  teamAbbr: string;
  quotation: number;
  mean: number | null;
  floor: number | null;
  ceiling: number | null;
  slot: string;
  isCaptain: boolean;
  opponentAbbr: string | null;
};

export type TeamView = {
  id: number;
  name: string;
  strategy: string;
  budget: number;
  riskK: number;
  formationName: string | null;
  creditsUsed: number;
  projPoints: number;
  players: TeamRosterPlayer[];
};

const SLOT_ORDER: Record<string, number> = { coach: 0, starter: 1, sixth: 2, bench: 3 };

export async function getTeamsForCurrentMatchday(): Promise<{
  matchday: Awaited<ReturnType<typeof getCurrentMatchday>>;
  teams: TeamView[];
}> {
  const matchday = await getCurrentMatchday();
  const fantasyTeams = await db
    .select()
    .from(schema.fantasyTeams)
    .orderBy(schema.fantasyTeams.id);

  if (!matchday) {
    return {
      matchday,
      teams: fantasyTeams.map((t) => ({
        id: t.id,
        name: t.name,
        strategy: t.strategy,
        budget: t.budget,
        riskK: t.riskK,
        formationName: null,
        creditsUsed: 0,
        projPoints: 0,
        players: [],
      })),
    };
  }

  const rows = await db
    .select({
      fantasyTeamId: schema.rosterEntries.fantasyTeamId,
      slot: schema.rosterEntries.slot,
      isCaptain: schema.rosterEntries.isCaptain,
      formationId: schema.rosterEntries.formationId,
      id: schema.players.id,
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      position: schema.players.position,
      teamAbbr: schema.players.realTeamAbbr,
      quotation: schema.playerSnapshots.quotation,
      opponentAbbr: schema.playerSnapshots.opponentAbbr,
      mean: schema.projections.mean,
      floor: schema.projections.floor,
      ceiling: schema.projections.ceiling,
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
    .leftJoin(
      schema.projections,
      and(
        eq(schema.projections.playerId, schema.rosterEntries.playerId),
        eq(schema.projections.matchdayId, matchday.id),
      ),
    )
    .where(
      and(
        eq(schema.rosterEntries.matchdayId, matchday.id),
        eq(schema.rosterEntries.source, "optimizer"),
      ),
    );

  const byTeam = new Map<number, typeof rows>();
  for (const r of rows) {
    const arr = byTeam.get(r.fantasyTeamId) ?? [];
    arr.push(r);
    byTeam.set(r.fantasyTeamId, arr);
  }

  const teams: TeamView[] = fantasyTeams.map((t) => {
    const rs = byTeam.get(t.id) ?? [];
    const players: TeamRosterPlayer[] = rs
      .map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`,
        position: r.position,
        teamAbbr: r.teamAbbr,
        quotation: r.quotation ?? 0,
        mean: r.mean,
        floor: r.floor,
        ceiling: r.ceiling,
        slot: r.slot,
        isCaptain: r.isCaptain,
        opponentAbbr: r.opponentAbbr ?? null,
      }))
      .sort((a, b) => (SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]) || (b.mean ?? 0) - (a.mean ?? 0));

    const formationId = rs.find((r) => r.formationId != null)?.formationId ?? null;
    const creditsUsed = Math.round(players.reduce((s, p) => s + p.quotation, 0) * 10) / 10;
    const projPoints =
      Math.round(
        players.reduce((s, p) => {
          const w = p.slot === "bench" ? 0.5 : 1;
          const capMult = p.isCaptain ? 2 : 1;
          return s + (p.mean ?? 0) * w * capMult;
        }, 0) * 10,
      ) / 10;

    return {
      id: t.id,
      name: t.name,
      strategy: t.strategy,
      budget: t.budget,
      riskK: t.riskK,
      formationName: FORMATIONS.find((f) => f.id === formationId)?.name ?? null,
      creditsUsed,
      projPoints,
      players,
    };
  });

  return { matchday, teams };
}
