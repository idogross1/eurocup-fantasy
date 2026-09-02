"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { DUNKEST_TOKEN_KEY, deleteSetting, setSetting } from "@/lib/kv";

export async function saveToken(formData: FormData) {
  const raw = String(formData.get("token") ?? "").trim().replace(/^"|"$/g, "");
  if (raw) setSetting(db, DUNKEST_TOKEN_KEY, raw);
  revalidatePath("/settings");
}

export async function clearToken() {
  deleteSetting(db, DUNKEST_TOKEN_KEY);
  revalidatePath("/settings");
}

export async function saveMapping(formData: FormData) {
  const dunkestTeamId = Number(formData.get("dunkestTeamId"));
  const rawMap = String(formData.get("fantasyTeamId") ?? "");
  const fantasyTeamId = rawMap === "" ? null : Number(rawMap);
  if (!Number.isFinite(dunkestTeamId)) return;

  // keep the mapping 1:1 — clear any other synced team already holding this slot
  if (fantasyTeamId != null) {
    db.update(schema.syncedTeams)
      .set({ mappedFantasyTeamId: null })
      .where(eq(schema.syncedTeams.mappedFantasyTeamId, fantasyTeamId))
      .run();
  }
  db.update(schema.syncedTeams)
    .set({ mappedFantasyTeamId: fantasyTeamId })
    .where(eq(schema.syncedTeams.dunkestTeamId, dunkestTeamId))
    .run();
  revalidatePath("/settings");
}
