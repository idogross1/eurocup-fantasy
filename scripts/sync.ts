import "dotenv/config";

import { createDb } from "../src/db/connection";
import { resolveDunkestToken } from "../src/lib/kv";
import { runFullRefresh } from "../src/lib/pipeline";

/**
 * Pull live data from Dunkest, reproject, rebuild the 3 teams.
 * Token comes from DUNKEST_TOKEN env or the settings table (set via /settings).
 * Usage: npm run sync [--no-optimize]
 */
async function main() {
  const { db, sqlite } = createDb();
  const token = resolveDunkestToken(db);
  if (!token) {
    console.error(
      "no Dunkest token. Set DUNKEST_TOKEN in .env, or paste one on the /settings page.",
    );
    process.exit(1);
  }

  const optimize = !process.argv.includes("--no-optimize");
  const t0 = Date.now();
  const res = await runFullRefresh(db, { token, optimize });
  const ms = Date.now() - t0;

  const s = res.sync!;
  console.log(
    `synced Matchday ${s.matchdayNumber} (id ${s.matchdayId}) in ${ms}ms\n` +
      `  players: ${s.playersUpserted}   real teams: ${s.teamsUpserted}\n` +
      `  projections recomputed: ${res.projected ?? "—"}`,
  );
  console.log("\nyour fantasy teams:");
  for (const t of s.syncedTeams) {
    console.log(`  #${t.id} ${t.name} — roster ${t.rosterSize}/11, rank ${t.position ?? "—"}`);
  }
  if (res.teams) {
    console.log("\noptimizer teams rebuilt:");
    for (const t of res.teams) {
      console.log(`  Team ${t.id} ${t.name}: ${t.status}, proj ${t.projPoints}`);
    }
  }

  sqlite.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
