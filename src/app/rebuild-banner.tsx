import { db } from "@/db";
import { isOptimizerStale } from "@/lib/flags";

import { rebuildTeams } from "./rebuild-action";

/** Shown on team-facing pages when flags/settings changed since the last optimise. */
export function RebuildBanner() {
  if (!isOptimizerStale(db)) return null;
  return (
    <form
      action={rebuildTeams}
      className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300"
    >
      <span>
        Flags or settings changed — the 3 teams and trade plan are out of date.
      </span>
      <button className="shrink-0 rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-xs font-medium hover:bg-amber-500/25">
        Rebuild teams
      </button>
    </form>
  );
}
