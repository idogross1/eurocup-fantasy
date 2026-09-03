import { db } from "@/db";
import { isOptimizerStale } from "@/lib/flags";

import { RebuildButton } from "./rebuild-button";

/** Shown on team-facing pages when flags/settings changed since the last optimise. */
export async function RebuildBanner() {
  if (!(await isOptimizerStale(db))) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
      <span>Flags or settings changed — the 3 teams and trade plan are out of date.</span>
      <RebuildButton />
    </div>
  );
}
