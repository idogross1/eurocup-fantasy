/**
 * Which competition this instance manages. Same codebase, same Dunkest API,
 * same game mode — only the league id differs. Set LEAGUE_ID in the environment
 * (default 11 = EuroCup) and deploy a separate instance per league with its own
 * database.
 *
 * Dunkest league ids (from /games/7/config): 10 = EuroLeague, 11 = EuroCup,
 * 24 = EuroLeague Playoffs (Post Season).
 */

export type LeagueConfig = {
  id: number;
  name: string;
  shortName: string;
};

const LEAGUES: Record<number, LeagueConfig> = {
  10: { id: 10, name: "EuroLeague Fantasy", shortName: "EuroLeague" },
  11: { id: 11, name: "EuroCup Fantasy", shortName: "EuroCup" },
  24: { id: 24, name: "EuroLeague Post-Season", shortName: "Post-Season" },
};

export const DEFAULT_LEAGUE_ID = 11;

export function currentLeague(): LeagueConfig {
  const raw = Number(process.env.LEAGUE_ID);
  const id = Number.isFinite(raw) && LEAGUES[raw] ? raw : DEFAULT_LEAGUE_ID;
  return LEAGUES[id];
}

export const LEAGUE = currentLeague();
