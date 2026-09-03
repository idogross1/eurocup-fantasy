import { and, eq } from "drizzle-orm";

import { schema, type Db } from "@/db/connection";
import { setSetting } from "@/lib/kv";

type DB = Db;

export const OPTIMIZER_STALE_KEY = "optimizerStale";

export function markOptimizerStale(db: DB) {
  setSetting(db, OPTIMIZER_STALE_KEY, true);
}

type FlagPatch = {
  lock?: boolean;
  exclude?: boolean;
  boostPct?: number;
  injuryOverride?: "out" | "ok" | null;
};

/**
 * Upsert one player's manual flags. When injuryOverride flips to 'out' we stamp
 * the current round + the player's avg_pts so the dashboard can later detect a
 * flag that's gone stale (player healthy again, or has scored since).
 */
export function setPlayerFlag(db: DB, playerId: number, patch: FlagPatch) {
  const existing = db
    .select()
    .from(schema.playerFlags)
    .where(eq(schema.playerFlags.playerId, playerId))
    .get();

  const next = {
    lock: patch.lock ?? existing?.lock ?? false,
    exclude: patch.exclude ?? existing?.exclude ?? false,
    boostPct: patch.boostPct ?? existing?.boostPct ?? 0,
    injuryOverride:
      patch.injuryOverride === undefined
        ? (existing?.injuryOverride ?? null)
        : patch.injuryOverride,
  };

  // capture / clear override context
  let overrideRound = existing?.overrideRound ?? null;
  let overrideAvgPts = existing?.overrideAvgPts ?? null;
  let overrideSetAt = existing?.overrideSetAt ?? null;
  const wasOut = existing?.injuryOverride === "out";
  const nowOut = next.injuryOverride === "out";
  if (nowOut && !wasOut) {
    const md = db
      .select()
      .from(schema.matchdays)
      .where(eq(schema.matchdays.isCurrent, true))
      .get();
    const snap = md
      ? db
          .select({ avg: schema.playerSnapshots.avgPts })
          .from(schema.playerSnapshots)
          .where(
            and(
              eq(schema.playerSnapshots.playerId, playerId),
              eq(schema.playerSnapshots.matchdayId, md.id),
            ),
          )
          .get()
      : null;
    overrideRound = md?.number ?? null;
    overrideAvgPts = snap?.avg ?? 0;
    overrideSetAt = new Date().toISOString();
  } else if (!nowOut) {
    overrideRound = null;
    overrideAvgPts = null;
    overrideSetAt = null;
  }

  const row = { playerId, ...next, overrideRound, overrideAvgPts, overrideSetAt };

  // drop the row entirely if nothing is set — keeps the table clean
  const isEmpty =
    !row.lock && !row.exclude && row.boostPct === 0 && row.injuryOverride == null;
  if (isEmpty) {
    db.delete(schema.playerFlags).where(eq(schema.playerFlags.playerId, playerId)).run();
  } else {
    db.insert(schema.playerFlags)
      .values(row)
      .onConflictDoUpdate({ target: schema.playerFlags.playerId, set: row })
      .run();
  }

  markOptimizerStale(db);
}

export function clearPlayerFlag(db: DB, playerId: number) {
  db.delete(schema.playerFlags).where(eq(schema.playerFlags.playerId, playerId)).run();
  markOptimizerStale(db);
}

export type StaleOutFlag = {
  playerId: number;
  name: string;
  teamAbbr: string;
  reason: "healthy" | "played";
  detail: string;
};

/**
 * Players manually marked Out whose latest snapshot contradicts that:
 *  - "healthy": Dunkest reports not-injured and full play probability
 *  - "played":  avg_pts has risen since the flag was set (he's been scoring)
 * "played" is the stronger signal — your lineups have been missing a usable guy.
 */
export function findStaleOutFlags(db: DB): StaleOutFlag[] {
  const md = db
    .select()
    .from(schema.matchdays)
    .where(eq(schema.matchdays.isCurrent, true))
    .get();
  if (!md) return [];

  const rows = db
    .select({
      playerId: schema.playerFlags.playerId,
      overrideAvgPts: schema.playerFlags.overrideAvgPts,
      overrideRound: schema.playerFlags.overrideRound,
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      teamAbbr: schema.players.realTeamAbbr,
      isInjured: schema.playerSnapshots.isInjured,
      prob: schema.playerSnapshots.probabilityOfPlaying,
      avgPts: schema.playerSnapshots.avgPts,
    })
    .from(schema.playerFlags)
    .innerJoin(schema.players, eq(schema.players.id, schema.playerFlags.playerId))
    .leftJoin(
      schema.playerSnapshots,
      and(
        eq(schema.playerSnapshots.playerId, schema.playerFlags.playerId),
        eq(schema.playerSnapshots.matchdayId, md.id),
      ),
    )
    .where(eq(schema.playerFlags.injuryOverride, "out"))
    .all();

  const out: StaleOutFlag[] = [];
  for (const r of rows) {
    const name = `${r.firstName} ${r.lastName}`.trim();
    const base = r.overrideAvgPts ?? 0;
    const now = r.avgPts ?? 0;
    if (now - base > 0.1) {
      out.push({
        playerId: r.playerId,
        name,
        teamAbbr: r.teamAbbr,
        reason: "played",
        detail: `marked Out${
          r.overrideRound ? ` in R${r.overrideRound}` : ""
        } but has scored since (avg ${base.toFixed(1)} → ${now.toFixed(1)}) — clear the flag`,
      });
    } else if (r.isInjured === false && (r.prob ?? 0) >= 1) {
      out.push({
        playerId: r.playerId,
        name,
        teamAbbr: r.teamAbbr,
        reason: "healthy",
        detail: "marked Out, but Dunkest now shows him available — review",
      });
    }
  }
  return out;
}

export function isOptimizerStale(db: DB): boolean {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, OPTIMIZER_STALE_KEY))
    .get();
  if (!row) return false;
  try {
    return JSON.parse(row.value) === true;
  } catch {
    return false;
  }
}
