"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clearPlayerFlag, setPlayerFlag } from "@/lib/flags";
import { getCurrentMatchday } from "@/lib/players";
import { computeProjections } from "@/lib/projections/compute";

async function reproject() {
  const md = await getCurrentMatchday();
  if (md) await computeProjections(db, md.id);
}

export type FlagField = "lock" | "exclude" | "out";

export async function toggleFlag(playerId: number, field: FlagField, on: boolean) {
  if (!Number.isFinite(playerId)) return;
  if (field === "lock") setPlayerFlag(db, playerId, { lock: on });
  else if (field === "exclude") setPlayerFlag(db, playerId, { exclude: on });
  else if (field === "out") setPlayerFlag(db, playerId, { injuryOverride: on ? "out" : null });

  await reproject();
  revalidatePath("/players");
  revalidatePath("/");
}

export async function setBoost(playerId: number, pct: number) {
  if (!Number.isFinite(playerId)) return;
  const clamped = Math.max(-50, Math.min(50, Math.round(pct) || 0));
  setPlayerFlag(db, playerId, { boostPct: clamped });
  await reproject();
  revalidatePath("/players");
  revalidatePath("/");
}

export async function clearFlags(playerId: number) {
  if (!Number.isFinite(playerId)) return;
  clearPlayerFlag(db, playerId);
  await reproject();
  revalidatePath("/players");
  revalidatePath("/");
}
