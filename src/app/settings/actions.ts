"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { markOptimizerStale } from "@/lib/flags";
import { DUNKEST_TOKEN_KEY, deleteSetting, setSetting } from "@/lib/kv";

export async function saveToken(formData: FormData) {
  const raw = String(formData.get("token") ?? "").trim().replace(/^"|"$/g, "");
  if (raw) await setSetting(db, DUNKEST_TOKEN_KEY, raw);
  revalidatePath("/settings");
}

export async function clearToken() {
  await deleteSetting(db, DUNKEST_TOKEN_KEY);
  revalidatePath("/settings");
}

export async function saveMapping(formData: FormData) {
  const dunkestTeamId = Number(formData.get("dunkestTeamId"));
  const rawMap = String(formData.get("fantasyTeamId") ?? "");
  const fantasyTeamId = rawMap === "" ? null : Number(rawMap);
  if (!Number.isFinite(dunkestTeamId)) return;

  // keep the mapping 1:1 — clear any other synced team already holding this slot
  if (fantasyTeamId != null) {
    await db
      .update(schema.syncedTeams)
      .set({ mappedFantasyTeamId: null })
      .where(eq(schema.syncedTeams.mappedFantasyTeamId, fantasyTeamId));
  }
  await db
    .update(schema.syncedTeams)
    .set({ mappedFantasyTeamId: fantasyTeamId })
    .where(eq(schema.syncedTeams.dunkestTeamId, dunkestTeamId));
  revalidatePath("/settings");
}

const clamp = (v: number, lo: number, hi: number, d: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

export async function saveTuning(formData: FormData) {
  const num = (k: string) => Number(formData.get(k));

  const budget = clamp(num("budget"), 80, 130, 100);
  const safeK = clamp(num("safeK"), 0, 2, 0.6);
  const aggK = clamp(num("aggK"), 0, 2, 0.6);

  await db.update(schema.fantasyTeams).set({ budget });
  await db
    .update(schema.fantasyTeams)
    .set({ riskK: safeK })
    .where(eq(schema.fantasyTeams.strategy, "safe"));
  await db
    .update(schema.fantasyTeams)
    .set({ riskK: aggK })
    .where(eq(schema.fantasyTeams.strategy, "aggressive"));

  await setSetting(db, "overlapCap", Math.round(clamp(num("overlapCap"), 3, 11, 6)));
  await setSetting(db, "contrarianWeight", clamp(num("contrarianWeight"), 0, 1, 0.2));
  await setSetting(db, "turnBalancePenalty", clamp(num("turnBalancePenalty"), 0, 20, 6));
  await setSetting(db, "minPerTurn", Math.round(clamp(num("minPerTurn"), 3, 6, 5)));

  await markOptimizerStale(db);
  revalidatePath("/settings");
  revalidatePath("/");
}
