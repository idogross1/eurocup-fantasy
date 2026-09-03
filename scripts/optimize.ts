import "dotenv/config";

import { desc, eq } from "drizzle-orm";

import { createDb, schema } from "../src/db/connection";
import { optimizeAllTeams } from "../src/lib/optimizer/run";

/** Build all 3 fantasy teams for the current matchday. Usage: npm run optimize [matchdayId] */
async function main() {
  const { db, client } = createDb();

  let matchdayId = Number(process.argv[2]);
  if (!Number.isFinite(matchdayId)) {
    const [current] = await db
      .select()
      .from(schema.matchdays)
      .where(eq(schema.matchdays.isCurrent, true))
      .limit(1);
    const [latest] = await db
      .select()
      .from(schema.matchdays)
      .orderBy(desc(schema.matchdays.number))
      .limit(1);
    matchdayId = (current ?? latest)?.id;
  }

  const t0 = Date.now();
  const { teams } = await optimizeAllTeams(db, matchdayId);
  console.log(`optimized in ${Date.now() - t0}ms (matchday ${matchdayId})\n`);

  for (const res of teams) {
    console.log(
      `── Team ${res.spec.teamId} · ${res.spec.name} (${res.spec.strategy}) ` +
        `— ${res.status}`,
    );
    if (res.status !== "optimal") {
      console.log();
      continue;
    }
    console.log(
      `   formation ${res.formationName ?? "?"} · credits ${res.creditsUsed}/${res.spec.budget} ` +
        `· proj ${res.projPoints} pts · strategyScore ${res.strategyScore}`,
    );
    const cap = res.players.find((p) => p.isCaptain);
    console.log(`   captain: ${cap ? `${cap.firstName} ${cap.lastName}` : "—"}`);
    for (const p of res.players) {
      const tag = p.isCaptain ? " (C)" : "";
      console.log(
        `   ${p.slot.padEnd(7)} ${p.position.padEnd(11)} ${(`${p.firstName} ${p.lastName}` + tag).padEnd(26)} ` +
          `${p.teamAbbr.padEnd(4)} ${p.quotation.toFixed(1).padStart(5)}cr  ${p.mean.toFixed(1).padStart(5)} mean`,
      );
    }
    const overlap1 = teams[0];
    if (res.spec.teamId !== overlap1.spec.teamId && overlap1.status === "optimal") {
      const shared = res.players.filter((p) =>
        overlap1.players.some((q) => q.id === p.id),
      ).length;
      console.log(`   shared with Team 1: ${shared}`);
    }
    console.log();
  }

  client.close();
}

main();
