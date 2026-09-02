import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Schema for the EuroCup Fantasy 3-team manager.
 *
 * Step 1 populates: realTeams, matchdays, players, playerSnapshots, fantasyTeams, settings.
 * Later steps fill: projections (step 2), rosterEntries (step 3), trades (step 5).
 *
 * SQLite dialect for local dev. Kept deliberately plain so the move to
 * Neon/Postgres (step 4) is a mechanical dialect swap behind src/db.
 */

export const realTeams = sqliteTable("real_teams", {
  abbr: text("abbr").primaryKey(),
  name: text("name").notNull(),
});

export const matchdays = sqliteTable("matchdays", {
  id: integer("id").primaryKey(), // Dunkest matchday id
  number: integer("number").notNull(),
  label: text("label").notNull(),
  isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
});

export const PLAYER_POSITIONS = ["Guard", "Forward", "Center", "Head Coach"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export const players = sqliteTable(
  "players",
  {
    id: integer("id").primaryKey(), // Dunkest player id
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    position: text("position").notNull().$type<PlayerPosition>(),
    realTeamAbbr: text("real_team_abbr")
      .notNull()
      .references(() => realTeams.abbr),
  },
  (t) => [index("players_position_idx").on(t.position), index("players_team_idx").on(t.realTeamAbbr)],
);

/**
 * One row per player per matchday = the game state we pulled that round
 * (price, form, injury, matchup). Full history so we can chart price/points
 * drift and calibrate the projection model.
 */
export const playerSnapshots = sqliteTable(
  "player_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    matchdayId: integer("matchday_id")
      .notNull()
      .references(() => matchdays.id),
    quotation: real("quotation").notNull(),
    avgPts: real("avg_pts").notNull().default(0),
    popularity: real("popularity").notNull().default(0),
    isInjured: integer("is_injured", { mode: "boolean" }).notNull().default(false),
    probabilityOfPlaying: real("probability_of_playing").notNull().default(1),
    opponentAbbr: text("opponent_abbr"),
    roundNumber: integer("round_number"),
    startedFromBench: integer("started_from_bench", { mode: "boolean" }),
    label: text("label"),
    source: text("source").notNull().default("csv"), // 'csv' | 'api'
    capturedAt: text("captured_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("player_snapshots_player_matchday_idx").on(t.playerId, t.matchdayId)],
);

/** Model output. Empty until step 2. */
export const projections = sqliteTable(
  "projections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    matchdayId: integer("matchday_id")
      .notNull()
      .references(() => matchdays.id),
    mean: real("mean").notNull(),
    floor: real("floor").notNull(),
    ceiling: real("ceiling").notNull(),
    sigma: real("sigma").notNull(),
    model: text("model").notNull(),
    computedAt: text("computed_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("projections_player_matchday_idx").on(t.playerId, t.matchdayId)],
);

/** Manual per-player overrides from the Players page. Global (not per-matchday). */
export const playerFlags = sqliteTable("player_flags", {
  playerId: integer("player_id")
    .primaryKey()
    .references(() => players.id),
  lock: integer("lock", { mode: "boolean" }).notNull().default(false),
  exclude: integer("exclude", { mode: "boolean" }).notNull().default(false),
  boostPct: real("boost_pct").notNull().default(0), // -50..50, applied to mean
  injuryOverride: text("injury_override"), // 'out' | 'ok' | null
  note: text("note"),
});

export const TEAM_STRATEGIES = ["safe", "balanced", "aggressive"] as const;
export type TeamStrategy = (typeof TEAM_STRATEGIES)[number];

export const fantasyTeams = sqliteTable("fantasy_teams", {
  id: integer("id").primaryKey(), // 1, 2, 3
  name: text("name").notNull(),
  strategy: text("strategy").notNull().$type<TeamStrategy>(),
  riskK: real("risk_k").notNull().default(0), // floor/ceiling tilt strength
  budget: real("budget").notNull().default(100),
  dunkestTeamId: integer("dunkest_team_id"),
});

export const ROSTER_SLOTS = ["starter", "sixth", "bench", "coach"] as const;
export type RosterSlot = (typeof ROSTER_SLOTS)[number];

/** Optimizer / manual / synced lineups per team per matchday. Empty until step 3. */
export const rosterEntries = sqliteTable(
  "roster_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fantasyTeamId: integer("fantasy_team_id")
      .notNull()
      .references(() => fantasyTeams.id),
    matchdayId: integer("matchday_id")
      .notNull()
      .references(() => matchdays.id),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    slot: text("slot").notNull().$type<RosterSlot>(),
    isCaptain: integer("is_captain", { mode: "boolean" }).notNull().default(false),
    formationId: integer("formation_id"),
    source: text("source").notNull().default("optimizer"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    index("roster_entries_team_matchday_idx").on(t.fantasyTeamId, t.matchdayId),
  ],
);

/** Trade log. Empty until step 5. */
export const trades = sqliteTable("trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fantasyTeamId: integer("fantasy_team_id")
    .notNull()
    .references(() => fantasyTeams.id),
  matchdayId: integer("matchday_id")
    .notNull()
    .references(() => matchdays.id),
  outPlayerId: integer("out_player_id")
    .notNull()
    .references(() => players.id),
  inPlayerId: integer("in_player_id")
    .notNull()
    .references(() => players.id),
  creditDelta: real("credit_delta").notNull(),
  projDelta: real("proj_delta").notNull(),
  applied: integer("applied", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
});
