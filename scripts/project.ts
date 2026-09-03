import "dotenv/config";

import { desc, eq } from "drizzle-orm";

import { createDb, schema } from "../src/db/connection";
import { computeProjections } from "../src/lib/projections/compute";

/**
 * Recompute projections for the current matchday and print a summary.
 * Usage: npm run project [matchdayId]
 */
async function main() {
  const { db, client } = createDb();

  let matchdayId = Number(process.argv[2]);
  if (!Number.isFinite(matchdayId)) {
    const [current] =
      (await db
        .select()
        .from(schema.matchdays)
        .where(eq(schema.matchdays.isCurrent, true))
        .limit(1)) ?? [];
    const [latest] = await db
      .select()
      .from(schema.matchdays)
      .orderBy(desc(schema.matchdays.number))
      .limit(1);
    matchdayId = (current ?? latest)?.id;
  }
  if (!matchdayId) {
    console.error("no matchday found — run npm run setup first");
    process.exit(1);
  }

  const summary = await computeProjections(db, matchdayId);
  console.log(`projected ${summary.count} players for matchday ${summary.matchdayId}`);
  console.log(
    `model: price ${summary.params.priceCoef}·q^${summary.params.priceExpo}, ` +
      `statsBlend ${summary.params.statsBlend}, bandZ ${summary.params.bandZ}`,
  );
  console.log("\ntop 15 by mean:");
  for (const t of summary.top) {
    console.log(
      `  ${t.mean.toFixed(1).padStart(5)}  [${t.floor.toFixed(1).padStart(5)} … ${t.ceiling
        .toFixed(1)
        .padStart(5)}]  ${t.position.padEnd(11)} ${t.name}`,
    );
  }

  // quick sanity: coach spread
  const coaches = await db
    .select({
      first: schema.players.firstName,
      last: schema.players.lastName,
      team: schema.players.realTeamAbbr,
      mean: schema.projections.mean,
      floor: schema.projections.floor,
      ceiling: schema.projections.ceiling,
    })
    .from(schema.projections)
    .innerJoin(schema.players, eq(schema.players.id, schema.projections.playerId))
    .where(eq(schema.players.position, "Head Coach"))
    .orderBy(desc(schema.projections.mean));
  console.log(`\ncoaches (${coaches.length}): best & worst 3`);
  for (const c of [...coaches.slice(0, 3), ...coaches.slice(-3)]) {
    console.log(
      `  ${c.mean.toFixed(1).padStart(6)}  [${c.floor.toFixed(1).padStart(6)} … ${c.ceiling
        .toFixed(1)
        .padStart(6)}]  ${c.team}  ${c.first} ${c.last}`,
    );
  }

  client.close();
}

main();
