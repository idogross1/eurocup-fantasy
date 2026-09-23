import { solve } from "yalps";

import { FORMATIONS, type Pos } from "./formations";
import type { OptimizerPlayer, RosterPlayer, StrategySpec, TeamResult } from "./types";

const POSITION_COUNTS = { Guard: 4, Forward: 4, Center: 2 } as const;

/**
 * Tiny reward per credit spent on a roster player. Far too small to override a
 * real projection gap, but among near-equal rosters it prefers the one that
 * uses the budget (leftover credits are dead weight).
 */
const BUDGET_NUDGE = 0.003;

export type SolveOptions = {
  excludeIds?: Set<number>;
  lockIds?: Set<number>;
  boostById?: Map<number, number>; // playerId -> pct (-50..50)
  overlapGroups?: { label: string; ids: Set<number>; cap: number }[];
  contrarianWeight?: number;
  timeoutMs?: number;
  /** keep at least (|anchor ∩ pool| − maxChanges) of these players (trade cap) */
  anchor?: { ids: Set<number>; maxChanges: number };
  /**
   * Soft penalty (points per missing slot) for having fewer than `minPerTurn`
   * outfield players with a game on a given turn/game-day. Keeps the roster from
   * being packed onto one day so you can field a legal five every turn.
   */
  turnBalancePenalty?: number;
  minPerTurn?: number;
};

/** Per-player value the optimizer maximizes, given the team's strategy. */
export function playerValue(
  p: OptimizerPlayer,
  spec: StrategySpec,
  contrarianWeight: number,
  boostPct = 0,
): number {
  const isCoach = p.position === "Head Coach";
  let v: number;
  switch (spec.strategy) {
    case "safe":
      v = p.mean - spec.riskK * p.sigma;
      break;
    case "aggressive":
      v = p.mean + spec.riskK * p.sigma - contrarianWeight * p.popularity;
      break;
    default:
      v = p.mean;
  }
  v = v * (1 + boostPct / 100);
  if (!isCoach) v = Math.max(0, v);
  return v;
}

