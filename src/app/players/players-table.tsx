"use client";

import { useMemo, useState } from "react";

import type { PlayerRow } from "@/lib/players";

import { clearFlags, setBoost, toggleFlag } from "./actions";

type SortKey =
  | "name"
  | "position"
  | "teamAbbr"
  | "quotation"
  | "avgPts"
  | "popularity"
  | "opponentAbbr"
  | "projMean"
  | "projFloor"
  | "projCeiling"
  | "projValue";

const NUMERIC_NULLABLE: SortKey[] = ["projMean", "projFloor", "projCeiling", "projValue"];

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
  const [sortKey, setSortKey] = useState<SortKey>("projMean");
  const [asc, setAsc] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const isFlagged = (p: PlayerRow) =>
    p.flagLock || p.flagExclude || p.flagBoostPct !== 0 || p.flagInjuryOverride != null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = players.filter((p) => {
      if (position !== "All" && p.position !== position) return false;
      if (flaggedOnly && !isFlagged(p)) return false;
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
        default: {
          if (NUMERIC_NULLABLE.includes(sortKey)) {
            const av = a[sortKey] as number | null;
            const bv = b[sortKey] as number | null;
            if (av == null && bv == null) return 0;
            if (av == null) return 1; // nulls always last
            if (bv == null) return -1;
            return dir * (av - bv);
          }
          return dir * ((a[sortKey] as number) - (b[sortKey] as number));
        }
      }
    });
    return out;
  }, [players, query, position, sortKey, asc, flaggedOnly]);

  const flaggedCount = players.filter(isFlagged).length;

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
        <button
          onClick={() => setFlaggedOnly((v) => !v)}
          disabled={flaggedCount === 0}
          className={`rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-40 ${
            flaggedOnly
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]"
              : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          Flagged{flaggedCount ? ` (${flaggedCount})` : ""}
        </button>
        <span className="ml-auto text-xs text-[var(--muted)]">{rows.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[1080px] text-sm">
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
              <Th
                onClick={() => toggleSort("projMean")}
                active={sortKey === "projMean"}
                asc={asc}
                right
              >
                Proj
              </Th>
              <Th
                onClick={() => toggleSort("projFloor")}
                active={sortKey === "projFloor"}
                asc={asc}
                right
              >
                Floor
              </Th>
              <Th
                onClick={() => toggleSort("projCeiling")}
                active={sortKey === "projCeiling"}
                asc={asc}
                right
              >
                Ceil
              </Th>
              <Th
                onClick={() => toggleSort("projValue")}
                active={sortKey === "projValue"}
                asc={asc}
                right
              >
                Val
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
              <th className="px-3 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="border-t border-[var(--border)] hover:bg-[var(--panel)]/60"
              >
                <td className="px-3 py-2">
                  <span
                    className={`font-medium ${
                      p.flagExclude || p.flagInjuryOverride === "out"
                        ? "text-[var(--muted)] line-through"
                        : ""
                    }`}
                  >
                    {p.firstName} {p.lastName}
                  </span>
                  {p.flagInjuryOverride === "out" && (
                    <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                      OUT
                    </span>
                  )}
                  {p.isInjured && (
                    <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                      INJ
                    </span>
                  )}
                  {p.flagLock && (
                    <span className="ml-2 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                      LOCK
                    </span>
                  )}
                  {p.flagBoostPct !== 0 && (
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        p.flagBoostPct > 0
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {p.flagBoostPct > 0 ? "+" : ""}
                      {p.flagBoostPct}%
                    </span>
                  )}
                  {p.probabilityOfPlaying < 1 && !p.isInjured && p.flagInjuryOverride !== "out" && (
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
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {p.projMean != null ? p.projMean.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                  {p.projFloor != null ? p.projFloor.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                  {p.projCeiling != null ? p.projCeiling.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                  {p.projValue != null ? p.projValue.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                  {p.avgPts ? p.avgPts.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                  {p.popularity ? `${p.popularity.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {p.opponentAbbr ? `${p.opponentAbbr}${p.roundNumber ? ` (R${p.roundNumber})` : ""}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <FlagControls p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlagBtn({
  action,
  playerId,
  field,
  on,
  active,
  title,
  children,
  danger,
}: {
  action: (fd: FormData) => void;
  playerId: number;
  field: string;
  on: boolean;
  active: boolean;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="on" value={String(on)} />
      <button
        title={title}
        className={`h-6 min-w-6 rounded border px-1 text-[11px] font-medium ${
          active
            ? danger
              ? "border-red-500 bg-red-500/20 text-red-300"
              : "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
            : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
        }`}
      >
        {children}
      </button>
    </form>
  );
}

function FlagControls({ p }: { p: PlayerRow }) {
  const anyFlag =
    p.flagLock || p.flagExclude || p.flagBoostPct !== 0 || p.flagInjuryOverride != null;
  return (
    <div className="flex items-center gap-1">
      <FlagBtn
        action={toggleFlag}
        playerId={p.id}
        field="out"
        on={p.flagInjuryOverride !== "out"}
        active={p.flagInjuryOverride === "out"}
        title="Injured / out — projection zeroed, optimiser skips"
        danger
      >
        Out
      </FlagBtn>
      <FlagBtn
        action={toggleFlag}
        playerId={p.id}
        field="exclude"
        on={!p.flagExclude}
        active={p.flagExclude}
        title="Exclude from all rosters"
      >
        ✕
      </FlagBtn>
      <FlagBtn
        action={toggleFlag}
        playerId={p.id}
        field="lock"
        on={!p.flagLock}
        active={p.flagLock}
        title="Lock into the roster"
      >
        🔒
      </FlagBtn>
      <form action={setBoost} className="inline">
        <input type="hidden" name="playerId" value={p.id} />
        <input type="hidden" name="pct" value={Math.max(-50, p.flagBoostPct - 10)} />
        <button
          title="Fade projection −10%"
          className="h-6 w-6 rounded border border-[var(--border)] bg-[var(--panel-2)] text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
        >
          −
        </button>
      </form>
      <form action={setBoost} className="inline">
        <input type="hidden" name="playerId" value={p.id} />
        <input type="hidden" name="pct" value={Math.min(50, p.flagBoostPct + 10)} />
        <button
          title="Boost projection +10%"
          className="h-6 w-6 rounded border border-[var(--border)] bg-[var(--panel-2)] text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
        >
          +
        </button>
      </form>
      {anyFlag && (
        <form action={clearFlags} className="inline">
          <input type="hidden" name="playerId" value={p.id} />
          <button
            title="Clear all flags for this player"
            className="h-6 w-6 rounded border border-transparent text-[11px] text-[var(--muted)] hover:text-red-400"
          >
            ⟲
          </button>
        </form>
      )}
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
