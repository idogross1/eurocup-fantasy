import { db } from "@/db";
import { getCurrentMatchday } from "@/lib/players";
import { computeTradePlan, type TradeMove } from "@/lib/trades/plan";

import { regenerate, setApplied } from "./actions";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  build: "Initial build",
  "in-sync": "In sync",
  trade: "Trades",
  "trade-capped": "Best 4-move upgrade",
};

export default async function TradesPage() {
  const md = await getCurrentMatchday();
  const plan = md ? await computeTradePlan(db, md.id) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Trades</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {md ? `${md.label} (Round ${md.number})` : "No matchday loaded"} · what to change in the
            real app to reach each target roster
          </p>
        </div>
        <form action={regenerate}>
          <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm hover:border-[var(--accent)]">
            Recompute
          </button>
        </form>
      </div>

      {plan && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            plan.window.locked
              ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
              : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
          }`}
        >
          <span className="font-medium text-[var(--text)]">{plan.window.label}</span>
          {" — "}
          {plan.window.note}{" "}
          {plan.window.maxMoves === "unlimited" ? "" : `(max ${plan.window.maxMoves} moves)`}
        </div>
      )}

      {!plan && (
        <p className="text-sm text-[var(--muted)]">Sync and optimise first.</p>
      )}

      <div className="space-y-5">
        {plan?.teams.map((t) => (
          <div key={t.fantasyTeamId} className="rounded-lg border border-[var(--border)] bg-[var(--panel)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] p-4">
              <div>
                <span className="font-semibold">
                  Team {t.fantasyTeamId} · {t.name}
                </span>
                <span className="ml-2 rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  {MODE_LABEL[t.mode] ?? t.mode}
                </span>
                {t.realTeamName && (
                  <span className="ml-2 text-xs text-[var(--muted)]">↔ {t.realTeamName}</span>
                )}
              </div>
              {t.moves.length > 0 && (
                <div className="flex gap-4 text-sm tabular-nums">
                  <span>
                    <span className="text-[var(--muted)]">Moves </span>
                    {t.moveCount}
                  </span>
                  <span>
                    <span className="text-[var(--muted)]">Δcr </span>
                    <span className={t.creditDelta > 0 ? "text-amber-400" : ""}>
                      {t.creditDelta > 0 ? "+" : ""}
                      {t.creditDelta}
                    </span>
                  </span>
                  <span>
                    <span className="text-[var(--muted)]">Δproj </span>
                    <span className={t.projDelta >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {t.projDelta > 0 ? "+" : ""}
                      {t.projDelta}
                    </span>
                  </span>
                </div>
              )}
            </div>

            <p className="px-4 pt-3 text-xs text-[var(--muted)]">{t.note}</p>

            {t.moves.length > 0 && (
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-1.5 font-medium">Out</th>
                    <th className="px-2 py-1.5 font-medium">In</th>
                    <th className="px-2 py-1.5 text-right font-medium">Δcr</th>
                    <th className="px-2 py-1.5 text-right font-medium">Δproj</th>
                    <th className="px-4 py-1.5 text-right font-medium">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {t.moves.map((m, i) => (
                    <MoveRow key={m.id ?? i} m={m} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveRow({ m }: { m: TradeMove }) {
  return (
    <tr
      className={`border-t border-[var(--border)] ${m.applied ? "text-[var(--muted)] line-through" : ""}`}
    >
      <td className="px-4 py-1.5">
        {m.out ? (
          <>
            {m.out.name}{" "}
            <span className="text-[var(--muted)]">
              {m.out.position === "Head Coach" ? "HC" : m.out.position[0]} · {m.out.teamAbbr} ·{" "}
              {m.out.quotation.toFixed(1)}cr
            </span>
          </>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        {m.in ? (
          <>
            <span className="font-medium">{m.in.name}</span>{" "}
            <span className="text-[var(--muted)]">
              {m.in.position === "Head Coach" ? "HC" : m.in.position[0]} · {m.in.teamAbbr} ·{" "}
              {m.in.quotation.toFixed(1)}cr
            </span>
          </>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {m.creditDelta > 0 ? "+" : ""}
        {m.creditDelta.toFixed(1)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {m.projDelta > 0 ? "+" : ""}
        {m.projDelta.toFixed(1)}
      </td>
      <td className="px-4 py-1.5 text-right">
        {m.id != null && (
          <form action={setApplied} className="inline">
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="applied" value={(!m.applied).toString()} />
            <button
              className={`h-4 w-4 rounded border ${
                m.applied
                  ? "border-emerald-500 bg-emerald-500/30"
                  : "border-[var(--border)] hover:border-[var(--accent)]"
              }`}
              aria-label={m.applied ? "mark not done" : "mark done"}
            />
          </form>
        )}
      </td>
    </tr>
  );
}
