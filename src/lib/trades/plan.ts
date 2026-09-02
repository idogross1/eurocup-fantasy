import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { schema } from "@/db/connection";
import type { PlayerPosition } from "@/db/schema";
import { getSetting } from "@/lib/kv";
import { loadOptimizerPool, prefilterPool } from "@/lib/optimizer/run";
import { solveTeam } from "@/lib/optimizer/solve";
import type { StrategySpec } from "@/lib/optimizer/types";

import { tradeWindowStatus, type WindowStatus } from "./window";

type DB = BetterSQLite3Database<typeof schema>;

export type TradeMovePlayer = {
  id: number;
  name: string;
  position: PlayerPosition;
  teamAbbr: string;
  quotation: number;
  mean: number;
};

export type TradeMove = {
  id?: number; // persisted trades.id (filled after save)
  applied?: boolean;
  kind: "buy" | "sell" | "swap";
  out: TradeMovePlayer | null;
  in: TradeMovePlayer | null;
  creditDelta: number; // + = costs more
  projDelta: number; // + = more projected points (raw mean, not lineup-weighted)
};

export type TeamTradePlan = {
  fantasyTeamId: number;
  name: string;
  strategy: string;
  mode: "build" | "in-sync" | "trade" | "trade-capped";
  realTeamName: string | null;
  moves: TradeMove[];
  moveCount: number;
  creditDelta: number;
  projDelta: number;
  targetCredits: number;
  note: string;
};

export type TradePlan = {
  matchdayId: number;
  window: WindowStatus;
  teams: TeamTradePlan[];
};

const POS_ORDER: Record<string, number> = { Guard: 0, Forward: 1, Center: 2, "Head Coach": 3 };

async function playerDetails(
  db: DB,
  matchdayId: number,
  ids: number[],
): Promise<Map<number, TradeMovePlayer>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: schema.players.id,
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      position: schema.players.position,
      teamAbbr: schema.players.realTeamAbbr,
      quotation: schema.playerSnapshots.quotation,
      mean: schema.projections.mean,
    })
    .from(schema.players)
    .leftJoin(
      schema.playerSnapshots,
      and(
        eq(schema.playerSnapshots.playerId, schema.players.id),
        eq(schema.playerSnapshots.matchdayId, matchdayId),
      ),
    )
    .leftJoin(
      schema.projections,
      and(
        eq(schema.projections.playerId, schema.players.id),
        eq(schema.projections.matchdayId, matchdayId),
      ),
    )
    .where(inArray(schema.players.id, ids));

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        position: r.position,
        teamAbbr: r.teamAbbr,
        quotation: r.quotation ?? 0,
        mean: r.mean ?? 0,
      },
    ]),
  );
}

function pairMoves(
  sell: TradeMovePlayer[],
  buy: TradeMovePlayer[],
): TradeMove[] {
  // match sold -> bought within the same position (both sets have the same
  // position multiset), best-to-best, so the diff reads sensibly
  const byPos = (arr: TradeMovePlayer[]) => {
    const m = new Map<string, TradeMovePlayer[]>();
    for (const p of arr) {
      const k = p.position;
      (m.get(k) ?? m.set(k, []).get(k)!).push(p);
    }
    for (const list of m.values()) list.sort((a, b) => b.mean - a.mean);
    return m;
  };
  const s = byPos(sell);
  const b = byPos(buy);
  const moves: TradeMove[] = [];
  for (const pos of new Set([...s.keys(), ...b.keys()])) {
    const ss = s.get(pos) ?? [];
    const bb = b.get(pos) ?? [];
    const n = Math.max(ss.length, bb.length);
    for (let i = 0; i < n; i++) {
      const out = ss[i] ?? null;
      const inp = bb[i] ?? null;
      moves.push({
        kind: out && inp ? "swap" : out ? "sell" : "buy",
        out,
        in: inp,
        creditDelta: (inp?.quotation ?? 0) - (out?.quotation ?? 0),
        projDelta: (inp?.mean ?? 0) - (out?.mean ?? 0),
      });
    }
  }
  return moves.sort(
    (a, b2) =>
      (POS_ORDER[a.in?.position ?? a.out?.position ?? ""] ?? 9) -
      (POS_ORDER[b2.in?.position ?? b2.out?.position ?? ""] ?? 9),
  );
}

