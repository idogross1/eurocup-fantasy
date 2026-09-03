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

export async function toggleFlag(formData: FormData) {
  const playerId = Number(formData.get("playerId"));
  const field = String(formData.get("field")); // 'lock' | 'exclude' | 'out'
  const on = formData.get("on") === "true";
  if (!Number.isFinite(playerId)) return;

  if (field === "lock") setPlayerFlag(db, playerId, { lock: on });
  else if (field === "exclude") setPlayerFlag(db, playerId, { exclude: on });
  else if (field === "out")
    setPlayerFlag(db, playerId, { injuryOverride: on ? "out" : null });

  await reproject();
  revalidatePath("/players");
  revalidatePath("/");
}

export async function setBoost(formData: FormData) {
  const playerId = Number(formData.get("playerId"));
  const pct = Math.max(-50, Math.min(50, Number(formData.get("pct")) || 0));
  if (!Number.isFinite(playerId)) return;
  setPlayerFlag(db, playerId, { boostPct: pct });
  await reproject();
  revalidatePath("/players");
}

export async function clearFlags(formData: FormData) {
  const playerId = Number(formData.get("playerId"));
  if (!Number.isFinite(playerId)) return;
  clearPlayerFlag(db, playerId);
  await reproject();
  revalidatePath("/players");
  revalidatePath("/");
}
