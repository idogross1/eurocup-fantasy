import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { schema } from "@/db/connection";
import { setSetting } from "@/lib/kv";

import { solveTeam, type SolveOptions } from "./solve";
import type { OptimizerPlayer, StrategySpec, TeamResult } from "./types";

type DB = BetterSQLite3Database<typeof schema>;

const POOL_TOP_PER_POS: Record<string, number> = { Guard: 24, Forward: 24, Center: 16 };
const POOL_CHEAP_PER_POS = 5;

async function loadSettings(db: DB) {
  const rows = await db.select().from(schema.settings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, d: number) => {
    const v = map.get(k);
    if (v == null) return d;
    const n = Number(JSON.parse(v));
    return Number.isFinite(n) ? n : d;
  };
  return {
    overlapCap: num("overlapCap", 6),
    contrarianWeight: num("contrarianWeight", 0.2),
    turnBalancePenalty: num("turnBalancePenalty", 6),
    minPerTurn: num("minPerTurn", 5),
  };
}

export async function loadOptimizerPool(
  db: DB,
  matchdayId: number,
): Promise<OptimizerPlayer[]> {
  const rows = await db
    .select({
      id: schema.players.id,
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      position: schema.players.position,
      teamAbbr: schema.players.realTeamAbbr,
      quotation: schema.playerSnapshots.quotation,
      popularity: schema.playerSnapshots.popularity,
      opponentAbbr: schema.playerSnapshots.opponentAbbr,
      turn: schema.playerSnapshots.roundNumber,
      mean: schema.projections.mean,
      sigma: schema.projections.sigma,
    })
    .from(schema.projections)
    .innerJoin(schema.players, eq(schema.players.id, schema.projections.playerId))
    .innerJoin(
      schema.playerSnapshots,
      and(
        eq(schema.playerSnapshots.playerId, schema.projections.playerId),
        eq(schema.playerSnapshots.matchdayId, matchdayId),
      ),
    )
    .where(eq(schema.projections.matchdayId, matchdayId));

  return rows.map((r) => ({ ...r, mean: r.mean, sigma: r.sigma }));
}

/** Trim the pool to a tractable size for the MILP without losing the optimum. */
export function prefilterPool(pool: OptimizerPlayer[], lockIds: Set<number>): OptimizerPlayer[] {
  const keep = new Set<number>();
  const byPos = new Map<string, OptimizerPlayer[]>();
  for (const p of pool) {
    if (p.position === "Head Coach") {
      keep.add(p.id); // all coaches — only 32
      continue;
    }
    const arr = byPos.get(p.position) ?? [];
    arr.push(p);
    byPos.set(p.position, arr);
  }
  for (const [pos, arr] of byPos) {
    const topN = POOL_TOP_PER_POS[pos] ?? 18;
    [...arr].sort((a, b) => b.mean - a.mean).slice(0, topN).forEach((p) => keep.add(p.id));
    // ceiling upside for the aggressive team
    [...arr].sort((a, b) => b.mean + b.sigma - (a.mean + a.sigma)).slice(0, 10)
      .forEach((p) => keep.add(p.id));
    [...arr].sort((a, b) => a.quotation - b.quotation).slice(0, POOL_CHEAP_PER_POS)
      .forEach((p) => keep.add(p.id));
  }
  for (const id of lockIds) keep.add(id);
  return pool.filter((p) => keep.has(p.id));
}

export type OptimizeResult = { matchdayId: number; teams: TeamResult[] };

export async function optimizeAllTeams(db: DB, matchdayId: number): Promise<OptimizeResult> {
  const settings = await loadSettings(db);
  const pool = await loadOptimizerPool(db, matchdayId);
  if (pool.length === 0) {
    throw new Error(`no projections for matchday ${matchdayId} — run npm run project`);
  }

  const flags = await db.select().from(schema.playerFlags);
  const excludeIds = new Set(flags.filter((f) => f.exclude).map((f) => f.playerId));
  const lockIds = new Set(flags.filter((f) => f.lock).map((f) => f.playerId));
  const boostById = new Map(
    flags.filter((f) => f.boostPct !== 0).map((f) => [f.playerId, f.boostPct]),
  );

  const teams = await db.select().from(schema.fantasyTeams).orderBy(schema.fantasyTeams.id);
  const filtered = prefilterPool(pool, lockIds);

  const results: TeamResult[] = [];
  const priorRosters: { label: string; ids: Set<number>; cap: number }[] = [];

  for (const t of teams) {
    const spec: StrategySpec = {
      teamId: t.id,
      name: t.name,
      strategy: t.strategy,
      budget: t.budget,
      riskK: t.riskK,
    };
    const opts: SolveOptions = {
      excludeIds,
      lockIds,
      boostById,
      contrarianWeight: settings.contrarianWeight,
      turnBalancePenalty: settings.turnBalancePenalty,
      minPerTurn: settings.minPerTurn,
      overlapGroups: priorRosters.map((r) => ({ ...r })),
    };
    const res = solveTeam(filtered, spec, opts);
    results.push(res);
    if (res.status === "optimal") {
      priorRosters.push({
        label: `t${t.id}`,
        ids: new Set(res.players.map((p) => p.id)),
        cap: settings.overlapCap,
      });
    }
  }

  await persistRosters(db, matchdayId, results);
  setSetting(db, "optimizerStale", false);
  return { matchdayId, teams: results };
}

async function persistRosters(db: DB, matchdayId: number, results: TeamResult[]) {
  db.transaction((tx) => {
    for (const res of results) {
      tx.delete(schema.rosterEntries)
        .where(
          and(
            eq(schema.rosterEntries.fantasyTeamId, res.spec.teamId),
            eq(schema.rosterEntries.matchdayId, matchdayId),
            eq(schema.rosterEntries.source, "optimizer"),
          ),
        )
        .run();
      if (res.status !== "optimal") continue;
      for (const p of res.players) {
        tx.insert(schema.rosterEntries)
          .values({
            fantasyTeamId: res.spec.teamId,
            matchdayId,
            playerId: p.id,
            slot: p.slot,
            isCaptain: p.isCaptain,
            formationId: res.formationId,
            source: "optimizer",
          })
          .run();
      }
    }
  });
}
