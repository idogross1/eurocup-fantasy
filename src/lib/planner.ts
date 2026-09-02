import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { schema } from "@/db/connection";
import type { PlayerPosition } from "@/db/schema";
import { FORMATIONS } from "@/lib/optimizer/formations";

import { getCurrentMatchday, type MatchdayRow } from "./players";

type DB = BetterSQLite3Database<typeof schema>;

export type PlanPlayer = {
  id: number;
  name: string;
  position: PlayerPosition;
  teamAbbr: string;
  opponentAbbr: string | null;
  mean: number;
  roundNumber: number | null;
  rosterSlot: string; // optimizer slot: starter/sixth/bench/coach
};

export type TurnPlan = {
  turn: number;
  playing: PlanPlayer[];
  notPlaying: PlanPlayer[];
  starters: PlanPlayer[];
  bench: PlanPlayer[];
  coach: PlanPlayer | null;
  captain: PlanPlayer | null;
  formationName: string | null;
  note: string;
};

export type TeamPlan = {
  id: number;
  name: string;
  strategy: string;
  roster: PlanPlayer[];
  turns: TurnPlan[];
};

const POS_IDX: Record<string, 0 | 1 | 2> = { Guard: 0, Forward: 1, Center: 2 };

/** Best legal starting five from the players available a given turn. */
function bestStartingFive(eligible: PlanPlayer[]): {
  starters: PlanPlayer[];
  formationName: string | null;
} {
  const byPos: PlanPlayer[][] = [[], [], []];
  for (const p of eligible) {
    const i = POS_IDX[p.position];
    if (i !== undefined) byPos[i].push(p);
  }
  byPos.forEach((list) => list.sort((a, b) => b.mean - a.mean));

  let best: { starters: PlanPlayer[]; score: number; name: string } | null = null;
  for (const f of FORMATIONS) {
    const [g, fw, c] = f.comp;
    if (byPos[0].length < g || byPos[1].length < fw || byPos[2].length < c) continue;
    const pick = [...byPos[0].slice(0, g), ...byPos[1].slice(0, fw), ...byPos[2].slice(0, c)];
    const score = pick.reduce((s, p) => s + p.mean, 0);
    if (!best || score > best.score) best = { starters: pick, score, name: f.name };
  }
  if (best) return { starters: best.starters, formationName: best.name };

  // no legal formation this turn — just field the top 5 available
  return {
    starters: [...eligible].sort((a, b) => b.mean - a.mean).slice(0, 5),
    formationName: null,
  };
}

export async function getRoundPlan(db: DB): Promise<{
  matchday: MatchdayRow | null;
  turns: number[];
  teams: TeamPlan[];
}> {
  const matchday = await getCurrentMatchday();
  if (!matchday) return { matchday: null, turns: [], teams: [] };

  const rows = await db
    .select({
      fantasyTeamId: schema.rosterEntries.fantasyTeamId,
      slot: schema.rosterEntries.slot,
      id: schema.players.id,
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      position: schema.players.position,
      teamAbbr: schema.players.realTeamAbbr,
      opponentAbbr: schema.playerSnapshots.opponentAbbr,
      roundNumber: schema.playerSnapshots.roundNumber,
      mean: schema.projections.mean,
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

  const fantasyTeams = await db
    .select()
    .from(schema.fantasyTeams)
    .orderBy(schema.fantasyTeams.id);

  const turnsSet = new Set<number>();
  for (const r of rows) if (r.roundNumber != null) turnsSet.add(r.roundNumber);
  const turns = [...turnsSet].sort((a, b) => a - b);

  const byTeam = new Map<number, PlanPlayer[]>();
  for (const r of rows) {
    const p: PlanPlayer = {
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      position: r.position,
      teamAbbr: r.teamAbbr,
      opponentAbbr: r.opponentAbbr ?? null,
      mean: r.mean ?? 0,
      roundNumber: r.roundNumber ?? null,
      rosterSlot: r.slot,
    };
    (byTeam.get(r.fantasyTeamId) ?? byTeam.set(r.fantasyTeamId, []).get(r.fantasyTeamId)!).push(p);
  }

  const teams: TeamPlan[] = fantasyTeams
    .filter((ft) => byTeam.has(ft.id))
    .map((ft) => {
      const roster = (byTeam.get(ft.id) ?? []).sort((a, b) => b.mean - a.mean);
      const turnPlans: TurnPlan[] = turns.map((turn) => {
        const playing = roster.filter((p) => p.roundNumber === turn);
        const notPlaying = roster.filter((p) => p.roundNumber !== turn);
        const coach = playing.find((p) => p.position === "Head Coach") ?? null;
        const eligibleField = playing.filter((p) => p.position !== "Head Coach");
        const { starters, formationName } = bestStartingFive(eligibleField);
        const starterIds = new Set(starters.map((p) => p.id));
        const bench = eligibleField.filter((p) => !starterIds.has(p.id));
        const captain = starters.length
          ? starters.reduce((a, b) => (b.mean > a.mean ? b : a))
          : null;

        let note: string;
        if (eligibleField.length === 0) {
          note = `None of your outfield players have a game in Turn ${turn}.`;
        } else if (starters.length < 5) {
          note = `Only ${eligibleField.length} outfield players have a game in Turn ${turn} — field them all.`;
        } else if (!formationName) {
          note = `No legal formation from Turn ${turn}'s available players — top 5 by projection shown.`;
        } else {
          note = `Field these 5 (${formationName}), captain ${captain?.name}. Sub the rest in for Turn ${
            turns.find((x) => x !== turn) ?? "later"
          }.`;
        }

        return {
          turn,
          playing,
          notPlaying,
          starters,
          bench,
          coach,
          captain,
          formationName,
          note,
        };
      });

      return { id: ft.id, name: ft.name, strategy: ft.strategy, roster, turns: turnPlans };
    });

  return { matchday, turns, teams };
}
