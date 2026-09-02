# EuroLeague Fantasy Challenge — Reverse-Engineered API Context

This document describes the private/undocumented REST API that powers the
EuroLeague Fantasy Challenge web app (`https://euroleaguefantasy.euroleaguebasketball.net`).
It was discovered by inspecting the app's own network traffic (via
`performance.getEntriesByType('resource')` in the browser, since the app is a
Flutter/CanvasKit web build and standard devtools network capture missed some
calls). Everything below was confirmed working with a live authenticated
session on 2026-09-02.

**Important:** this is not a public/documented API. It belongs to a
white-label fantasy-sports platform called **Dunkest**, which EuroLeague
Basketball uses under the hood. Endpoints, fields, and IDs may change without
notice. Treat this as a snapshot, not a stable contract.

## 1. Base URL & auth

- API base: `https://fantaking-api.dunkest.com/api/v1/`
- Asset/image CDN: `https://fantaking-assets.dunkest.com/...` (jerseys, avatars — no auth needed)
- Auth: Bearer token in the `Authorization` header: `Authorization: Bearer <token>`
- The web app obtains this token via EuroLeague SSO login (`flutter.authProvider`
  in localStorage is set to `euroLeagueSSO`) and stores it in the browser's
  `localStorage` under the key **`flutter.authToken`** (stored as a
  JSON-quoted string, so strip the surrounding `"` chars before using it).
- To get a token for scripting: log into
  `https://euroleaguefantasy.euroleaguebasketball.net` in a real browser, then
  read `localStorage.getItem('flutter.authToken')` from devtools on that
  origin. There is no documented way to obtain it without going through the
  web app's login flow (no client-credentials/password grant observed).
- Token lifetime is unknown (not tested to expiry) — expect it to expire and
  need refreshing by re-logging in.
- All endpoints below return JSON, generally shaped `{"data": ...}`, and
  paginated list endpoints add `{"data": [...], "links": {...}, "meta": {...}}`
  (standard Laravel/Fractal-style pagination).

## 2. Key IDs you need before calling anything

Static/global (from `/games/7/config`):

- `game_id = 7` — "EuroLeague Fantasy Challenge" is game 7 in Dunkest's system.
- `leagues`: `10 = EuroLeague`, `11 = EuroCup`, `24 = EuroLeague Playoffs (Post Season)`
- `positions`: `28 = Guard`, `29 = Forward`, `30 = Center`, `31 = Head Coach`
- `game_modes`: `1 = contest`, `2 = league`
- `formations`: e.g. `27 = 2-2-1`, `28 = 2-1-2`, `29 = 1-2-2`, `30 = 1-3-1`, `31 = 3-1-1`, ...

Per-league/dynamic (fetch fresh each session, they change every round):

- `current_matchday.id` / `current_round.id` — from `/leagues/{league_id}/config`
- `current_players_list_id` — from `/leagues/{league_id}/config` (this is the
  `players-lists/{id}` used to pull the full player pool)
- Your fantasy team id — from `/user/fantasy-teams` (e.g. `2678417`)

Do not hardcode matchday/round/players-list ids long-term — pull them from
`/leagues/{league_id}/config` at the start of a session, since they roll
forward every round.

## 3. Endpoints confirmed working

All require the `Authorization: Bearer <token>` header unless noted.

### `GET /api/v1/games/{game_id}/config`
Global, game-wide static config. Not user- or league-specific — cache this.
Shape (truncated to top level, arrays show one example element):

```json
{
  "display_name": {},
  "default_league_id": 0,
  "default_game_mode_id": 0,
  "default_formation_id": 0,
  "default_language": {"id": 0, "name": "", "iso_639_1": ""},
  "leagues": [{"id": 10, "name": "EuroLeague", "display_name": "EuroLeague"}],
  "league_statuses": [{"id": 0, "name": ""}],
  "fantasy_league_statuses": [{"id": 0, "name": ""}],
  "fantasy_league_types": [{"id": 0, "name": ""}],
  "game_modes": [{"id": 1, "name": "contest"}],
  "formations": [{"id": 27, "name": "2-2-1"}],
  "positions": [{"id": 28, "name": "Guard"}],
  "tournament_types": [{"id": 0, "name": ""}],
  "tournament_categories": [{"id": 0, "name": ""}],
  "stores": [{"id": 0, "name": ""}],
  "avatar_urls": ["..."]
}
```
(there are more fields after `avatar_urls`, not fully enumerated — inspect
live if you need them)

