import { eq, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { schema } from "@/db/connection";
import type { PlayerPosition } from "@/db/schema";

import { makeClient } from "./client";
import { endpoints, fetchAllPlayers } from "./endpoints";
import type { DunkPlayer } from "./types";

type DB = BetterSQLite3Database<typeof schema>;

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
  const logId = insertLogStart(db);
  try {
    const summary = await runSync(db, opts);
    db.update(schema.syncLog)
      .set({ finishedAt: new Date().toISOString(), ok: true, summary: JSON.stringify(summary) })
      .where(eq(schema.syncLog.id, logId))
      .run();
    return summary;
  } catch (e) {
    db.update(schema.syncLog)
      .set({ finishedAt: new Date().toISOString(), ok: false, error: (e as Error).message })
      .where(eq(schema.syncLog.id, logId))
      .run();
    throw e;
  }
}

function insertLogStart(db: DB): number {
  const row = db
    .insert(schema.syncLog)
    .values({ startedAt: new Date().toISOString() })
    .returning({ id: schema.syncLog.id })
    .get();
  return row.id;
}

async function runSync(db: DB, opts: SyncOptions): Promise<SyncSummary> {
  const leagueId = opts.leagueId ?? 11;
  const gameMode = opts.gameMode ?? 1;
  const api = endpoints(makeClient(opts.token), leagueId);

  const lc = await api.leagueConfig();
  const mdId = lc.current_matchday?.id;
  const mdNum = lc.current_matchday?.number ?? 0;
  const plId = lc.current_players_list_id;
  if (!mdId || !plId) {
    throw new Error("league config missing current_matchday.id / current_players_list_id");
  }

  // matchday (mark current, clear the flag elsewhere)
  db.insert(schema.matchdays)
    .values({ id: mdId, number: mdNum, label: `Matchday ${mdNum}`, isCurrent: true })
    .onConflictDoUpdate({
      target: schema.matchdays.id,
      set: { number: mdNum, isCurrent: true },
    })
    .run();
  db.update(schema.matchdays)
    .set({ isCurrent: false })
    .where(ne(schema.matchdays.id, mdId))
    .run();

  // real teams
  let teamsUpserted = 0;
  for (const t of lc.teams ?? []) {
    if (!t.abbreviation) continue;
    db.insert(schema.realTeams)
      .values({ abbr: t.abbreviation, name: t.name ?? t.abbreviation })
      .onConflictDoUpdate({ target: schema.realTeams.abbr, set: { name: t.name ?? t.abbreviation } })
      .run();
    teamsUpserted += 1;
  }

  // player pool -> players + player_snapshots (source 'api')
  const players = await fetchAllPlayers(api, plId, mdId);
  let playersUpserted = 0;
  db.transaction(() => {
    for (const p of players) {
      const position = resolvePosition(p);
      const abbr = p.team?.abbreviation;
      if (!position || !abbr) continue;

      // ensure the real team exists even if it wasn't in lc.teams
      db.insert(schema.realTeams)
        .values({ abbr, name: p.team?.name ?? abbr })
        .onConflictDoNothing()
        .run();

      db.insert(schema.players)
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
        })
        .run();

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
      db.insert(schema.playerSnapshots)
        .values(snap)
        .onConflictDoUpdate({
          target: [schema.playerSnapshots.playerId, schema.playerSnapshots.matchdayId],
          set: snap,
        })
        .run();
      playersUpserted += 1;
    }
  });

  // your fantasy teams + their real rosters
  const fts = await api.fantasyTeams(gameMode);
  const syncedTeams: SyncSummary["syncedTeams"] = [];
  const existingMapped = new Set(
    db
      .select({ id: schema.syncedTeams.mappedFantasyTeamId })
      .from(schema.syncedTeams)
      .all()
      .map((r) => r.id)
      .filter((v): v is number => v != null),
  );
  let nextAutoMap = [1, 2, 3].find((id) => !existingMapped.has(id)) ?? null;

  for (const ft of fts.data ?? []) {
    const priorMap = db
      .select({ id: schema.syncedTeams.mappedFantasyTeamId })
      .from(schema.syncedTeams)
      .where(eq(schema.syncedTeams.dunkestTeamId, ft.id))
      .get()?.id;
    let mapped = priorMap ?? null;
    if (mapped == null && nextAutoMap != null) {
      mapped = nextAutoMap;
      existingMapped.add(nextAutoMap);
      nextAutoMap = [1, 2, 3].find((id) => !existingMapped.has(id)) ?? null;
    }

    db.insert(schema.syncedTeams)
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
      })
      .run();

    const roster = await api.roster(ft.id, mdId);
    const rosterPlayers = roster.data?.players ?? [];
    const knownPlayerIds = new Set(
      db.select({ id: schema.players.id }).from(schema.players).all().map((r) => r.id),
    );
    db.transaction(() => {
      db.delete(schema.syncedRosterEntries)
        .where(eq(schema.syncedRosterEntries.dunkestTeamId, ft.id))
        .run();
      for (const rp of rosterPlayers) {
        if (!knownPlayerIds.has(rp.id)) continue; // FK safety if roster has a player not in the pool
        db.insert(schema.syncedRosterEntries)
          .values({
            dunkestTeamId: ft.id,
            matchdayId: mdId,
            playerId: rp.id,
            slot: slotFrom(rp),
            isCaptain: isCaptainFlag(rp),
            formationId: roster.data?.formation_id ?? null,
            syncedAt: new Date().toISOString(),
          })
          .onConflictDoNothing()
          .run();
      }
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
    teamsUpserted,
    syncedTeams,
    ranAt: new Date().toISOString(),
  };
}

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
