import { and, eq } from "drizzle-orm";

import { schema, type Db } from "@/db/connection";
import type { PlayerPosition } from "@/db/schema";
import { FORMATIONS } from "@/lib/optimizer/formations";

import { getCurrentMatchday, type MatchdayRow } from "./players";

type DB = Db;
type Pos = "Guard" | "Forward" | "Center";
type Slot = "starter" | "sixth" | "bench" | "coach";

const SLOT_PHRASE: Record<Slot, string> = {
  starter: "starter",
  sixth: "6th man",
  bench: "bench",
  coach: "coach",
};

export type PlanPlayer = {
  id: number;
  name: string;
  position: PlayerPosition;
  teamAbbr: string;
  opponentAbbr: string | null;
  mean: number;
  roundNumber: number | null; // which turn (game-day) this player's club plays
  rosterSlot: Slot; // recommended slot for the round
  isCaptain: boolean; // recommended captain for the round
};

/**
 * Comparison against your actual saved lineup in the app (from the last sync).
 * Scoped to *lineup* (starter/6th man/bench/captain) only — a mismatch in
 * which 11 players you own is a Trades concern, flagged here as
 * "roster-mismatch" and left for that page.
 */
export type LineupCheck =
  | { status: "unsynced" }
  | { status: "roster-mismatch"; realTeamName: string; missingCount: number }
  | { status: "match"; realTeamName: string }
  | { status: "needs-fix"; realTeamName: string; fixes: string[] };

export type TurnPlan = {
  turn: number;
  starters: (PlanPlayer & { playing: boolean })[]; // 5, position-locked to the round's formation
  sixth: (PlanPlayer & { playing: boolean }) | null; // 1, any position
  bench: (PlanPlayer & { playing: boolean })[]; // 4
  coach: (PlanPlayer & { playing: boolean }) | null;
  captain: PlanPlayer | null; // from the 5 starters only, per the game's rules
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
 * Among a pool of same-tier candidates, fill `count` 100%-weighted slots with
 * whoever has a game this turn — highest projection first — then bench/spill
 * the rest. Used twice: once per position (to fill the formation-locked
 * starter slots) and once more, position-agnostic, on the leftover pool (to
 * pick the one 6th man). Because the *count* requested never changes turn to
 * turn — only *who* fills it does — this can never fail to find a "legal"
 * assignment the way a from-scratch formation search could.
 */
function turnOptimalSplit(
  pool: PlanPlayer[],
  count: number,
  turn: number,
): { filled: PlanPlayer[]; rest: PlanPlayer[] } {
  const sorted = [...pool].sort((a, b) => {
    const aPlay = a.roundNumber === turn;
    const bPlay = b.roundNumber === turn;
    if (aPlay !== bPlay) return aPlay ? -1 : 1;
    return b.mean - a.mean;
  });
  return { filled: sorted.slice(0, count), rest: sorted.slice(count) };
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

  // 1. fill the 5 position-locked starter slots first (formation is fixed for the round)
  const starters: PlanPlayer[] = [];
  const leftoverPool: PlanPlayer[] = [];
  for (const [, list] of byPos) {
    const starterCount = list.filter((p) => p.rosterSlot === "starter").length;
    const split = turnOptimalSplit(list, starterCount, turn);
    starters.push(...split.filled);
    leftoverPool.push(...split.rest);
  }

  // 2. the single best of what's left (any position) is the 6th man; the rest are bench
  const sixthSplit = turnOptimalSplit(leftoverPool, 1, turn);
  const sixth = sixthSplit.filled[0] ?? null;
  const bench = sixthSplit.rest;

  // swap instructions: compare the effective "100% group" (starters + sixth)
  // against the round's base assignment, regardless of which of the two
  // sub-roles each side of a swap lands in
  const field = sixth ? [...starters, sixth] : starters;
  const baseField = outfield.filter((p) => p.rosterSlot === "starter" || p.rosterSlot === "sixth");
  const fieldIds = new Set(field.map((p) => p.id));
  const baseFieldIds = new Set(baseField.map((p) => p.id));
  const promoted = field.filter((p) => !baseFieldIds.has(p.id));
  const demoted = baseField.filter((p) => !fieldIds.has(p.id));
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
          .map((s) => {
            const samePos = s.in.position === s.out.position;
            return `Swap in ${s.in.name} for ${s.out.name}${samePos ? ` (both ${s.in.position}s)` : ""}`;
          })
          .join("; ") + ".";

  const withPlaying = (p: PlanPlayer) => ({ ...p, playing: p.roundNumber === turn });

  return {
    turn,
    starters: starters.map(withPlaying).sort((a, b) => b.mean - a.mean),
    sixth: sixth ? withPlaying(sixth) : null,
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
    const actualSlot = (actual.slot as Slot | null) ?? "bench";
    if (actualSlot !== p.rosterSlot) {
      fixes.push(
        `${p.name}: currently ${SLOT_PHRASE[actualSlot]} in the app — move to ${SLOT_PHRASE[p.rosterSlot]}`,
      );
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
      rosterSlot: r.slot as Slot,
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
