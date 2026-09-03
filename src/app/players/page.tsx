import { getPlayersForCurrentMatchday } from "@/lib/players";

import { RebuildBanner } from "../rebuild-banner";
import { PlayersTable } from "./players-table";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const { matchday, players } = await getPlayersForCurrentMatchday();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Players</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {matchday
            ? `${players.length} players · ${matchday.label} (Round ${matchday.number}) · use the Flags column to mark Out / exclude / lock / nudge`
            : "No matchday loaded — run npm run setup"}
        </p>
      </div>
      <RebuildBanner />
      {players.length > 0 && <PlayersTable players={players} />}
    </div>
  );
}
