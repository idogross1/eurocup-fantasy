"use client";

import { useMemo, useState } from "react";

import type { PlayerRow } from "@/lib/players";

type SortKey =
  | "name"
  | "position"
  | "teamAbbr"
  | "quotation"
  | "avgPts"
  | "popularity"
  | "opponentAbbr";

const POSITIONS = ["All", "Guard", "Forward", "Center", "Head Coach"] as const;

const POSITION_ORDER: Record<string, number> = {
  Guard: 0,
  Forward: 1,
  Center: 2,
  "Head Coach": 3,
};

export function PlayersTable({ players }: { players: PlayerRow[] }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("quotation");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = players.filter((p) => {
      if (position !== "All" && p.position !== position) return false;
      if (!q) return true;
      return (
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.teamName.toLowerCase().includes(q) ||
        p.teamAbbr.toLowerCase().includes(q)
      );
    });
    out = [...out].sort((a, b) => {
      const dir = asc ? 1 : -1;
      switch (sortKey) {
        case "name":
          return dir * `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
        case "position":
          return dir * ((POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9));
        case "teamAbbr":
          return dir * a.teamAbbr.localeCompare(b.teamAbbr);
        case "opponentAbbr":
          return dir * (a.opponentAbbr ?? "").localeCompare(b.opponentAbbr ?? "");
        default:
          return dir * ((a[sortKey] as number) - (b[sortKey] as number));
      }
    });
    return out;
  }, [players, query, position, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc((v) => !v);
    } else {
      setSortKey(key);
      setAsc(key === "name" || key === "teamAbbr" || key === "position" || key === "opponentAbbr");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player or team…"
          className="w-64 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
        />
        <div className="flex gap-1">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPosition(p)}
              className={`rounded-md border px-2.5 py-1.5 text-xs ${
                position === p
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]"
                  : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[var(--muted)]">{rows.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <Th onClick={() => toggleSort("name")} active={sortKey === "name"} asc={asc}>
                Player
              </Th>
              <Th onClick={() => toggleSort("position")} active={sortKey === "position"} asc={asc}>
                Pos
              </Th>
              <Th onClick={() => toggleSort("teamAbbr")} active={sortKey === "teamAbbr"} asc={asc}>
                Team
              </Th>
              <Th
                onClick={() => toggleSort("quotation")}
                active={sortKey === "quotation"}
                asc={asc}
                right
              >
                Price
              </Th>
              <Th onClick={() => toggleSort("avgPts")} active={sortKey === "avgPts"} asc={asc} right>
                Avg Pts
              </Th>
              <Th
                onClick={() => toggleSort("popularity")}
                active={sortKey === "popularity"}
                asc={asc}
                right
              >
                Own %
              </Th>
              <Th
                onClick={() => toggleSort("opponentAbbr")}
                active={sortKey === "opponentAbbr"}
                asc={asc}
              >
                Opp (R)
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="border-t border-[var(--border)] hover:bg-[var(--panel)]/60"
              >
                <td className="px-3 py-2">
                  <span className="font-medium">
                    {p.firstName} {p.lastName}
                  </span>
                  {p.isInjured && (
                    <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                      INJ
                    </span>
                  )}
                  {p.probabilityOfPlaying < 1 && !p.isInjured && (
                    <span className="ml-2 text-[11px] text-amber-400">
                      {Math.round(p.probabilityOfPlaying * 100)}%
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">{p.position}</td>
                <td className="px-3 py-2">
                  <span title={p.teamName}>{p.teamAbbr}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{p.quotation.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                  {p.avgPts ? p.avgPts.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                  {p.popularity ? `${p.popularity.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {p.opponentAbbr ? `${p.opponentAbbr}${p.roundNumber ? ` (R${p.roundNumber})` : ""}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  asc,
  right,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  asc: boolean;
  right?: boolean;
}) {
  return (
    <th className={`px-3 py-2 font-medium ${right ? "text-right" : ""}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-[var(--text)] ${
          active ? "text-[var(--text)]" : ""
        }`}
      >
        {children}
        <span className="text-[10px]">{active ? (asc ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}