export async function computeTradePlan(db: DB, matchdayId: number): Promise<TradePlan> {
  const window = tradeWindowStatus(
    getSetting<{ number: number | null; startedAt: string | null }>(db, "currentRound"),
  );
  const maxMoves = window.maxMoves === "unlimited" ? 11 : window.maxMoves;

  const fantasyTeams = await db
    .select()
    .from(schema.fantasyTeams)
    .orderBy(schema.fantasyTeams.id);
  const syncedTeams = await db.select().from(schema.syncedTeams);
  const syncedByFt = new Map(
    syncedTeams.filter((s) => s.mappedFantasyTeamId != null).map((s) => [s.mappedFantasyTeamId!, s]),
  );

  const targetRows = await db
    .select({
      fantasyTeamId: schema.rosterEntries.fantasyTeamId,
      playerId: schema.rosterEntries.playerId,
    })
    .from(schema.rosterEntries)
    .where(
      and(
        eq(schema.rosterEntries.matchdayId, matchdayId),
        eq(schema.rosterEntries.source, "optimizer"),
      ),
    );
  const targetByFt = new Map<number, number[]>();
  for (const r of targetRows) {
    (targetByFt.get(r.fantasyTeamId) ?? targetByFt.set(r.fantasyTeamId, []).get(r.fantasyTeamId)!)
      .push(r.playerId);
  }

  let pool: Awaited<ReturnType<typeof loadOptimizerPool>> | null = null;
  const teams: TeamTradePlan[] = [];

  for (const ft of fantasyTeams) {
    const synced = syncedByFt.get(ft.id) ?? null;
    const actualRows = synced
      ? await db
          .select({ playerId: schema.syncedRosterEntries.playerId })
          .from(schema.syncedRosterEntries)
          .where(
            and(
              eq(schema.syncedRosterEntries.dunkestTeamId, synced.dunkestTeamId),
              eq(schema.syncedRosterEntries.matchdayId, matchdayId),
            ),
          )
      : [];
    const actualIds = new Set(actualRows.map((r) => r.playerId));
    let targetIds = new Set(targetByFt.get(ft.id) ?? []);

    if (targetIds.size === 0) {
      teams.push(emptyPlan(ft, synced?.name ?? null, "run the optimizer first"));
      continue;
    }

    // initial build: real roster not full yet
    if (actualIds.size < 11) {
      const details = await playerDetails(db, matchdayId, [...targetIds]);
      const moves = [...targetIds]
        .map((id) => details.get(id))
        .filter((p): p is TradeMovePlayer => !!p)
        .sort((a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9))
        .map<TradeMove>((p) => ({
          kind: "buy",
          out: null,
          in: p,
          creditDelta: p.quotation,
          projDelta: p.mean,
        }));
      teams.push({
        fantasyTeamId: ft.id,
        name: ft.name,
        strategy: ft.strategy,
        mode: "build",
        realTeamName: synced?.name ?? null,
        moves,
        moveCount: moves.length,
        creditDelta: round1(moves.reduce((s, m) => s + m.creditDelta, 0)),
        projDelta: round1(moves.reduce((s, m) => s + m.projDelta, 0)),
        targetCredits: round1(moves.reduce((s, m) => s + m.creditDelta, 0)),
        note:
          actualIds.size === 0
            ? "Your real team is empty — this is the full squad to buy."
            : `Your real team has ${actualIds.size}/11 — buy the rest to match the target.`,
      });
      continue;
    }

    // already matches
    const diffOut = [...actualIds].filter((id) => !targetIds.has(id));
    if (diffOut.length === 0) {
      teams.push({
        ...emptyPlan(ft, synced?.name ?? null, "Real roster already matches the target."),
        mode: "in-sync",
      });
      continue;
    }

    // more than the cap allows -> re-optimise keeping >= 11-maxMoves current players
    let mode: TeamTradePlan["mode"] = "trade";
    if (diffOut.length > maxMoves) {
      mode = "trade-capped";
      if (!pool) pool = await loadOptimizerPool(db, matchdayId);
      const filtered = prefilterPool(pool, new Set([...actualIds]));
      const spec: StrategySpec = {
        teamId: ft.id,
        name: ft.name,
        strategy: ft.strategy,
        budget: ft.budget,
        riskK: ft.riskK,
      };
      const res = solveTeam(filtered, spec, {
        anchor: { ids: new Set([...actualIds]), maxChanges: maxMoves },
      });
      if (res.status === "optimal") {
        targetIds = new Set(res.players.map((p) => p.id));
      }
    }

    const finalOut = [...actualIds].filter((id) => !targetIds.has(id));
    const finalIn = [...targetIds].filter((id) => !actualIds.has(id));
    const details = await playerDetails(db, matchdayId, [...finalOut, ...finalIn]);
    const moves = pairMoves(
      finalOut.map((id) => details.get(id)).filter((p): p is TradeMovePlayer => !!p),
      finalIn.map((id) => details.get(id)).filter((p): p is TradeMovePlayer => !!p),
    );

    teams.push({
      fantasyTeamId: ft.id,
      name: ft.name,
      strategy: ft.strategy,
      mode,
      realTeamName: synced?.name ?? null,
      moves,
      moveCount: moves.length,
      creditDelta: round1(moves.reduce((s, m) => s + m.creditDelta, 0)),
      projDelta: round1(moves.reduce((s, m) => s + m.projDelta, 0)),
      targetCredits: 0,
      note:
        mode === "trade-capped"
          ? `${finalOut.length} of your players differ from the ideal target — this is the best ${maxMoves}-move upgrade.`
          : `${moves.length} move${moves.length === 1 ? "" : "s"} to reach the target roster.`,
    });
  }

  persist(db, matchdayId, teams);

  // attach persisted ids + applied flags back onto the moves
  const saved = await db
    .select()
    .from(schema.trades)
    .where(eq(schema.trades.matchdayId, matchdayId));
  const savedKey = (r: { fantasyTeamId: number; outPlayerId: number | null; inPlayerId: number | null }) =>
    `${r.fantasyTeamId}:${r.outPlayerId ?? "-"}:${r.inPlayerId ?? "-"}`;
  const savedMap = new Map(saved.map((r) => [savedKey(r), r]));
  for (const t of teams) {
    for (const m of t.moves) {
      const row = savedMap.get(`${t.fantasyTeamId}:${m.out?.id ?? "-"}:${m.in?.id ?? "-"}`);
      if (row) {
        m.id = row.id;
        m.applied = row.applied;
      }
    }
    t.moveCount = t.moves.filter((m) => !m.applied).length;
  }

  return { matchdayId, window, teams };
}

