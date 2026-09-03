"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { getCurrentMatchday } from "@/lib/players";
import { optimizeAllTeams } from "@/lib/optimizer/run";
import { computeTradePlan } from "@/lib/trades/plan";

/** Recompute the 3 optimizer teams (and the trade plan) after a flag/setting change. */
export async function rebuildTeams() {
  const md = await getCurrentMatchday();
  if (!md) return;
  await optimizeAllTeams(db, md.id);
  await computeTradePlan(db, md.id);
  for (const path of ["/", "/teams", "/trades", "/planner", "/players"]) {
    revalidatePath(path);
  }
}
