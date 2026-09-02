/**
 * Trade-window guidance. Advisory only — the app never blocks a move, it just
 * tells you what the game will allow. Rules (2026-27 regular season):
 *  - Normal window: opens between rounds, up to 4 moves/round (coach counts).
 *  - Unlimited windows after R6/R13/R18/R23/R28/R34 (date ranges below).
 *  - Trades are locked once a round is underway.
 * Post-season (Play-In / Playoffs / Final Four): unlimited every round.
 */

export type WindowStatus = {
  label: string;
  maxMoves: number | "unlimited";
  locked: boolean;
  note: string;
};

const UNLIMITED_WINDOWS: { afterRound: number; from: string; to: string }[] = [
  { afterRound: 6, from: "2026-10-16", to: "2026-10-21" },
  { afterRound: 13, from: "2026-11-21", to: "2026-11-24" },
  { afterRound: 18, from: "2026-12-19", to: "2026-12-22" },
  { afterRound: 23, from: "2027-01-16", to: "2027-01-21" },
  { afterRound: 28, from: "2027-02-13", to: "2027-03-04" },
  { afterRound: 34, from: "2027-03-27", to: "2027-03-31" },
];

export function tradeWindowStatus(
  round: { number: number | null; startedAt: string | null } | null,
  now = new Date(),
): WindowStatus {
  const today = now.toISOString().slice(0, 10);
  const unlimited = UNLIMITED_WINDOWS.find((w) => today >= w.from && today <= w.to);
  if (unlimited) {
    return {
      label: `Unlimited window (after R${unlimited.afterRound})`,
      maxMoves: "unlimited",
      locked: false,
      note: `Open ${unlimited.from} → ${unlimited.to}. Trade freely.`,
    };
  }

  const started = round?.startedAt ? new Date(round.startedAt) : null;
  if (started && now >= started) {
    return {
      label: `Round ${round?.number ?? "?"} in progress`,
      maxMoves: 4,
      locked: true,
      note: "Trades are locked mid-round. Plan them, apply once the round ends.",
    };
  }

  return {
    label: round?.number ? `Pre-round ${round.number} window` : "Between rounds",
    maxMoves: 4,
    locked: false,
    note: "Up to 4 moves this round (the head coach counts as one).",
  };
}