function emptyPlan(
  ft: typeof schema.fantasyTeams.$inferSelect,
  realTeamName: string | null,
  note: string,
): TeamTradePlan {
  return {
    fantasyTeamId: ft.id,
    name: ft.name,
    strategy: ft.strategy,
    mode: "in-sync",
    realTeamName,
    moves: [],
    moveCount: 0,
    creditDelta: 0,
    projDelta: 0,
    targetCredits: 0,
    note,
  };
}

function persist(db: DB, matchdayId: number, teams: TeamTradePlan[]) {
  const key = (ft: number, out: number | null, inp: number | null) =>
    `${ft}:${out ?? "-"}:${inp ?? "-"}`;
  const appliedKeys = new Set(
    db
      .select()
      .from(schema.trades)
      .where(and(eq(schema.trades.matchdayId, matchdayId), eq(schema.trades.applied, true)))
      .all()
      .map((r) => key(r.fantasyTeamId, r.outPlayerId, r.inPlayerId)),
  );

  db.transaction((tx) => {
    tx.delete(schema.trades)
      .where(and(eq(schema.trades.matchdayId, matchdayId), eq(schema.trades.applied, false)))
      .run();
    for (const t of teams) {
      for (const m of t.moves) {
        if (appliedKeys.has(key(t.fantasyTeamId, m.out?.id ?? null, m.in?.id ?? null))) continue;
        tx.insert(schema.trades)
          .values({
            fantasyTeamId: t.fantasyTeamId,
            matchdayId,
            outPlayerId: m.out?.id ?? null,
            inPlayerId: m.in?.id ?? null,
            creditDelta: m.creditDelta,
            projDelta: m.projDelta,
            kind: m.kind,
          })
          .run();
      }
    }
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
