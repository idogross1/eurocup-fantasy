/**
 * Starting-five formations and the "non-bench composition" logic the optimizer
 * relies on.
 *
 * Scoring only distinguishes 100% (starting 5 + 6th man + coach) from 50%
 * (the other 4). So the optimizer never needs to pick the exact starting five —
 * it only picks which 4 non-coach players sit at 50% ("bench"). The remaining 6
 * are the non-bench pool; the concrete legal formation is seated afterwards by
 * choosing which non-bench player is the 6th man.
 */

export type Comp = readonly [g: number, f: number, c: number];

/** The five legal starting-five shapes, G-F-C, with their Dunkest formation ids. */
export const FORMATIONS: { id: number; name: string; comp: Comp }[] = [
  { id: 27, name: "2-2-1", comp: [2, 2, 1] },
  { id: 29, name: "1-2-2", comp: [1, 2, 2] },
  { id: 28, name: "2-1-2", comp: [2, 1, 2] },
  { id: 30, name: "1-3-1", comp: [1, 3, 1] },
  { id: 31, name: "3-1-1", comp: [3, 1, 1] },
];

const ROSTER_COMP: Comp = [4, 4, 2];

/**
 * Non-bench compositions (6 non-coach players) from which *some* legal starting
 * five can be formed by dropping one player as the 6th man. Derived as
 * {formation + one unit vector}, filtered to the 4-4-2 roster ceiling.
 */
export const NON_BENCH_COMPS: Comp[] = (() => {
  const set = new Set<string>();
  const out: Comp[] = [];
  for (const { comp } of FORMATIONS) {
    for (const unit of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as const) {
      const nb: Comp = [comp[0] + unit[0], comp[1] + unit[1], comp[2] + unit[2]];
      if (nb[0] > ROSTER_COMP[0] || nb[1] > ROSTER_COMP[1] || nb[2] > ROSTER_COMP[2]) continue;
      const key = nb.join(",");
      if (!set.has(key)) {
        set.add(key);
        out.push(nb);
      }
    }
  }
  return out;
})();

/** Bench composition implied by a non-bench composition (roster 4-4-2 minus it). */
export function benchComp(nb: Comp): Comp {
  return [ROSTER_COMP[0] - nb[0], ROSTER_COMP[1] - nb[1], ROSTER_COMP[2] - nb[2]];
}

export type Pos = "Guard" | "Forward" | "Center";
const POS_INDEX: Record<Pos, 0 | 1 | 2> = { Guard: 0, Forward: 1, Center: 2 };

/**
 * Given the 6 non-bench non-coach players and the chosen captain, find a legal
 * formation: pick a 6th man (non-captain) so the remaining five match one of
 * FORMATIONS. Returns the formation + which players start / are 6th man.
 */
export function seatLineup<T extends { id: number; position: Pos; mean: number }>(
  nonBench: T[],
  captainId: number,
): { formationId: number; formationName: string; starters: T[]; sixthMan: T } | null {
  if (nonBench.length !== 6) return null;
  // Try making the weakest player the 6th man first, so the starting five is
  // the strongest legal set (cosmetic — 6th man also scores 100%).
  const candidates = [...nonBench].sort((a, b) => a.mean - b.mean);
  for (const candidate of candidates) {
    if (candidate.id === captainId) continue;
    const starters = nonBench.filter((p) => p.id !== candidate.id);
    const comp: [number, number, number] = [0, 0, 0];
    for (const s of starters) comp[POS_INDEX[s.position]]++;
    const match = FORMATIONS.find(
      (f) => f.comp[0] === comp[0] && f.comp[1] === comp[1] && f.comp[2] === comp[2],
    );
    if (match) {
      return {
        formationId: match.id,
        formationName: match.name,
        starters,
        sixthMan: candidate,
      };
    }
  }
  return null;
}
