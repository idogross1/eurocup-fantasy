import { db } from "@/db";
import { getRoundPlan, type PlanPlayer } from "@/lib/planner";

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
          . Each player&apos;s turn = the day their real team plays.
        </p>
      </div>

      <RebuildBanner />

      {teams.length === 0 && (
        <p className="text-sm text-[var(--muted)]">Run the optimiser to get lineups to plan.</p>
      )}

      <div className="space-y-6">
        {teams.map((t) => (
          <div key={t.id} className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
            <div className="border-b border-[var(--border)] p-4">
              <span className="font-semibold">
                Team {t.id} · {t.name}
              </span>
              <span className="ml-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                {t.strategy}
              </span>
            </div>

            <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2">
              {t.turns.map((tp) => (
                <div key={tp.turn} className="bg-[var(--panel)] p-4">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-medium">Turn {tp.turn}</h3>
                    <span className="text-xs text-[var(--muted)]">
                      {tp.formationName ?? "—"}
                      {tp.coach ? ` · coach ${tp.coach.teamAbbr}` : ""}
                    </span>
                  </div>
                  {tp.captain && (
                    <p className="mt-1 text-xs">
                      <span className="rounded bg-[var(--accent)]/15 px-1 text-[10px] font-bold text-[var(--accent)]">
                        C
                      </span>{" "}
                      <span className="text-[var(--text)]">{tp.captain.name}</span>
                      <span className="text-[var(--muted)]">
                        {" "}
                        — highest projection playing this turn
                      </span>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[var(--muted)]">{tp.note}</p>

                  <PlayerList label="Start" players={tp.starters} captainId={tp.captain?.id} />
                  {tp.bench.length > 0 && (
                    <PlayerList label="Bench this turn (plays, 50%)" players={tp.bench} />
                  )}
                  {tp.notPlaying.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        No game in Turn {tp.turn}
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {tp.notPlaying
                          .map((p) => `${p.position === "Head Coach" ? "HC" : p.position[0]} ${p.name}`)
                          .join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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
  players: PlanPlayer[];
  captainId?: number;
  muted?: boolean;
}) {
  if (players.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <ul className={`mt-1 space-y-0.5 text-sm ${muted ? "text-[var(--muted)]" : ""}`}>
        {players.map((p) => (
          <li key={p.id} className="flex justify-between">
            <span>
              {p.position === "Head Coach" ? "HC" : p.position[0]} {p.name}
              {p.id === captainId && (
                <span className="ml-1.5 rounded bg-[var(--accent)]/15 px-1 text-[10px] font-bold text-[var(--accent)]">
                  C
                </span>
              )}
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
