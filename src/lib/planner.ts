import { and, eq } from "drizzle-orm";

import { schema, type Db } from "@/db/connection";
import type { PlayerPosition } from "@/db/schema";
import { FORMATIONS } from "@/lib/optimizer/formations";

import { getCurrentMatchday, type MatchdayRow } from "./players";

type DB = Db;
type Pos = "Guard" | "Forward" | "Center";

export type PlanPlayer = {
  id: number;
  name: string;
  position: PlayerPosition;
  teamAbbr: string;
  opponentAbbr: string | null;
  mean: number;
  roundNumber: number | null; // which turn (game-day) this player's club plays
  rosterSlot: "starter" | "bench" | "coach"; // recommended slot for the round
  isCaptain: boolean; // recommended captain for the round
};

/**
 * Comparison against your actual saved lineup in the app (from the last sync).
 * Scoped to *lineup* (starter/bench/captain) only — a mismatch in which 11
 * players you own is a Trades concern, flagged here as "roster-mismatch" and
 * left for that page.
 */
export type LineupCheck =
  | { status: "unsynced" }
  | { status: "roster-mismatch"; realTeamName: string; missingCount: number }
  | { status: "match"; realTeamName: string }
  | { status: "needs-fix"; realTeamName: string; fixes: string[] };

export type TurnPlan = {
  turn: number;
  starters: (PlanPlayer & { playing: boolean })[];
  bench: (PlanPlayer & { playing: boolean })[];
  coach: (PlanPlayer & { playing: boolean }) | null;
  captain: PlanPlayer | null;
  swaps: { in: PlanPlayer; out: PlanPlayer }[];
  note: string;
};

export type TeamPlan = {
  id: number;
  name: string;
  strategy: string;
  formationName: string | null;
  lineupCheck: LineupCheck;
  turns: TurnPlan[];
};

/**
 * The turn-optimal assignment for one position: among all roster players of
 * that position, the ones with a game this turn — highest projection first —
 * fill the (fixed, from the round's formation) number of 100% slots; the rest
 * sit at 50%. This can never fail to find a "legal formation" — the per-
 * position starter counts never change turn to turn, only *which* player of
 * that position fills them — so unlike a from-scratch formation search, there
 * is no "no legal formation" failure mode.
 */
function turnOptimalSplit(
  positionRoster: PlanPlayer[],
  starterCount: number,
  turn: number,
): { starters: PlanPlayer[]; bench: PlanPlayer[] } {
  const sorted = [...positionRoster].sort((a, b) => {
    const aPlay = a.roundNumber === turn;
    const bPlay = b.roundNumber === turn;
    if (aPlay !== bPlay) return aPlay ? -1 : 1;
    return b.mean - a.mean;
  });
  return { starters: sorted.slice(0, starterCount), bench: sorted.slice(starterCount) };
}

function computeTurnPlan(
  outfield: PlanPlayer[], // the 10 non-coach roster players, rosterSlot already set
  coach: PlanPlayer | null,
  turn: number,
): TurnPlan {
  const byPos = new Map<Pos, PlanPlayer[]>();
  for (const p of outfield) {
    const list = byPos.get(p.position as Pos) ?? [];
    list.push(p);
    byPos.set(p.position as Pos, list);
  }

  const starters: PlanPlayer[] = [];
  const bench: PlanPlayer[] = [];
  for (const [, list] of byPos) {
    const starterCount = list.filter((p) => p.rosterSlot === "starter").length;
    const split = turnOptimalSplit(list, starterCount, turn);
    starters.push(...split.starters);
    bench.push(...split.bench);
  }

  const promoted = starters.filter((p) => p.rosterSlot === "bench");
  const demoted = bench.filter((p) => p.rosterSlot === "starter");
  const swaps = promoted
    .sort((a, b) => b.mean - a.mean)
    .map((inP, i) => ({ in: inP, out: demoted[i] }))
    .filter((s) => s.out);

  const playingStarters = starters.filter((p) => p.roundNumber === turn);
  const captain = playingStarters.length
    ? playingStarters.reduce((a, b) => (b.mean > a.mean ? b : a))
    : null;

  const note =
    swaps.length === 0
      ? `No changes needed for Turn ${turn} — your saved lineup already covers it.`
      : swaps
          .map((s) => `Swap in ${s.in.name} for ${s.out.name} (both ${s.in.position}s)`)
          .join("; ") + ".";

  const withPlaying = (p: PlanPlayer) => ({ ...p, playing: p.roundNumber === turn });

  return {
    turn,
    starters: starters.map(withPlaying).sort((a, b) => b.mean - a.mean),
    bench: bench.map(withPlaying).sort((a, b) => b.mean - a.mean),
    coach: coach ? withPlaying(coach) : null,
    captain,
    swaps,
    note,
  };
}

