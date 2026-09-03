import "dotenv/config";

import { desc, eq } from "drizzle-orm";

import { createDb, schema } from "../src/db/connection";
import { computeTradePlan } from "../src/lib/trades/plan";

/** Print the trade / build plan for the current matchday. Usage: npm run trades [matchdayId] */
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

  const plan = await computeTradePlan(db, matchdayId);
  console.log(`Trade plan — matchday ${plan.matchdayId}`);
  console.log(`Window: ${plan.window.label} — ${plan.window.note}\n`);

  for (const t of plan.teams) {
    console.log(
      `── Team ${t.fantasyTeamId} · ${t.name} [${t.mode}]` +
        (t.realTeamName ? ` ↔ ${t.realTeamName}` : ""),
    );
    console.log(`   ${t.note}`);
    if (t.moves.length) {
      console.log(
        `   moves ${t.moveCount} · Δcr ${t.creditDelta > 0 ? "+" : ""}${t.creditDelta} · ` +
          `Δproj ${t.projDelta > 0 ? "+" : ""}${t.projDelta}`,
      );
      for (const m of t.moves) {
        const out = m.out ? `${m.out.name} (${m.out.quotation}cr)` : "—";
        const inp = m.in ? `${m.in.name} (${m.in.quotation}cr)` : "—";
        console.log(
          `   ${m.applied ? "[x]" : "[ ]"} ${out.padEnd(28)} -> ${inp.padEnd(28)} ` +
            `Δcr ${(m.creditDelta > 0 ? "+" : "") + m.creditDelta.toFixed(1)}  ` +
            `Δproj ${(m.projDelta > 0 ? "+" : "") + m.projDelta.toFixed(1)}`,
        );
      }
    }
    console.log();
  }
  client.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