### `GET /api/v1/leagues/{league_id}/config`
e.g. `/api/v1/leagues/11/config` for EuroCup. League-specific, current-round
state and rules.

```json
{
  "status_id": 0,
  "maintenance": false,
  "players_list_limitations_enabled": false,
  "denied_free_agent_trade_creation_offset": 0,
  "current_competition_id": 0,
  "current_schedule_id": 0,
  "current_players_list_id": 50,
  "allows_head_to_head_tournaments": false,
  "current_matchday": {"id": 1568, "number": 1, "num_rounds": 0},
  "current_round": {"id": 0, "number": 0, "started_at": ""},
  "previous_matchday": {},
  "current_bracket": {},
  "teams": [
    {"id": 0, "name": "", "abbreviation": "", "player_jersey_url": "",
     "coach_jersey_url": "", "logo_url": "", "font_url": {},
     "number_color": "", "number_border_color": {}}
  ],
  "matchdays": [{"id": 0, "number": 0, "display_name": {}}],
  "game_modes_configs": [
    {
      "game_mode_id": 1,
      "max_num_teams_per_user": 3,
      "max_num_teams_per_head_to_head_tournament": 20,
      "num_players_per_team": 11,
      "num_starter_players": 5,
      "num_bench_players": 5,
      "num_coach_players": 1,
      "num_reserve_players": 0,
      "max_extra_credits": 0,
      "cost_per_trade": 0,
      "additional_num_trades_per_matchday": 0,
      "players_per_positions": [
        {"id": 28, "name": "Guard", "num_players": 4},
        {"id": 29, "name": "Forward", "num_players": 4},
        {"id": 30, "name": "Center", "num_players": 2},
        {"id": 31, "name": "Head Coach", "num_players": 1}
      ],
      "captain_multiplier": 2,
      "captain_config": null
    }
  ]
}
```

### `GET /api/v1/user`
Your account profile.
Keys: `id, first_name, last_name, email, email_verified_at, last_login_at,
created_at, profile_picture_url, communications_from_third_parties,
profiling_activity, marketing_activities, country, language, date_of_birth,
telephone_number, telephone_prefix, game_id, facebook_url, instagram_url,
tiktok_url, twitch_url, twitter_url`

### `GET /api/v1/user/config`
User-specific config/flags (not fully enumerated — inspect live if needed).

### `GET /api/v1/user/fantasy-teams?league={league_id}&game_mode={game_mode_id}`
**Both query params are required** (endpoint 422s without them, with a
validation-error body naming the missing fields). Returns your fantasy
team(s) in that league/game-mode.

Example: `GET /api/v1/user/fantasy-teams?league=11&game_mode=1`

```json
{
  "data": [
    {
      "id": 2678417,
      "name": "Hapoel Amit",
      "created_on_matchday_id": 1568,
      "matchday": {"id": 1568, "number": 1},
      "position": null,
      "pts": 0,
      "total_pts": 0,
      "fantasy_league": null,
      "jersey_url": null
    }
  ]
}
```

### `GET /api/v1/fantasy-teams/{team_id}/matchdays/{matchday_id}`
Your team's state for a given matchday (credits, points, etc. — same shape
family as the roster call below; inspect live for full field list).

### `GET /api/v1/fantasy-teams/{team_id}/matchdays/{matchday_id}/roster`
Your actual lineup/roster for that matchday.

```json
{
  "data": {
    "formation_id": 27,
    "latest_snapshot": null,
    "snapshot_players_current_status": null,
    "players": []
  }
}
```
(`players` was empty in this snapshot because no lineup had been saved yet —
expect an array of player objects, same shape as the players-list entries
below, once a team is built.)

There is also `.../roster/random` observed in traffic (used by the app's
"Random team" button) — not tested directly; likely a `POST` that returns or
applies a randomly generated roster. **Write/mutating endpoints (saving a
lineup, making a trade, etc.) were not captured** because no save action was
triggered during this investigation — capture those separately (open
devtools → Network, click "Save" in the app) before trying to write data via
the API.

