import { db } from "@/db";
import { getRoundPlan, type LineupCheck, type PlanPlayer, type TurnPlan } from "@/lib/planner";

import { RebuildBanner } from "../rebuild-banner";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const { matchday, turns, teams } = await getRoundPlan(db);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Round planner</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {matchday ? `${matchday.label} (Round ${matchday.number})` : "No matchday loaded"} ·{" "}
          {turns.length
            ? `${turns.length} turns (game days): ${turns.map((t) => `T${t}`).join(", ")}`
            : "no turn data yet — sync"}
          . Roster is 5 starters (100%) + 5 bench (50%) + coach (100%); a player&apos;s turn is
          the day their real club plays.
        </p>
      </div>

      <RebuildBanner />

      {teams.length === 0 && (
        <p className="text-sm text-[var(--muted)]">Run the optimiser to get lineups to plan.</p>
      )}

      <div className="space-y-6">
        {teams.map((t) => (
          <div key={t.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4">
              <div>
                <span className="font-semibold">
                  Team {t.id} · {t.name}
                </span>
                <span className="ml-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                  {t.strategy}
                </span>
                {t.formationName && (
                  <span className="ml-2 text-xs text-[var(--muted)]">· {t.formationName}</span>
                )}
              </div>
              <LineupCheckBadge check={t.lineupCheck} />
            </div>

            <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2">
              {t.turns.map((tp) => (
                <TurnCard key={tp.turn} tp={tp} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineupCheckBadge({ check }: { check: LineupCheck }) {
  if (check.status === "unsynced") {
    return (
      <span className="rounded bg-[var(--panel-2)] px-2 py-1 text-xs text-[var(--muted)]">
        Not synced — map a real team on Settings to check your lineup
      </span>
    );
  }
  if (check.status === "roster-mismatch") {
    return (
      <span className="rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-400">
        {check.missingCount} recommended player{check.missingCount === 1 ? "" : "s"} not on{" "}
        {check.realTeamName} yet — see Trades first
      </span>
    );
  }
  if (check.status === "match") {
    return (
      <span className="rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400">
        ✓ Matches {check.realTeamName}
      </span>
    );
  }
  return (
    <div className="text-xs">
      <span className="rounded bg-red-500/15 px-2 py-1 text-red-400">
        Needs fixing on {check.realTeamName}
      </span>
      <ul className="mt-1 space-y-0.5 pl-1 text-[var(--muted)]">
        {check.fixes.map((f, i) => (
          <li key={i}>• {f}</li>
        ))}
      </ul>
    </div>
  );
}

function TurnCard({ tp }: { tp: TurnPlan }) {
  return (
    <div className="bg-[var(--panel)] p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">Turn {tp.turn}</h3>
        {tp.coach && (
          <span className="text-xs text-[var(--muted)]">
            coach {tp.coach.teamAbbr}
            {tp.coach.playing ? "" : " (no game)"}
          </span>
        )}
      </div>

      {tp.captain && (
        <p className="mt-1 text-xs">
          <span className="rounded bg-[var(--accent)]/15 px-1 text-[10px] font-bold text-[var(--accent)]">
            C
          </span>{" "}
          <span className="text-[var(--text)]">{tp.captain.name}</span>
          <span className="text-[var(--muted)]"> — highest projection playing this turn</span>
        </p>
      )}

      <p
        className={`mt-1 text-xs ${
          tp.swaps.length ? "text-amber-400" : "text-[var(--muted)]"
        }`}
      >
        {tp.note}
      </p>

      <PlayerList label="Field (100%)" players={tp.starters} captainId={tp.captain?.id} />
      <PlayerList label="Bench (50%)" players={tp.bench} muted />
    </div>
  );
}

function PlayerList({
  label,
  players,
  captainId,
  muted,
}: {
  label: string;
  players: (PlanPlayer & { playing: boolean })[];
  captainId?: number;
  muted?: boolean;
}) {
  if (players.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <ul className={`mt-1 space-y-0.5 text-sm ${muted ? "text-[var(--muted)]" : ""}`}>
        {players.map((p) => (
          <li key={p.id} className={`flex justify-between ${p.playing ? "" : "opacity-50"}`}>
            <span>
              {p.position === "Head Coach" ? "HC" : p.position[0]} {p.name}
              {p.id === captainId && (
                <span className="ml-1.5 rounded bg-[var(--accent)]/15 px-1 text-[10px] font-bold text-[var(--accent)]">
                  C
                </span>
              )}
              {!p.playing && <span className="ml-1.5 text-[10px] text-[var(--muted)]">no game</span>}
            </span>
            <span className="tabular-nums text-[var(--muted)]">
              {p.teamAbbr}
              {p.opponentAbbr ? ` v${p.opponentAbbr}` : ""} · {p.mean.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