async function buildLineupCheck(
  db: DB,
  matchdayId: number,
  outfield: PlanPlayer[],
  syncedTeam: { dunkestTeamId: number; name: string } | undefined,
): Promise<LineupCheck> {
  if (!syncedTeam) return { status: "unsynced" };

  const actualRows = await db
    .select({
      playerId: schema.syncedRosterEntries.playerId,
      slot: schema.syncedRosterEntries.slot,
      isCaptain: schema.syncedRosterEntries.isCaptain,
    })
    .from(schema.syncedRosterEntries)
    .where(
      and(
        eq(schema.syncedRosterEntries.dunkestTeamId, syncedTeam.dunkestTeamId),
        eq(schema.syncedRosterEntries.matchdayId, matchdayId),
      ),
    );
  if (actualRows.length === 0) return { status: "unsynced" };

  const actualByPlayer = new Map(actualRows.map((r) => [r.playerId, r]));
  const owned = outfield.filter((p) => actualByPlayer.has(p.id));
  const missingCount = outfield.length - owned.length;
  if (missingCount > 0) {
    return { status: "roster-mismatch", realTeamName: syncedTeam.name, missingCount };
  }

  const fixes: string[] = [];
  for (const p of owned) {
    const actual = actualByPlayer.get(p.id)!;
    const actualSlot = actual.slot === "bench" ? "bench" : "starter";
    if (actualSlot !== p.rosterSlot) {
      fixes.push(`${p.name}: currently ${actualSlot} in the app — move to ${p.rosterSlot}`);
    }
  }

  const recommendedCaptain = owned.find((p) => p.isCaptain);
  const actualCaptainId = actualRows.find((r) => r.isCaptain)?.playerId;
  if (recommendedCaptain && actualCaptainId !== recommendedCaptain.id) {
    const actualCaptainName = owned.find((p) => p.id === actualCaptainId)?.name ?? "someone else";
    fixes.push(`Captain: currently ${actualCaptainName} — set ${recommendedCaptain.name}`);
  }

  return fixes.length === 0
    ? { status: "match", realTeamName: syncedTeam.name }
    : { status: "needs-fix", realTeamName: syncedTeam.name, fixes };
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
      isCaptain: schema.rosterEntries.isCaptain,
      formationId: schema.rosterEntries.formationId,
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
  const syncedTeams = await db.select().from(schema.syncedTeams);
  const syncedByFt = new Map(
    syncedTeams.filter((s) => s.mappedFantasyTeamId != null).map((s) => [s.mappedFantasyTeamId!, s]),
  );

  const turnsSet = new Set<number>();
  for (const r of rows) if (r.roundNumber != null) turnsSet.add(r.roundNumber);
  const turns = [...turnsSet].sort((a, b) => a - b);

  const byTeam = new Map<number, typeof rows>();
  for (const r of rows) {
    (byTeam.get(r.fantasyTeamId) ?? byTeam.set(r.fantasyTeamId, []).get(r.fantasyTeamId)!).push(r);
  }

  const teams: TeamPlan[] = [];
  for (const ft of fantasyTeams) {
    const teamRows = byTeam.get(ft.id);
    if (!teamRows || teamRows.length === 0) continue;

    const toPlan = (r: (typeof teamRows)[number]): PlanPlayer => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      position: r.position,
      teamAbbr: r.teamAbbr,
      opponentAbbr: r.opponentAbbr ?? null,
      mean: r.mean ?? 0,
      roundNumber: r.roundNumber ?? null,
      rosterSlot: r.slot as "starter" | "bench" | "coach",
      isCaptain: r.isCaptain,
    });

    const outfield = teamRows.filter((r) => r.position !== "Head Coach").map(toPlan);
    const coach = teamRows.find((r) => r.position === "Head Coach");
    const coachPlan = coach ? toPlan(coach) : null;
    const formationId = teamRows.find((r) => r.formationId != null)?.formationId ?? null;

    const [lineupCheck, ...turnPlans] = await Promise.all([
      buildLineupCheck(db, matchday.id, outfield, syncedByFt.get(ft.id)),
      ...turns.map((turn) => Promise.resolve(computeTurnPlan(outfield, coachPlan, turn))),
    ]);

    teams.push({
      id: ft.id,
      name: ft.name,
      strategy: ft.strategy,
      formationName: FORMATIONS.find((f) => f.id === formationId)?.name ?? null,
      lineupCheck,
      turns: turnPlans as TurnPlan[],
    });
  }

  return { matchday, turns, teams };
}