### `GET /api/v1/players-lists/{players_list_id}/matchdays/{matchday_id}/players`
The full player pool for a matchday. `players_list_id` comes from
`current_players_list_id` in the league config (e.g. `50`).

Query params:
- `page` — 1-indexed page number
- `per_page` — confirmed works up to at least `100` (default is `10`)

Example: `GET /api/v1/players-lists/50/matchdays/1568/players?page=1&per_page=100`

Response:
```json
{
  "data": [
    {
      "id": 3778,
      "first_name": "Trevion",
      "last_name": "Williams",
      "quotation": 14,
      "jersey": "50",
      "face_path": null,
      "avg_pts": 0,
      "is_on_fire": null,
      "popularity": 0,
      "position": {"id": 30, "name": "Center"},
      "team": {"id": 157, "name": "Bahcesehir College Istanbul", "abbreviation": "BKS", "position": "home"},
      "opponent": {"id": 394, "name": "Roma Basketball", "abbreviation": "ROM"},
      "round": {"id": 2607, "number": 2},
      "is_injured": false,
      "probability_of_playing": 1,
      "fantasy_team": null,
      "started_from_bench": true,
      "label": "opponent"
    }
  ],
  "links": {
    "first": "https://fantaking-api.dunkest.com/api/v1/players-lists/50/matchdays/1568/players?page=1",
    "last": "https://fantaking-api.dunkest.com/api/v1/players-lists/50/matchdays/1568/players?page=47",
    "prev": null,
    "next": "https://fantaking-api.dunkest.com/api/v1/players-lists/50/matchdays/1568/players?page=2"
  },
  "meta": {
    "total": 469,
    "per_page": 100,
    "current_page": 1,
    "last_page": 5
  }
}
```

Notes on fields:
- `quotation` = the player's fantasy price/credit cost (this app's stats table
  labels it "PRE").
- `avg_pts` = average fantasy points (this round it was 0 for everyone,
  presumably because the season/round hadn't started scoring yet).
- `popularity` = % of managers who own this player.
- `fantasy_team` = non-null if the player is on *your* team (for this
  players-list call, or possibly always null here — not fully confirmed;
  cross-check against the roster endpoint for ground truth on team
  membership).

## 4. Suggested pull sequence for a scraping script

1. `GET /api/v1/games/7/config` → get `leagues`, `positions`, `formations`, `game_modes` enums (cache indefinitely, or re-check occasionally).
2. `GET /api/v1/leagues/{league_id}/config` → get `current_matchday.id`, `current_players_list_id`, `game_modes_configs` (roster-size rules).
3. `GET /api/v1/user/fantasy-teams?league={league_id}&game_mode={game_mode_id}` → get your `team_id`(s).
4. `GET /api/v1/fantasy-teams/{team_id}/matchdays/{matchday_id}/roster` → your current lineup.
5. `GET /api/v1/players-lists/{players_list_id}/matchdays/{matchday_id}/players?per_page=100` → loop pages 1..last_page to pull the full player pool (469 players / 100 per page = 5 requests).

## 5. Open questions / not yet reverse-engineered

- Write endpoints: saving a lineup, making a trade/transfer, setting captain,
  joining/creating a league. `.../roster/random` was seen in traffic (likely
  `POST`) but not captured with a body.
- Standings/leaderboard endpoint (the app's "Global"/"Israel"/personal league
  rank lists) — not captured.
- Schedule/fixtures endpoint (the app's "Schedule" tab) — not captured.
- News endpoint — the app's News tab actually calls a *different*, unrelated
  API: `https://article-cms-api.incrowdsports.com/v2/articles?clientId=EUROLEAGUE&categorySlug=eurocup-news&page=1&size=10` (no auth header observed). Separate system, not Dunkest.
- Rate limits: unknown, not tested.
- Token refresh mechanism: unknown (no refresh-token flow observed; assume
  re-login is required on expiry).

## 6. Practical caveats for whoever builds against this

- This is undocumented and could break or change at any time — build in
  error handling and don't assume field names are final.
- Respect the game's terms of service; this is being used here to read the
  account owner's own data (their own team/roster), not to scrape at scale
  or interact with other users' data.
- The Bearer token is a live session credential — treat it like a password
  (don't log it, don't commit it, don't share it with the "other agent" this
  doc is being handed to unless that agent is trusted with the account).
