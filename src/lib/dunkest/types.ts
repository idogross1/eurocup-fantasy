/**
 * Partial response shapes for the Dunkest endpoints we call. Only the fields we
 * actually read are typed; everything is optional-friendly because the API is
 * undocumented.
 */

export type DunkTeamRef = {
  id?: number;
  name?: string;
  abbreviation?: string;
};

export type DunkPlayer = {
  id: number;
  first_name?: string;
  last_name?: string;
  quotation?: number;
  jersey?: string;
  avg_pts?: number;
  popularity?: number;
  is_injured?: boolean;
  probability_of_playing?: number;
  position?: { id?: number; name?: string };
  team?: DunkTeamRef & { position?: string };
  opponent?: DunkTeamRef;
  round?: { id?: number; number?: number };
  started_from_bench?: boolean;
  label?: string;
  is_captain?: boolean;
  role?: string;
  slot?: string;
};

export type Paginated<T> = {
  data: T[];
  links?: { next?: string | null };
  meta?: { total?: number; per_page?: number; current_page?: number; last_page?: number };
};

export type LeagueConfig = {
  current_players_list_id?: number;
  current_matchday?: { id?: number; number?: number };
  current_round?: { id?: number; number?: number };
  teams?: (DunkTeamRef & { logo_url?: string })[];
  game_modes_configs?: {
    game_mode_id?: number;
    num_players_per_team?: number;
    max_num_teams_per_user?: number;
    players_per_positions?: { id?: number; name?: string; num_players?: number }[];
    captain_multiplier?: number;
  }[];
};

export type UserProfile = {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  country?: string;
};

export type FantasyTeamSummary = {
  id: number;
  name?: string;
  created_on_matchday_id?: number;
  matchday?: { id?: number; number?: number };
  position?: number | null;
  pts?: number;
  total_pts?: number;
};

export type RosterResponse = {
  data?: {
    formation_id?: number;
    players?: DunkPlayer[];
  };
};

export type TournamentEntry = {
  id: number;
  name?: string;
  category?: { id?: number; name?: string };
  type?: { id?: number; name?: string };
  position?: number | null;
  num_fantasy_teams?: number | null;
};
