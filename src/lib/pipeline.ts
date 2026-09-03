import { desc, eq } from "drizzle-orm";

import { schema, type Db } from "@/db/connection";
import { syncFromDunkest, type SyncSummary } from "@/lib/dunkest/sync";
import { optimizeAllTeams } from "@/lib/optimizer/run";
import { computeProjections } from "@/lib/projections/compute";

type DB = Db;

async function currentMatchdayId(db: DB): Promise<number | null> {
  const cur = db
    .select()
    .from(schema.matchdays)
    .where(eq(schema.matchdays.isCurrent, true))
    .get();
  if (cur) return cur.id;
  const latest = db
    .select()
    .from(schema.matchdays)
    .orderBy(desc(schema.matchdays.number))
    .get();
  return latest?.id ?? null;
}

export type RefreshResult = {
  sync?: SyncSummary;
  projected?: number;
  teams?: { id: number; name: string; status: string; projPoints: number }[];
  skippedOptimize?: boolean;
};

/**
 * One round-tick: pull fresh data from Dunkest, recompute projections, and
 * (optionally) rebuild the 3 optimizer teams.
 */
export async function runFullRefresh(
  db: DB,
  opts: { token: string; leagueId?: number; gameMode?: number; optimize?: boolean },
): Promise<RefreshResult> {
  const sync = await syncFromDunkest(db, {
    token: opts.token,
    leagueId: opts.leagueId,
    gameMode: opts.gameMode,
  });

  const mdId = sync.matchdayId ?? (await currentMatchdayId(db));
  if (!mdId) return { sync, skippedOptimize: true };

  const projection = await computeProjections(db, mdId);

  if (opts.optimize === false) {
    return { sync, projected: projection.count, skippedOptimize: true };
  }

  const { teams } = await optimizeAllTeams(db, mdId);
  return {
    sync,
    projected: projection.count,
    teams: teams.map((t) => ({
      id: t.spec.teamId,
      name: t.spec.name,
      status: t.status,
      projPoints: t.projPoints,
    })),
  };
}
