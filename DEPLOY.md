# Deploy: Turso + Vercel

## 1. Create the Turso database

Install the CLI and sign up (free):

```sh
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup          # opens the browser
turso db create eurocup-fantasy
```

Grab the two values you'll need:

```sh
turso db show eurocup-fantasy --url        # -> DATABASE_URL  (libsql://…)
turso db tokens create eurocup-fantasy     # -> DATABASE_AUTH_TOKEN
```

## 2. Seed the remote database (run locally, once)

Point the scripts at Turso and run the same bootstrap you ran locally:

```sh
export DATABASE_URL='libsql://…'            # from step 1
export DATABASE_AUTH_TOKEN='…'              # from step 1
export DUNKEST_TOKEN='…'                    # your flutter.authToken

npm run db:migrate      # create the tables
npm run import:csv      # 469-player CSV bootstrap
npm run project         # initial projections
npm run sync            # pull live pool + your 3 rosters, rebuild teams
```

(Unset those exports afterwards so local dev goes back to the file DB.)

## 3. Deploy to Vercel

```sh
npm i -g vercel
vercel link                # pick / create the project
```

Add the environment variables (Production + Preview):

```sh
vercel env add DATABASE_URL          # libsql://…
vercel env add DATABASE_AUTH_TOKEN   # …
vercel env add DUNKEST_TOKEN         # …
vercel env add CRON_SECRET           # openssl rand -hex 32
```

Then:

```sh
vercel --prod
```

## 4. What runs automatically

`vercel.json` registers a daily cron: `GET /api/sync` at 05:00 UTC. It pulls
fresh prices/injuries/rosters, reprojects, and rebuilds the 3 optimiser teams.
`CRON_SECRET` gates it (Vercel sends it as a Bearer token) so it isn't a public
refresh button. Trigger it by hand any time from **Settings → Sync now**.

## Add a second league (EuroLeague)

Same codebase, its own database and Vercel project. `LEAGUE_ID` selects the
competition: `11` = EuroCup (default), `10` = EuroLeague.

```sh
turso db create euroleague-fantasy
turso db show euroleague-fantasy --url
turso db tokens create euroleague-fantasy
```

Seed it (no CSV for EuroLeague — sync pulls everything live):

```sh
export LEAGUE_ID=10
export DATABASE_URL='libsql://euroleague-fantasy-…'
export DATABASE_AUTH_TOKEN='…'
export DUNKEST_TOKEN='…'          # same account/token as EuroCup

npm run db:migrate
npm run seed                      # 3 optimiser teams + default settings
npm run sync                      # live pool + your EuroLeague rosters
```

In Vercel: **Add New → Project → import the same `eurocup-fantasy` repo again**
(a second project). Set env vars for it:

| Name | Value |
|---|---|
| `LEAGUE_ID` | `10` |
| `DATABASE_URL` | the euroleague-fantasy Turso URL |
| `DATABASE_AUTH_TOKEN` | its token |
| `DUNKEST_TOKEN` | same as EuroCup |
| `CRON_SECRET` | a fresh `openssl rand -hex 32` |

Deploy. One `git push` now redeploys both projects; each has its own daily
sync cron and its own data.

## Notes

- The token can expire; when a sync fails with a 401, log into the fantasy site
  again, copy a fresh `flutter.authToken`, and update `DUNKEST_TOKEN` in Vercel
  (or paste it on the Settings page — the DB value is the fallback).
- Schema changes: add a migration with `npm run db:generate`, then rerun
  `npm run db:migrate` against `DATABASE_URL=libsql://…`.
- Local dev is unchanged: `npm run dev` uses `data/eurocup.sqlite`.
