import "dotenv/config";

import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDb, schema } from "../src/db/connection";
import type { PlayerPosition } from "../src/db/schema";

/**
 * Loads euroleaguefantasyplayers.csv into the local DB as the Matchday 1
 * snapshot. Idempotent — safe to re-run. This is the step-1 stand-in for the
 * live Dunkest players-list pull that arrives in step 4.
 */

const CSV_PATH = resolve(process.cwd(), process.argv[2] ?? "euroleaguefantasyplayers.csv");

// Dunkest ids for the current EuroCup matchday, per the API context doc.
const MATCHDAY = { id: 1568, number: 1, label: "Matchday 1" };

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  team_abbr: string;
  team_name: string;
  quotation: string;
  avg_pts: string;
  popularity: string;
  is_injured: string;
  probability_of_playing: string;
  opponent_abbr: string;
  round_number: string;
  started_from_bench: string;
  label: string;
};

const VALID_POSITIONS: PlayerPosition[] = ["Guard", "Forward", "Center", "Head Coach"];

const bool = (v: string) => v?.trim().toLowerCase() === "true";
const nOrNull = (v: string) => {
  const t = v?.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const sOrNull = (v: string) => {
  const t = v?.trim();
  return t ? t : null;
};

function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Row[];
  console.log(`parsed ${rows.length} rows from ${CSV_PATH}`);

  const { db, sqlite } = createDb();

  // Matchday
  db.insert(schema.matchdays)
    .values({ ...MATCHDAY, isCurrent: true })
    .onConflictDoUpdate({
      target: schema.matchdays.id,
      set: { number: MATCHDAY.number, label: MATCHDAY.label, isCurrent: true },
    })
    .run();

  // Real teams (distinct)
  const teams = new Map<string, string>();
  for (const r of rows) if (r.team_abbr) teams.set(r.team_abbr, r.team_name || r.team_abbr);
  for (const [abbr, name] of teams) {
    db.insert(schema.realTeams)
      .values({ abbr, name })
      .onConflictDoUpdate({ target: schema.realTeams.abbr, set: { name } })
      .run();
  }

  // Players + snapshots
  let players = 0;
  let snapshots = 0;
  let skipped = 0;
  const insertAll = sqlite.transaction(() => {
    for (const r of rows) {
      const id = Number(r.id);
      const position = r.position?.trim() as PlayerPosition;
      if (!Number.isFinite(id) || !VALID_POSITIONS.includes(position) || !r.team_abbr) {
        skipped++;
        continue;
      }

      db.insert(schema.players)
        .values({
          id,
          firstName: r.first_name?.trim() ?? "",
          lastName: r.last_name?.trim() ?? "",
          position,
          realTeamAbbr: r.team_abbr,
        })
        .onConflictDoUpdate({
          target: schema.players.id,
          set: {
            firstName: r.first_name?.trim() ?? "",
            lastName: r.last_name?.trim() ?? "",
            position,
            realTeamAbbr: r.team_abbr,
          },
        })
        .run();
      players++;

      const snap = {
        playerId: id,
        matchdayId: MATCHDAY.id,
        quotation: nOrNull(r.quotation) ?? 0,
        avgPts: nOrNull(r.avg_pts) ?? 0,
        popularity: nOrNull(r.popularity) ?? 0,
        isInjured: bool(r.is_injured),
        probabilityOfPlaying: nOrNull(r.probability_of_playing) ?? 1,
        opponentAbbr: sOrNull(r.opponent_abbr),
        roundNumber: nOrNull(r.round_number),
        startedFromBench: r.started_from_bench?.trim() ? bool(r.started_from_bench) : null,
        label: sOrNull(r.label),
        source: "csv",
      };
      db.insert(schema.playerSnapshots)
        .values(snap)
        .onConflictDoUpdate({
          target: [schema.playerSnapshots.playerId, schema.playerSnapshots.matchdayId],
          set: snap,
        })
        .run();
      snapshots++;
    }
  });
  insertAll();

  // Seed the 3 fantasy teams (only if absent — don't clobber later tuning).
  const seedTeams = [
    { id: 1, name: "Safe", strategy: "safe" as const, riskK: 0.6 },
    { id: 2, name: "Balanced", strategy: "balanced" as const, riskK: 0 },
    { id: 3, name: "Aggressive", strategy: "aggressive" as const, riskK: 0.6 },
  ];
  for (const t of seedTeams) {
    db.insert(schema.fantasyTeams)
      .values({ ...t, budget: 100 })
      .onConflictDoNothing()
      .run();
  }

  // Default settings (only if absent).
  const seedSettings: Record<string, unknown> = {
    overlapCap: 6,
    teamCapPerRealTeam: 6,
    rosterSize: 11,
    positionCounts: { Guard: 4, Forward: 4, Center: 2, "Head Coach": 1 },
    captainMultiplier: 2,
    benchWeight: 0.5,
    contrarianWeight: 0.2, // aggressive team: value -= contrarianWeight * ownership%
    projectionModel: {}, // overrides on top of DEFAULT_MODEL_PARAMS; see src/lib/projections/model.ts
  };
  for (const [key, value] of Object.entries(seedSettings)) {
    db.insert(schema.settings)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoNothing()
      .run();
  }

  sqlite.close();
  console.log(
    `done: ${teams.size} teams, ${players} players, ${snapshots} snapshots, ${skipped} skipped`,
  );
}

main();
