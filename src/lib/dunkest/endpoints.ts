import {
  EUROCUP_LEAGUE_ID,
  GAME_ID,
  GAME_MODE_CONTEST,
  type DunkestClient,
} from "./client";
import type {
  FantasyTeamSummary,
  LeagueConfig,
  Paginated,
  DunkPlayer,
  RosterResponse,
  TournamentEntry,
  UserProfile,
} from "./types";

/** Most Dunkest endpoints wrap their payload in `{ data: ... }`; some don't. */
function unwrap<T>(res: unknown): T {
  if (res && typeof res === "object" && "data" in res) {
    return (res as { data: T }).data;
  }
  return res as T;
}

export function endpoints(client: DunkestClient, leagueId = EUROCUP_LEAGUE_ID) {
  return {
    gameConfig: () => client.get<unknown>(`/games/${GAME_ID}/config`).then((r) => unwrap(r)),

    leagueConfig: () =>
      client
        .get<{ data: LeagueConfig } | LeagueConfig>(`/leagues/${leagueId}/config`)
        .then((r) => unwrap<LeagueConfig>(r)),

    me: () =>
      client.get<{ data: UserProfile } | UserProfile>(`/user`).then((r) => unwrap<UserProfile>(r)),

    fantasyTeams: (gameMode = GAME_MODE_CONTEST) =>
      client.get<{ data: FantasyTeamSummary[] }>(`/user/fantasy-teams`, {
        league: leagueId,
        game_mode: gameMode,
      }),

    roster: (teamId: number, matchdayId: number) =>
      client.get<RosterResponse>(`/fantasy-teams/${teamId}/matchdays/${matchdayId}/roster`),

    playersPage: (playersListId: number, matchdayId: number, page: number) =>
      client.get<Paginated<DunkPlayer>>(
        `/players-lists/${playersListId}/matchdays/${matchdayId}/players`,
        { page, per_page: 100 },
      ),

    tournaments: (teamId: number) =>
      client.get<{ data: TournamentEntry[] }>(`/fantasy-teams/${teamId}/tournaments`),
  };
}

/** Pull every page of the players-list for a matchday. */
export async function fetchAllPlayers(
  api: ReturnType<typeof endpoints>,
  playersListId: number,
  matchdayId: number,
): Promise<DunkPlayer[]> {
  const out: DunkPlayer[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const resp = await api.playersPage(playersListId, matchdayId, page);
    out.push(...(resp.data ?? []));
    lastPage = resp.meta?.last_page ?? page;
    page += 1;
  } while (page <= lastPage && page < 50);
  return out;
}
