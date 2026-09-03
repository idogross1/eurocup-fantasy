import "dotenv/config";

import { createDb } from "../src/db/connection";
import { seedBaseData } from "../src/db/seed";
import { LEAGUE } from "../src/lib/league";

/**
 * Live-only bootstrap: create the 3 optimiser teams + default settings, no CSV.
 * Use for a league that has no CSV snapshot (e.g. EuroLeague):
 *   npm run db:migrate && npm run seed && npm run sync
 */
async function main() {
  const { db, client } = createDb();
  await seedBaseData(db);
  client.close();
  console.log(`seeded base data for ${LEAGUE.name} (league ${LEAGUE.id})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
