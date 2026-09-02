import { getTeamsForCurrentMatchday } from "@/lib/teams";

export const dynamic = "force-dynamic";

const STRATEGY_BLURB: Record<string, string> = {
  safe: "High floor — minimises downside (mean − k·σ).",
  balanced: "Pure expected value (mean).",
  aggressive: "High ceiling + contrarian (mean + k·σ − ownership).",
};

const SLOT_LABEL: Record<string, string> = {
  coach: "Coach",
  starter: "Starter",
  sixth: "6th man",
  bench: "Bench",
};

export default async function TeamsPage() {
  const { matchday, teams } = await getTeamsForCurrentMatchday();
  const built = teams.some((t) => t.players.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {matchday ? `${matchday.label} (Round ${matchday.number})` : "No matchday loaded"}
          {" · "}
          overlap cap decorrelates the three rosters
        </p>
      </div>

      {!built && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5 text-sm">
          <p className="font-medium">No rosters yet.</p>
          <p className="mt-1 text-[var(--muted)]">
            Run <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">npm run optimize</code>{" "}
            to build all three teams.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {teams.map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--panel)]"
          >
            <div className="border-b border-[var(--border)] p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">
                  Team {t.id} · {t.name}
                </h2>
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {t.strategy}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{STRATEGY_BLURB[t.strategy]}</p>
              <div className="mt-3 flex gap-4 text-sm tabular-nums">
                <span>
                  <span className="text-[var(--muted)]">Proj </span>
                  <span className="font-semibold">{t.projPoints || "—"}</span>
                </span>
                <span>
                  <span className="text-[var(--muted)]">Credits </span>
                  {t.creditsUsed || "—"}/{t.budget}
                </span>
                <span>
                  <span className="text-[var(--muted)]">Form </span>
                  {t.formationName ?? "—"}
                </span>
              </div>
            </div>

            {t.players.length > 0 && (
              <table className="w-full flex-1 text-sm">
                <tbody>
                  {t.players.map((p, i) => {
                    const prevSlot = i > 0 ? t.players[i - 1].slot : null;
                    return (
                      <tr
                        key={p.id}
                        className={`border-t border-[var(--border)] ${
                          p.slot === "bench" ? "text-[var(--muted)]" : ""
                        } ${prevSlot && prevSlot !== p.slot ? "border-t-[var(--border)]" : ""}`}
                      >
                        <td className="py-1.5 pl-4 pr-2 text-[11px] uppercase text-[var(--muted)]">
                          {prevSlot === p.slot ? "" : SLOT_LABEL[p.slot]}
                        </td>
                        <td className="px-2 py-1.5">
                          {p.name}
                          {p.isCaptain && (
                            <span className="ml-1.5 rounded bg-[var(--accent)]/15 px-1 text-[10px] font-bold text-[var(--accent)]">
                              C
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--muted)]">
                          {p.position === "Head Coach" ? "HC" : p.position[0]}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--muted)]">
                          {p.teamAbbr}
                          <span className="text-[var(--muted)]/50">
                            {p.opponentAbbr ? ` v${p.opponentAbbr}` : ""}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {p.quotation.toFixed(1)}
                        </td>
                        <td className="py-1.5 pl-2 pr-4 text-right tabular-nums font-medium">
                          {p.mean != null ? p.mean.toFixed(1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
