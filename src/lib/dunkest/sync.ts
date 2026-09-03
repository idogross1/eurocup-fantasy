import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { runBatched } from "@/db/batch";
import { schema, type Db } from "@/db/connection";
import type { PlayerPosition } from "@/db/schema";
import { setSetting } from "@/lib/kv";

import { makeClient } from "./client";
import { endpoints, fetchAllPlayers } from "./endpoints";
import type { DunkPlayer } from "./types";

type DB = Db;

const POSITION_BY_ID: Record<number, PlayerPosition> = {
  28: "Guard",
  29: "Forward",
  30: "Center",
  31: "Head Coach",
};
const VALID_POSITIONS: PlayerPosition[] = ["Guard", "Forward", "Center", "Head Coach"];

function resolvePosition(p: DunkPlayer): PlayerPosition | null {
  const name = p.position?.name as PlayerPosition | undefined;
  if (name && VALID_POSITIONS.includes(name)) return name;
  const byId = p.position?.id ? POSITION_BY_ID[p.position.id] : undefined;
  return byId ?? null;
}

function isCaptainFlag(p: DunkPlayer): boolean {
  return Boolean(p.is_captain || p.role === "captain" || p.slot === "captain");
}

function slotFrom(p: DunkPlayer): string | null {
  if (p.slot) return p.slot;
  if (p.role) return p.role;
  if (typeof p.started_from_bench === "boolean") {
    return p.started_from_bench ? "bench" : "starter";
  }
  return null;
}

export type SyncSummary = {
  matchdayId: number;
  matchdayNumber: number;
  playersListId: number;
  playersUpserted: number;
  prunedPlayers: number;
  teamsUpserted: number;
  syncedTeams: { id: number; name: string; rosterSize: number; position: number | null }[];
  ranAt: string;
};

export type SyncOptions = {
  token: string;
  leagueId?: number;
  gameMode?: number;
};

export async function syncFromDunkest(db: DB, opts: SyncOptions): Promise<SyncSummary> {
  const logId = await insertLogStart(db);
  try {
    const summary = await runSync(db, opts);
    await db
      .update(schema.syncLog)
      .set({ finishedAt: new Date().toISOString(), ok: true, summary: JSON.stringify(summary) })
      .where(eq(schema.syncLog.id, logId));
    return summary;
  } catch (e) {
    await db
      .update(schema.syncLog)
      .set({ finishedAt: new Date().toISOString(), ok: false, error: (e as Error).message })
      .where(eq(schema.syncLog.id, logId));
    throw e;
  }
}

async function insertLogStart(db: DB): Promise<number> {
  const row = await db
    .insert(schema.syncLog)
    .values({ startedAt: new Date().toISOString() })
    .returning({ id: schema.syncLog.id })
    .get();
  return row!.id;
}

