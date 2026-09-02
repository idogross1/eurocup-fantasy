# EuroLeague Fantasy Challenge — Game Rules Context

Source: the official in-app Rules pages, which are served from a public
GitBook site: `https://fantaking.gitbook.io/euroleague-fantasy-challenge-rules/`
(embedded via iframe in the app's "Rules" tab at
`https://euroleaguefantasy.euroleaguebasketball.net/11/rules`). No login is
required to read it. Every page is also available as raw Markdown by
appending `.md` to its URL, and the full page index is at
[`llms.txt`](https://fantaking.gitbook.io/euroleague-fantasy-challenge-rules/llms.txt)
— useful if this needs to be re-scraped or expanded later. Content below was
pulled 2026-09-02; some numbers (ticket counts, dates) are season-specific
and will change next year.

This complements the separate API context doc (the Dunkest
`fantaking-api.dunkest.com` REST API) — that doc describes *how to read/write
game state*, this one describes *what the rules mean*.

---

## 1. Game modes overview

EuroLeague Fantasy Challenge has two core team-building modes, plus two
unrelated side games:

- **Classic Mode** — all-vs-all, non-exclusive rosters (any player can be on
  multiple users' teams). This is the default/main mode.
- **Draft Mode** — private leagues only, exclusive rosters assigned via an
  offline auction/draft that a "Commissioner" then enters into the app.
- **Bracket Challenge** — a separate postseason bracket-prediction game.
- **Game Predictor** — a separate per-round "pick the winner of every game"
  quiz game.

A user can run up to **3 fantasy teams** at once (in Classic Mode).

---

## 2. Classic Mode

### 2.1 Initial team / roster construction

- **100 credits** to buy **11 players**: 2 Centers, 4 Forwards, 4 Guards, 1
  Head Coach.
- Max **6 players from the same EuroLeague team** on one fantasy roster (also
  6 during the Playoffs phase).
- Player credit values change over the season based on real performance
  (see §2.5).
- Starting-five formations (guards-forwards-centers): **2-2-1, 1-2-2, 2-1-2,
  1-3-1, 3-1-1**.

**Joining after the season has started:**
- New teams get an entry score equal to the average score of all
  EuroLeague Fantasy Challenge teams for that round.
- Starting budget is `100cr + 0.3cr per round already played` before you
  registered (e.g., registering at matchday 7 → `100 + 0.3×6 = 101.8cr`).
- If you register while a round is in progress, your picks don't affect that
  round's score — you get the average entry score for it instead.

### 2.2 Managing your team / schedule structure

- A **Round (R)** is split into **Turns (T1, T2, T3, ...)** — one turn per
  day of games in that round (e.g. T1 = Tuesday's games, T2 = Wednesday's).
- Between turns (before a new turn starts) you can, as long as the incoming
  player hasn't already played:
  - Make field↔bench substitutions and change your Captain
  - Change your team formation
- A player moved from field to bench for a turn has their score for that
  turn halved (see §2.3 — bench = 50%).
- You can reset all substitutions for the round before the next turn begins.
- **Tip from the rules doc:** stagger your 11 players across turns and
  always start your Turn-1 lineup with your best T1-eligible options, since
  you can still react/replace before later turns.

**From this season:** Regular Season, Play-In, Playoffs and Final Four are
one unified competition/season-long ranking (previously these were separate
phases).

### 2.3 Scoring

**Player scoring** — sum of these per game (regular time + OT):

| Action | Bonus | Penalty |
|---|---|---|
| Point scored | +1 | |
| Rebound | +1 | |
| Assist | +1 | |
| Steal / Turnover | +1 | -1 |
| Blocked shot performed / suffered | +1 | -1 |
| Foul drawn / committed | +1 | -1 |
| Missed shot | | -1 |
| Missed free throw | | -1 |
| Team win bonus | | +10% of that round's fantasy score |

**Coach scoring:**

| Result | Points |
|---|---|
| Win by 1–10 (or OT) | +10 |
| Win by 11–20 | +20 |
| Win by 20+ | +25 |
| Loss by 1–10 (or OT) | -5 |
| Loss by 11–20 | -10 |
| Loss by 20+ | -20 |

Coach always scores even if dismissed/absent/disqualified.

**Lineup score weighting:**
- Starting five + sixth man + coach → **100%** of points
- Bench players → **50%** of points
- **Captain** (chosen from your starting five) → score **×2**

### 2.4 Suspended / postponed / changed games

- Games moved to a gap between rounds (previous round ended, next not
  started) still count normally.
- Games moved into an active round window: at the end of T1, affected
  players (incl. coaches, injured, disqualified) are given their **season
  average score** instead.
  - If the game was postponed (team rested) and average score is awarded,
    the **Captain multiplier does NOT apply**.
  - If the game was outright cancelled during an open round, the Captain
    multiplier **does still apply**.
- For mass disruptions (many games/a whole round postponed), the organizer
  reserves the right to make ad-hoc rulings, announced via app/news/socials.

### 2.5 Quotations and price variations

- Each player's credit value moves after every round based on: (a) the
  score they got, and (b) their starting value — a cheaper player gets a
  bigger price bump than an expensive one for the same score.
- This changes your team's total value / purchasing power even without
  trading.
- Tips given in the rules: watch for injuries to expensive players (their
  price drops the longer they're out, cheap to rebuy later), their
  temporary replacements (cheap, decent stats), and breakout/underrated
  players early in the season.

### 2.6 Trades

- Trade window opens between the end of one round and the start of the
  next.
- You can sell **up to 4 players** per round and buy replacements (unlimited
  trades during Play-In, Playoffs, and Final Four phases).
- The **head coach can also be traded**, and counts toward the 4-per-round
  cap (so it's "3 players + coach" or "4 players", not both).
- **Unlimited-trade windows** this season (Classic Mode, Regular Season):
  - After R6: Oct 16–21
  - After R13: Nov 21–24
  - After R18: Dec 19–22
  - After R23: Jan 16–21
  - After R28: Feb 13–Mar 4
  - After R34: Mar 27–31

### 2.7 Main leagues (automatic)

Every team is auto-enrolled in three leagues, plus a new tournament:

- **General League** — every team in the game.
- **Favorite Team League** — everyone who picked the same favorite
  EuroLeague team.
- **Country League** — everyone from the same country.
- **Trophy Cup** (new) — a head-to-head knockout tournament layered on top
  of the main rankings:
  - Created after the season starts; starts on **Round 6** with the **top
    128,000 teams** by Global ranking.
  - **Groups phase (R6–R20):** the 128,000 teams are randomly split into
    8,000 groups of 16, round-robin, one H2H fixture per round (higher
    fantasy points that round wins). Groups ranked by W-L, then Trophy Cup
    points.
  - **Qualification:** top 2 per group + best 384 third-place teams
    (16,384 total) advance to knockout.
  - **Knockout:** one pause round after groups, starts **Round 22**,
    single-elimination with random pairings each round (no fixed bracket).
    Ties broken by (1) more fantasy points that round, (2) better overall
    Global ranking, (3) implicitly, earlier registration date.

### 2.8 Public and private leagues (opt-in)

Beyond the automatic leagues, you can join/create:

- **Private leagues** — invite-code only.
- **Public leagues** — open to anyone.

Each can run in one of two formats:

- **Classic ranking mode** — ranked purely by round scores.
- **Head-to-Head (H2H) mode** — 1-on-1 matchups each round, schedule
  generated 1h before the round starts.
  - Higher total score that round wins the matchup.
  - Ties broken by: (1) higher score in the general ranking, (2) higher
    starting-five score, (3) earlier registration date.
  - Overall standings = win/loss record; ties broken by general-ranking
    score, then registration date.
  - Max **18 teams** per H2H league. Fewer than 18 → schedule loops until
    the league's last round. Odd number of teams → a synthetic
    "EuroLeague Fantasy Challenge Team" is added, scoring the round's
    average across all real teams. Unlike general-ranking leagues, you
    **cannot add new participants** once an H2H league has started.
  - Private leagues need to be re-created/re-joined at the Regular
    Season → Play-In/Playoffs transition, since the game splits into two
    phases.

### 2.9 Prizes (2026-27 season specifics — will change)

Rules: all prizes are personal/non-transferable/non-exchangeable, one prize
per participant across the whole competition (best-value prize wins if you
qualify for multiple; lower ones cascade down to the next-ranked eligible
participant).

- **EuroLeague Fantasy Global League:** 1st place = VIP guest (+1) at 2028
  Final Four (flights, 4 hotel nights, VIP tickets); 2nd–5th place = tiered
  game tickets / EuroLeague TV subscription / jersey / basketball; round
  winners get a TV subscription + lottery entry for 2 Final Four tickets
  (38 round-winner participants only).
- **BKT EuroCup Fantasy Global League:** similar tiered structure (Final
  Four tickets, TV subscription, jersey, basketball), round winners (18
  regular-season rounds) get a TV subscription + Final Four ticket lottery
  entry.
- **EuroLeague / BKT EuroCup Bracket Game:** Grand/Silver/Bronze prizes —
  Final Four tickets / regular-season tickets / TV annual pass / basketball.
- **EuroLeague / EuroCup Fantasy Predictor Game:** tickets, TV pass,
  basketball, merchandise (smaller prizes).
- **EuroLeague Trophy Cup:** 4 game tickets for the winner (Final Four not
  included).
- Note in the source: *"Apple is not involved in any way with the contest
  or sweepstakes nor a sponsor of the game"* (Apple mentioned only in that
  disclaimer, not elsewhere in the visible rules).

---

## 3. Draft Mode

Private-league-only alternative to Classic Mode with **exclusive rosters**
(each real player can be on exactly one fantasy team in the league).

- Player selection happens **offline** (auction around a table, a Zoom call,
  etc.) — the app doesn't run the auction itself.
- One **Draft Commissioner** (the league creator) manually enters the
  drafted rosters into the app afterward.
- Differences from Classic Mode:
  - A drafted team does **not** also participate in Classic Mode.
  - Rosters are exclusive (no shared players across teams in the league).
  - Trade windows are opened/closed by the Commissioner only, within the
    schedule's allowed windows.
  - **No head coach** slot.
  - Player credit values do **not** fluctuate with performance.

### 3.1 Draft creation (Commissioner settings)

At league creation:
- League name
- Player selection mode: **with credits** or **without credits**
- Budget (can be 0) for post-draft free-agent buys / trade offers; if
  credits mode, also the auction budget
- Competition mode: classic ranking or H2H

After the league has started, additionally configurable:
- Starting round (next round, or a later one)
- Trade deadlines: either auto-open/close each round automatically, or the
  Commissioner manually opens/closes them (always within the schedule's
  allowed windows, never mid-round)

### 3.2 Draft types

- **With credits:** Commissioner sets a shared budget (e.g. 300cr each).
  Players are called out one at a time and bid on; leftover credits carry
  over to use in post-draft trades.
- **Without credits:** assignment order is decided offline (e.g. random
  draw), typically run as a **snake draft** (order reverses each round).
  Commissioner still sets a post-draft credit budget (can be 0) for free
  agent buys/trades.

### 3.3 Trades (free agents)

Free agents = players not on any team in the league. To acquire one during
a trade window:

1. Pick a player in your roster to waive, and a free agent of the **same
   position**.
2. Offer credits for them (if budget allows).
3. Offer appears in the league's "Offer list" (under the Team page) and can
   be edited any time before the window closes.
4. **3 hours before trades close**, the highest bidder automatically gets
   the new player in the vacated roster slot; the waived player becomes a
   free agent for the next window.
5. If your offer loses, your credits are refunded and you keep the waived
   player.

Special cases:
- **Tied bids:** won by whichever bidder is ranked lower in the league
  standings.
- **Multiple successful offers cutting the same player:** the
  chronologically first offer wins.

### 3.4 Player exchanges (team-to-team trades)

Same mechanics as free-agent trades, but between two league participants
directly — no need to wait for the trade window to close; the receiving
side can accept/reject the offer at any time.

---

## 4. Bracket Challenge (separate game)

Predict the path to the championship in a single-elimination bracket, for
both EuroLeague and EuroCup.

### 4.1 Participation
- Requires a **EuroLeague ID** (same login as the Fantasy Challenge app).
- Opens at the end of the Regular Season, before the first Play-In game.
- Up to **3 brackets per account**.
- Must submit before the first game of the relevant competition (first
  Play-In game for EuroLeague, first Playoff game for EuroCup); freely
  editable until then, locked once that game starts.

### 4.2 Structure

**EuroCup:** Round of 16 (single game) → Quarterfinals (single game) →
Semifinals (best-of-3) → Final (best-of-3).

**EuroLeague:** Play-In (7v8, 9v10, then loser-of-A vs winner-of-B, single
games) → Quarterfinals (best-of-5, seeded by regular-season ranking) →
Final Four (single-elimination: semis then final).

### 4.3 Predictions & scoring

Depending on the round, you may predict: game/series winner, exact series
result, final score margin (final only), and Finals MVP.

**EuroLeague scoring:**

| Prediction | Points |
|---|---|
| Winner of Play-Ins | 10 |
| Winner of series (Playoffs) | 15 |
| Correct series result (e.g. 3-1) | 5 |
| Winner single game (Semi/Final Four) | 20 |
| Final winner | 50 |
| Final MVP | 10 |
| Final points gap | 5 |

**EuroCup scoring:**

| Prediction | Points |
|---|---|
| Winner of Round of 16 | 10 |
| Winner of Quarterfinals | 15 |
| Winner of Semifinals | 20 |
| Correct series result – Semi (e.g. 2-1) | 5 |
| Final winner | 50 |
| Final MVP | 10 |
| Correct series result – Final (e.g. 2-1) | 5 |

### 4.4 Leagues & rules
- Auto-enrolled in a **Global league**; can also join/create **private**
  (invite-code) or **public** leagues. Ranked by round score; ties broken
  by earliest bracket submission.
- Organizer can disqualify entries for rule violations, and reserves the
  right to modify/suspend/terminate the game and make final calls on
  rankings/disputes/edge cases. Their system is the official timekeeper for
  late/failed submissions.
- Support: `info@euroleague-fantasychallenge.com`

### 4.5 Prizes (season-specific, will change)
- **EuroLeague:** Grand = 2× Final Four tickets; Silver = 4× regular-season
  tickets; Bronze = 1× EuroLeagueTV annual pass.
- **BKT EuroCup:** Grand = 4× regular-season tickets; Silver = 1× EuroLeague
  TV annual pass; Bronze = 1× EuroCup Spalding basketball.

---

## 5. Game Predictor (separate game)

A per-round quiz: pick the winner of every game in the round (10 games/round
mentioned in the source).

- Predictions open as soon as a new round opens; you can enter/edit a pick
  for a given game until **1 minute before that specific game tips off**.
- If a round is already underway when you start, you can still submit picks
  for any games in it that haven't started yet.
- **Partial saving** is allowed — fill in some picks now, finish later.
- Round states: **Open Quiz** (pick freely) → **Quiz in Progress** (round
  started; can still edit picks for not-yet-started games, live scores
  shown) → **Ranking Calculation** → **Round Finished** (final score shown).
- **Scoring:** flat **+10 points per correct pick**; round scores sum into
  the overall ranking.
- **Prizes:** EuroLeague version = 2× regular-season tickets + TV annual
  pass; EuroCup version = 1× Spalding basketball + merchandise.

---

## 6. Post-Season game notes

(This source page is mostly infographic images that weren't machine-
readable as text — worth opening directly in-app if visual detail is
needed. Text notes captured:)

- The **Post Season** game is accessed via the same top dropdown used to
  switch between EuroLeague/EuroCup. Your Regular Season tab stays
  available separately for viewing past results/standings.
- **Players on teams not competing in a given round score 0** for that
  round, but you get **unlimited trades every round** during the Post
  Season phase.

---

## 7. Not covered here

- **Legal / Privacy Policy / Terms & Conditions** pages exist in the same
  GitBook (`/legal/privacy-policy`, `/legal/terms-and-conditions`) but
  weren't pulled in — that's boilerplate legal text, not gameplay rules.
  Fetch them the same way (`<url>.md`) if needed.
- Exact current-season dates/prize values will drift — re-pull from the
  live GitBook rather than trusting this file long-term for anything
  time-sensitive (trade windows, ticket counts, years mentioned are for the
  2026-27 season as captured).