export function solveTeam(
  players: OptimizerPlayer[],
  spec: StrategySpec,
  opts: SolveOptions = {},
): TeamResult {
  const contrarianWeight = opts.contrarianWeight ?? 0;
  const exclude = opts.excludeIds ?? new Set<number>();
  const lock = opts.lockIds ?? new Set<number>();

  const pool = players.filter((p) => !exclude.has(p.id) || lock.has(p.id));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const valueById = new Map(
    pool.map((p) => [p.id, playerValue(p, spec, contrarianWeight, opts.boostById?.get(p.id) ?? 0)]),
  );

  const nonCoach = pool.filter((p) => p.position !== "Head Coach");
  const coaches = pool.filter((p) => p.position === "Head Coach");

  // Roster is exactly 5 starters (100%) + 5 bench (50%) + 1 coach (100%) — see
  // formations.ts. The starters' G/F/C counts must match one of the 5 legal
  // formations exactly, via the starter{Pos}Link constraints below.
  const constraints: Record<string, { equal?: number; max?: number; min?: number }> = {
    guards: { equal: POSITION_COUNTS.Guard },
    forwards: { equal: POSITION_COUNTS.Forward },
    centers: { equal: POSITION_COUNTS.Center },
    coaches: { equal: 1 },
    budget: { max: spec.budget },
    benchCount: { equal: 5 },
    capCount: { equal: 1 },
    formationCompCount: { equal: 1 },
    starterGuardLink: { equal: 0 },
    starterForwardLink: { equal: 0 },
    starterCenterLink: { equal: 0 },
  };

  const anchorIds = opts.anchor?.ids ?? new Set<number>();
  if (opts.anchor) {
    const present = [...anchorIds].filter((id) => byId.has(id)).length;
    constraints.anchorKeep = { min: Math.max(0, present - opts.anchor.maxChanges) };
  }

  const variables: Record<string, Record<string, number>> = {};
  const binaries: string[] = [];

  const posConstraint: Record<Pos, string> = {
    Guard: "guards",
    Forward: "forwards",
    Center: "centers",
  };
  const starterLinkName: Record<Pos, string> = {
    Guard: "starterGuardLink",
    Forward: "starterForwardLink",
    Center: "starterCenterLink",
  };

  // real-team caps (<= 6 per real EuroCup team)
  const teamsInPool = new Set(pool.map((p) => p.teamAbbr));
  for (const t of teamsInPool) constraints[`team_${t}`] = { max: 6 };

  // overlap caps vs previously solved teams
  for (const g of opts.overlapGroups ?? []) {
    constraints[`overlap_${g.label}`] = { max: g.cap };
  }

  // turn balance: soft floor of `minPerTurn` outfield players per game-day.
  // `turnShort_t` slack absorbs any shortfall and is penalised in the objective.
  const turnPenalty = opts.turnBalancePenalty ?? 0;
  const minPerTurn = opts.minPerTurn ?? 5;
  const turnsInPool = [...new Set(nonCoach.map((p) => p.turn).filter((t): t is number => t != null))];
  const applyTurnBalance = turnPenalty > 0 && turnsInPool.length >= 2;
  if (applyTurnBalance) {
    for (const t of turnsInPool) {
      const available = nonCoach.filter((p) => p.turn === t).length;
      constraints[`turn_${t}`] = { min: Math.min(minPerTurn, available) };
      variables[`turnShort_${t}`] = { score: -turnPenalty, [`turn_${t}`]: 1 };
      // continuous slack in [0, minPerTurn] — not a binary
    }
  }

  for (const p of nonCoach) {
    const xName = `x_${p.id}`;
    const benchName = `bench_${p.id}`;
    const capName = `cap_${p.id}`;
    const value = valueById.get(p.id) ?? 0;
    const linkName = starterLinkName[p.position as Pos];

    // x: on roster. A tiny deterministic tie-breaker on the roster coefficient
    // gives the LP a unique optimum — dozens of players share an identical
    // price/projection preseason, and that symmetry stalls branch & cut.
    const xVar: Record<string, number> = {
      score: value + tieBreak(p.id) + BUDGET_NUDGE * p.quotation,
      [posConstraint[p.position as Pos]]: 1,
      budget: p.quotation,
      [`team_${p.teamAbbr}`]: 1,
      [`linkBench_${p.id}`]: -1,
      [`linkCap_${p.id}`]: -1,
      // contributes to the chosen formation's position count unless benched
      [linkName]: 1,
    };
    for (const g of opts.overlapGroups ?? []) {
      if (g.ids.has(p.id)) xVar[`overlap_${g.label}`] = 1;
    }
    if (anchorIds.has(p.id)) xVar.anchorKeep = 1;
    if (applyTurnBalance && p.turn != null) xVar[`turn_${p.turn}`] = 1;
    if (lock.has(p.id)) {
      constraints[`lock_${p.id}`] = { equal: 1 };
      xVar[`lock_${p.id}`] = 1;
    }
    variables[xName] = xVar;
    binaries.push(xName);

    // bench: 50% weight (subtract half the value); must be on roster
    constraints[`linkBench_${p.id}`] = { max: 0 };
    variables[benchName] = {
      score: -0.5 * value,
      benchCount: 1,
      [`linkBench_${p.id}`]: 1,
      [`linkCap_${p.id}`]: 1, // captain must not be benched: cap - x + bench <= 0
      [linkName]: -1, // cancel the x contribution: a benched player isn't a starter
    };
    binaries.push(benchName);

    // captain: +1x extra value; must be a starter (non-bench roster player)
    constraints[`linkCap_${p.id}`] = { max: 0 };
    variables[capName] = {
      score: value,
      capCount: 1,
      [`linkCap_${p.id}`]: 1,
    };
    binaries.push(capName);
  }

  // formation selector — choose exactly one of the 5 legal starter shapes
  FORMATIONS.forEach((f, k) => {
    variables[`formationComp_${k}`] = {
      formationCompCount: 1,
      starterGuardLink: -f.comp[0],
      starterForwardLink: -f.comp[1],
      starterCenterLink: -f.comp[2],
    };
    binaries.push(`formationComp_${k}`);
  });

  for (const p of coaches) {
    const xName = `x_${p.id}`;
    const value = valueById.get(p.id) ?? 0;
    const xVar: Record<string, number> = {
      score: value + BUDGET_NUDGE * p.quotation,
      coaches: 1,
      budget: p.quotation,
      [`team_${p.teamAbbr}`]: 1,
    };
    for (const g of opts.overlapGroups ?? []) {
      if (g.ids.has(p.id)) xVar[`overlap_${g.label}`] = 1;
    }
    if (anchorIds.has(p.id)) xVar.anchorKeep = 1;
    if (lock.has(p.id)) {
      constraints[`lock_${p.id}`] = { equal: 1 };
      xVar[`lock_${p.id}`] = 1;
    }
    variables[xName] = xVar;
    binaries.push(xName);
  }

  // MILP with ~250 binaries and heavy price symmetry in the preseason pool.
  // Branch & cut can crawl on the floor objective for some leagues, so accept a
  // solution within `tolerance` of the LP optimum and loosen it on a timeout —
  // a few % of ~200 projected points is imperceptible, and the integer gap
  // between candidate rosters is far smaller than that in practice.
  const model = {
    direction: "maximize" as const,
    objective: "score",
    constraints,
    variables,
    binaries,
  };
  const budget = opts.timeoutMs ?? 15_000;
  let solution = solve(model, {
    tolerance: 0.02,
    maxIterations: 500_000,
    maxPivots: 100_000,
    timeout: budget,
  });
  for (const tol of [0.06, 0.15]) {
    if (solution.status === "optimal") break;
    solution = solve(model, {
      tolerance: tol,
      maxIterations: 500_000,
      maxPivots: 100_000,
      timeout: budget,
    });
  }

  if (solution.status !== "optimal") {
    return {
      spec,
      status: solution.status,
      players: [],
      formationId: null,
      formationName: null,
      captainId: null,
      creditsUsed: 0,
      strategyScore: 0,
      projPoints: 0,
    };
  }

  const picked = new Set<number>();
  const benched = new Set<number>();
  let captainId: number | null = null;
  let formationK: number | null = null;
  for (const [name, val] of solution.variables) {
    if (val < 0.5) continue;
    if (name.startsWith("formationComp_")) {
      formationK = Number(name.slice("formationComp_".length));
      continue;
    }
    const id = Number(name.slice(name.indexOf("_") + 1));
    if (name.startsWith("x_")) picked.add(id);
    else if (name.startsWith("bench_")) benched.add(id);
    else if (name.startsWith("cap_")) captainId = id;
  }
  const formation = formationK != null ? FORMATIONS[formationK] : null;

  const rosterPlayers = [...picked].map((id) => byId.get(id)!).filter(Boolean);

  const rows: RosterPlayer[] = rosterPlayers.map((p) => {
    const slot: RosterPlayer["slot"] =
      p.position === "Head Coach" ? "coach" : benched.has(p.id) ? "bench" : "starter";
    const isCaptain = p.id === captainId;
    const weight = slot === "bench" ? 0.5 : 1;
    const capMult = isCaptain ? 2 : 1;
    return {
      ...p,
      slot,
      isCaptain,
      value: valueById.get(p.id) ?? 0,
      weightedMean: p.mean * weight * capMult,
    };
  });

  const creditsUsed = rosterPlayers.reduce((s, p) => s + p.quotation, 0);
  const projPoints = rows.reduce((s, r) => s + r.weightedMean, 0);

  return {
    spec,
    status: "optimal",
    players: rows.sort(bySlotThenValue),
    formationId: formation?.id ?? null,
    formationName: formation?.name ?? null,
    captainId,
    creditsUsed: Math.round(creditsUsed * 10) / 10,
    strategyScore: Math.round(solution.result * 100) / 100,
    projPoints: Math.round(projPoints * 100) / 100,
  };
}

/** deterministic pseudo-random offset in [0, 1e-3) — negligible vs real values */
function tieBreak(id: number): number {
  return (((id * 2654435761) >>> 0) % 100000) / 1e8;
}

const SLOT_ORDER = { coach: 0, starter: 1, bench: 2 } as const;
function bySlotThenValue(a: RosterPlayer, b: RosterPlayer): number {
  if (a.slot !== b.slot) return SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];
  return b.mean - a.mean;
}
