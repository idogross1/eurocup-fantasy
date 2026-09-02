import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { schema } from "@/db/connection";
import type { PlayerPosition } from "@/db/schema";

import {
  DEFAULT_MODEL_PARAMS,
  projectPlayer,
  type ModelParams,
  type ProjectionInput,
} from "./model";

type DB = BetterSQLite3Database<typeof schema>;

const MODEL_PARAMS_KEY = "projectionModel";

/** Merge stored overrides (settings.projectionModel) over the defaults. */
export async function getModelParams(db: DB): Promise<ModelParams> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, MODEL_PARAMS_KEY))
    .limit(1);
  if (!row) return DEFAULT_MODEL_PARAMS;
  try {
    const stored = JSON.parse(row.value) as Partial<ModelParams>;
    return {
      ...DEFAULT_MODEL_PARAMS,
      ...stored,
      positionMeanMult: {
        ...DEFAULT_MODEL_PARAMS.positionMeanMult,
        ...(stored.positionMeanMult ?? {}),
      },
      positionCvAdj: {
        ...DEFAULT_MODEL_PARAMS.positionCvAdj,
        ...(stored.positionCvAdj ?? {}),
      },
    };
  } catch {
    return DEFAULT_MODEL_PARAMS;
  }
}

/** team abbr -> sum of its top-N player quotations for this matchday */
function buildTeamStrengths(
  rows: { teamAbbr: string; position: PlayerPosition; quotation: number }[],
  topN: number,
): Map<string, number> {
  const byTeam = new Map<string, number[]>();
  for (const r of rows) {
    if (r.position === "Head Coach") continue;
    const arr = byTeam.get(r.teamAbbr) ?? [];
    arr.push(r.quotation);
    byTeam.set(r.teamAbbr, arr);
  }
  const out = new Map<string, number>();
  for (const [abbr, qs] of byTeam) {
    qs.sort((a, b) => b - a);
    out.set(abbr, qs.slice(0, topN).reduce((s, q) => s + q, 0));
  }
  return out;
}

export type ComputeSummary = {
  matchdayId: number;
  count: number;
  params: ModelParams;
  top: { name: string; position: string; mean: number; floor: number; ceiling: number }[];
};

export async function computeProjections(
  db: DB,
  matchdayId: number,
  paramsOverride?: ModelParams,
): Promise<ComputeSummary> {
  const params = paramsOverride ?? (await getModelParams(db));

  const rows = await db
    .select({
      playerId: schema.players.id,
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      position: schema.players.position,
      teamAbbr: schema.players.realTeamAbbr,
      quotation: schema.playerSnapshots.quotation,
      avgPts: schema.playerSnapshots.avgPts,
      isInjured: schema.playerSnapshots.isInjured,
      probabilityOfPlaying: schema.playerSnapshots.probabilityOfPlaying,
      opponentAbbr: schema.playerSnapshots.opponentAbbr,
    })
    .from(schema.playerSnapshots)
    .innerJoin(schema.players, eq(schema.players.id, schema.playerSnapshots.playerId))
    .where(eq(schema.playerSnapshots.matchdayId, matchdayId));

  const strengths = buildTeamStrengths(rows, params.coachStrengthTopN);

  const flags = await db.select().from(schema.playerFlags);
  const flagById = new Map(flags.map((f) => [f.playerId, f]));

  const values = rows.map((r) => {
    const flag = flagById.get(r.playerId);
    const input: ProjectionInput = {
      position: r.position,
      quotation: r.quotation,
      avgPts: r.avgPts,
      isInjured: r.isInjured,
      probabilityOfPlaying: r.probabilityOfPlaying,
      injuryOverride: (flag?.injuryOverride as "out" | "ok" | null) ?? null,
      teamStrength: strengths.get(r.teamAbbr),
      oppStrength: r.opponentAbbr ? strengths.get(r.opponentAbbr) : undefined,
    };
    const res = projectPlayer(input, params);
    return {
      playerId: r.playerId,
      matchdayId,
      mean: res.mean,
      floor: res.floor,
      ceiling: res.ceiling,
      sigma: res.sigma,
      model: res.model,
      _name: `${r.firstName} ${r.lastName}`,
      _position: r.position,
    };
  });

  // better-sqlite3 transactions are synchronous — use .run(), not an async cb.
  db.transaction((tx) => {
    for (const v of values) {
      const { _name, _position, ...record } = v;
      void _name;
      void _position;
      tx
        .insert(schema.projections)
        .values(record)
        .onConflictDoUpdate({
          target: [schema.projections.playerId, schema.projections.matchdayId],
          set: {
            mean: record.mean,
            floor: record.floor,
            ceiling: record.ceiling,
            sigma: record.sigma,
            model: record.model,
            computedAt: new Date().toISOString(),
          },
        })
        .run();
    }
  });

  const top = [...values]
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 15)
    .map((v) => ({
      name: v._name,
      position: v._position,
      mean: v.mean,
      floor: v.floor,
      ceiling: v.ceiling,
    }));

  return { matchdayId, count: values.length, params, top };
}