async function runSync(db: DB, opts: SyncOptions): Promise<SyncSummary> {
  const leagueId = opts.leagueId ?? 11;
  const gameMode = opts.gameMode ?? 1;
  const api = endpoints(makeClient(opts.token), leagueId);

  const lc = await api.leagueConfig();
  const mdId = lc.current_matchday?.id;
  const mdNum = lc.current_matchday?.number ?? 0;
  const plId = lc.current_players_list_id;
  const roundStartedAt = lc.current_round?.started_at ?? null;
  const roundNumber = lc.current_round?.number ?? null;
  if (!mdId || !plId) {
    throw new Error("league config missing current_matchday.id / current_players_list_id");
  }

  // matchday (mark current, clear the flag elsewhere)
  await db
    .insert(schema.matchdays)
    .values({ id: mdId, number: mdNum, label: `Matchday ${mdNum}`, isCurrent: true })
    .onConflictDoUpdate({
      target: schema.matchdays.id,
      set: { number: mdNum, isCurrent: true },
    });
  await db
    .update(schema.matchdays)
    .set({ isCurrent: false })
    .where(ne(schema.matchdays.id, mdId));

  // round state for trade-window advice (see src/lib/trades/window.ts)
  await setSetting(db, "currentRound", { number: roundNumber, startedAt: roundStartedAt });

  // real teams (from league config + anything new in the player pool)
  const players = await fetchAllPlayers(api, plId, mdId);
  const realTeamNames = new Map<string, string>();
  for (const t of lc.teams ?? []) {
    if (t.abbreviation) realTeamNames.set(t.abbreviation, t.name ?? t.abbreviation);
  }
  for (const p of players) {
    const a = p.team?.abbreviation;
    if (a && !realTeamNames.has(a)) realTeamNames.set(a, p.team?.name ?? a);
  }
  const teamsUpserted = realTeamNames.size;
  await runBatched(
    db,
    [...realTeamNames].map(([abbr, name]) =>
      db
        .insert(schema.realTeams)
        .values({ abbr, name })
        .onConflictDoUpdate({ target: schema.realTeams.abbr, set: { name } }),
    ),
  );

  // player pool -> players + player_snapshots (source 'api'), batched
  let playersUpserted = 0;
  const seenPlayerIds = new Set<number>();
  const playerStmts: Parameters<typeof runBatched>[1] = [];
  for (const p of players) {
    const position = resolvePosition(p);
    const abbr = p.team?.abbreviation;
    if (!position || !abbr) continue;
    seenPlayerIds.add(p.id);

    playerStmts.push(
      db
        .insert(schema.players)
        .values({
          id: p.id,
          firstName: p.first_name ?? "",
          lastName: p.last_name ?? "",
          position,
          realTeamAbbr: abbr,
        })
        .onConflictDoUpdate({
          target: schema.players.id,
          set: {
            firstName: p.first_name ?? "",
            lastName: p.last_name ?? "",
            position,
            realTeamAbbr: abbr,
          },
        }),
    );

    const snap = {
      playerId: p.id,
      matchdayId: mdId,
      quotation: num(p.quotation, 0),
      avgPts: num(p.avg_pts, 0),
      popularity: num(p.popularity, 0),
      isInjured: Boolean(p.is_injured),
      probabilityOfPlaying: num(p.probability_of_playing, 1),
      opponentAbbr: p.opponent?.abbreviation ?? null,
      roundNumber: p.round?.number ?? null,
      startedFromBench:
        typeof p.started_from_bench === "boolean" ? p.started_from_bench : null,
      label: p.label ?? null,
      source: "api",
    };
    playerStmts.push(
      db
        .insert(schema.playerSnapshots)
        .values(snap)
        .onConflictDoUpdate({
          target: [schema.playerSnapshots.playerId, schema.playerSnapshots.matchdayId],
          set: snap,
        }),
    );
    playersUpserted += 1;
  }
  await runBatched(db, playerStmts);

  // Prune players that dropped out of the live pool (cut, transferred, left off
  // the squad). Their stale snapshot/projection would otherwise let the
  // optimiser draft a player who can't actually be bought. Guarded so a partial
  // API response can't wipe the pool.
  let prunedPlayers = 0;
  if (playersUpserted >= 100) {
    const currentSnapshots = await db
      .select({ playerId: schema.playerSnapshots.playerId })
      .from(schema.playerSnapshots)
      .where(eq(schema.playerSnapshots.matchdayId, mdId));
    const staleIds = currentSnapshots
      .map((r) => r.playerId)
      .filter((id) => !seenPlayerIds.has(id));
    if (staleIds.length > 0) {
      await runBatched(db, [
        db
          .delete(schema.projections)
          .where(
            and(
              inArray(schema.projections.playerId, staleIds),
              eq(schema.projections.matchdayId, mdId),
            ),
          ),
        db
          .delete(schema.playerSnapshots)
          .where(
            and(
              inArray(schema.playerSnapshots.playerId, staleIds),
              eq(schema.playerSnapshots.matchdayId, mdId),
            ),
          ),
      ]);
      prunedPlayers = staleIds.length;
    }
  }

  // your fantasy teams + their real rosters
  const fts = await api.fantasyTeams(gameMode);
  const syncedTeams: SyncSummary["syncedTeams"] = [];
  const priorSyncedTeams = await db
    .select({
      dunkestTeamId: schema.syncedTeams.dunkestTeamId,
      mapped: schema.syncedTeams.mappedFantasyTeamId,
    })
    .from(schema.syncedTeams);
  const priorMapByTeam = new Map(priorSyncedTeams.map((r) => [r.dunkestTeamId, r.mapped]));
  const existingMapped = new Set(
    priorSyncedTeams.map((r) => r.mapped).filter((v): v is number => v != null),
  );
  let nextAutoMap = [1, 2, 3].find((id) => !existingMapped.has(id)) ?? null;

  const knownPlayerRows = await db.select({ id: schema.players.id }).from(schema.players);
  const knownPlayerIds = new Set(knownPlayerRows.map((r) => r.id));

  for (const ft of fts.data ?? []) {
    let mapped = priorMapByTeam.get(ft.id) ?? null;
    if (mapped == null && nextAutoMap != null) {
      mapped = nextAutoMap;
      existingMapped.add(nextAutoMap);
      nextAutoMap = [1, 2, 3].find((id) => !existingMapped.has(id)) ?? null;
    }

    await db
      .insert(schema.syncedTeams)
      .values({
        dunkestTeamId: ft.id,
        name: ft.name ?? `Team ${ft.id}`,
        mappedFantasyTeamId: mapped,
        pts: ft.pts ?? null,
        totalPts: ft.total_pts ?? null,
        position: ft.position ?? null,
        syncedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: schema.syncedTeams.dunkestTeamId,
        set: {
          name: ft.name ?? `Team ${ft.id}`,
          mappedFantasyTeamId: mapped,
          pts: ft.pts ?? null,
          totalPts: ft.total_pts ?? null,
          position: ft.position ?? null,
          syncedAt: new Date().toISOString(),
        },
      });

    const roster = await api.roster(ft.id, mdId);
    const rosterPlayers = roster.data?.players ?? [];
    const rosterSyncedAt = new Date().toISOString();
    await runBatched(db, [
      db
        .delete(schema.syncedRosterEntries)
        .where(eq(schema.syncedRosterEntries.dunkestTeamId, ft.id)),
      ...rosterPlayers
        .filter((rp) => knownPlayerIds.has(rp.id)) // FK safety if roster has a player not in the pool
        .map((rp) =>
          db
            .insert(schema.syncedRosterEntries)
            .values({
              dunkestTeamId: ft.id,
              matchdayId: mdId,
              playerId: rp.id,
              slot: slotFrom(rp),
              isCaptain: isCaptainFlag(rp),
              formationId: roster.data?.formation_id ?? null,
              syncedAt: rosterSyncedAt,
            })
            .onConflictDoNothing(),
        ),
    ]);

    // history snapshot for this matchday (roster value from the snapshot prices)
    const rosterValueRow = await db
      .select({ v: sql<number>`coalesce(sum(${schema.playerSnapshots.quotation}), 0)` })
      .from(schema.syncedRosterEntries)
      .innerJoin(
        schema.playerSnapshots,
        and(
          eq(schema.playerSnapshots.playerId, schema.syncedRosterEntries.playerId),
          eq(schema.playerSnapshots.matchdayId, mdId),
        ),
      )
      .where(
        and(
          eq(schema.syncedRosterEntries.dunkestTeamId, ft.id),
          eq(schema.syncedRosterEntries.matchdayId, mdId),
        ),
      )
      .get();
    const rosterValue = rosterValueRow?.v ?? 0;

    const hist = {
      dunkestTeamId: ft.id,
      matchdayId: mdId,
      matchdayNumber: mdNum,
      globalPosition: ft.position ?? null,
      matchdayPts: ft.pts ?? null,
      totalPts: ft.total_pts ?? null,
      rosterValue: Math.round(rosterValue * 10) / 10,
      rosterSize: rosterPlayers.length,
      capturedAt: new Date().toISOString(),
    };
    await db
      .insert(schema.teamHistory)
      .values(hist)
      .onConflictDoUpdate({
        target: [schema.teamHistory.dunkestTeamId, schema.teamHistory.matchdayId],
        set: hist,
      });

    syncedTeams.push({
      id: ft.id,
      name: ft.name ?? `Team ${ft.id}`,
      rosterSize: rosterPlayers.length,
      position: ft.position ?? null,
    });
  }

  return {
    matchdayId: mdId,
    matchdayNumber: mdNum,
    playersListId: plId,
    playersUpserted,
    prunedPlayers,
    teamsUpserted,
    syncedTeams,
    ranAt: new Date().toISOString(),
  };
}

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
