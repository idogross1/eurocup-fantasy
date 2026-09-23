/**
 * The five legal starting-five shapes (G-F-C), with their Dunkest formation ids.
 *
 * Confirmed against the live API (`game_modes_configs`, 2026-09): a roster is
 * exactly 5 starters (100%) + 5 bench (50%) + 1 coach (100%) — there is no
 * separate "6th man" slot in this season's ruleset, despite the rules-doc text
 * mentioning one. The starters' G/F/C counts must exactly match one of these
 * five shapes.
 */

export type Comp = readonly [g: number, f: number, c: number];

export const FORMATIONS: { id: number; name: string; comp: Comp }[] = [
  { id: 27, name: "2-2-1", comp: [2, 2, 1] },
  { id: 29, name: "1-2-2", comp: [1, 2, 2] },
  { id: 28, name: "2-1-2", comp: [2, 1, 2] },
  { id: 30, name: "1-3-1", comp: [1, 3, 1] },
  { id: 31, name: "3-1-1", comp: [3, 1, 1] },
];

export type Pos = "Guard" | "Forward" | "Center";
const POS_INDEX: Record<Pos, 0 | 1 | 2> = { Guard: 0, Forward: 1, Center: 2 };

/** Which FORMATIONS entry (if any) a set of 5 starters' positions matches. */
export function matchFormation<T extends { position: Pos }>(
  starters: T[],
): { id: number; name: string } | null {
  if (starters.length !== 5) return null;
  const comp: [number, number, number] = [0, 0, 0];
  for (const s of starters) comp[POS_INDEX[s.position]]++;
  const match = FORMATIONS.find(
    (f) => f.comp[0] === comp[0] && f.comp[1] === comp[1] && f.comp[2] === comp[2],
  );
  return match ? { id: match.id, name: match.name } : null;
}
