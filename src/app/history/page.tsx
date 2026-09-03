import { getHistory } from "@/lib/history";

import { Sparkline } from "./sparkline";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const history = await getHistory();
  const anyData = history.some((h) => h.points.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          One snapshot per sync. Rank, points and roster value over the season.
        </p>
      </div>

      {!anyData && (
        <p className="text-sm text-[var(--muted)]">
          Nothing yet — history fills in as you sync across matchdays.
        </p>
      )}

      <div className="space-y-4">
        {history.map((h) => (
          <div key={h.dunkestTeamId} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-semibold">{h.name}</span>
                {h.strategy && (
                  <span className="ml-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                    {h.strategy}
                  </span>
                )}
              </div>
              {h.latest && (
                <div className="flex gap-4 text-sm tabular-nums">
                  <span>
                    <span className="text-[var(--muted)]">Rank </span>
                    {h.latest.globalPosition ?? "—"}
                    {h.deltaPosition != null && h.deltaPosition !== 0 && (
                      <span
                        className={`ml-1 text-xs ${
                          h.deltaPosition < 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {h.deltaPosition < 0 ? "▲" : "▼"}
                        {Math.abs(h.deltaPosition)}
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="text-[var(--muted)]">Total </span>
                    {h.latest.totalPts ?? "—"}
                  </span>
                  <span>
                    <span className="text-[var(--muted)]">Value </span>
                    {h.latest.rosterValue ?? "—"}
                  </span>
                </div>
              )}
            </div>

            {h.points.length >= 2 && (
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <SparkCell label="Global rank (lower better)">
                  <Sparkline values={h.points.map((p) => p.globalPosition)} invert stroke="#5fb3ff" />
                </SparkCell>
                <SparkCell label="Total points">
                  <Sparkline values={h.points.map((p) => p.totalPts)} stroke="#5fd6a0" />
                </SparkCell>
                <SparkCell label="Roster value">
                  <Sparkline values={h.points.map((p) => p.rosterValue)} stroke="#d6a15f" />
                </SparkCell>
              </div>
            )}

            {h.points.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">MD</th>
                    <th className="px-2 py-1.5 text-right font-medium">Rank</th>
                    <th className="px-2 py-1.5 text-right font-medium">Round pts</th>
                    <th className="px-2 py-1.5 text-right font-medium">Total pts</th>
                    <th className="px-2 py-1.5 text-right font-medium">Value</th>
                    <th className="px-2 py-1.5 text-right font-medium">Synced</th>
                  </tr>
                </thead>
                <tbody>
                  {[...h.points].reverse().map((p) => (
                    <tr key={p.matchdayNumber} className="border-t border-[var(--border)]">
                      <td className="py-1.5 pr-2">{p.matchdayNumber}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{p.globalPosition ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{p.matchdayPts ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{p.totalPts ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{p.rosterValue ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right text-xs text-[var(--muted)]">
                        {new Date(p.capturedAt).toLocaleDateString()}
                      </td>
                    </tr>
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

function SparkCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
