"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getCurrentMatchday } from "@/lib/players";
import { computeTradePlan } from "@/lib/trades/plan";

export async function regenerate() {
  const md = await getCurrentMatchday();
  if (md) await computeTradePlan(db, md.id);
  revalidatePath("/trades");
}

export async function setApplied(formData: FormData) {
  const id = Number(formData.get("id"));
  const applied = formData.get("applied") === "true";
  if (Number.isFinite(id)) {
    db.update(schema.trades).set({ applied }).where(eq(schema.trades.id, id)).run();
  }
  revalidatePath("/trades");
}
