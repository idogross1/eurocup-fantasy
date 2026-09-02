/**
 * Pure projection math — no DB, no I/O. Given a player's price / form / matchup,
 * produce expected fantasy points (`mean`), spread (`sigma`), and floor/ceiling.
 *
 * Starting point is price-only (preseason: avg_pts is 0 for everyone). Once real
 * scoring exists, `statsBlend` mixes the season EWMA average into the base.
 */

import type { PlayerPosition } from "@/db/schema";

export type ModelParams = {
  /** base points = priceCoef * quotation ^ priceExpo (non-coach players) */
  priceCoef: number;
  priceExpo: number;
  /** per-position multiplier on the price-curve mean */
  positionMeanMult: Record<PlayerPosition, number>;
  /** 0 = ignore real avg_pts, 1 = use it fully (when > 0) */
  statsBlend: number;
  /** coefficient of variation for sigma, before tier adjustments */
  baseCv: number;
  positionCvAdj: Record<PlayerPosition, number>;
  /** CV bumps by price tier (uncertain minutes / role) */
  cheapCvAdj: number; // quotation < cheapMax
  midCvAdj: number; // midMin <= quotation <= midMax
  expensiveCvAdj: number; // quotation > expensiveMin
  cheapMax: number;
  midMin: number;
  midMax: number;
  expensiveMin: number;
  cvClamp: [number, number];
  /** z-score for floor/ceiling bands */
  bandZ: number;
  /** coach model */
  coachStrengthTopN: number; // team strength = sum of top-N player quotations
  coachMarginPerStrength: number; // E[margin] = k * (teamStrength - oppStrength)
  coachMarginSd: number;
};

export const DEFAULT_MODEL_PARAMS: ModelParams = {
  priceCoef: 1.255,
  priceExpo: 1.15,
  positionMeanMult: { Guard: 1, Forward: 1, Center: 1, "Head Coach": 1 },
  statsBlend: 0,
  baseCv: 0.42,
  positionCvAdj: { Guard: 0.05, Forward: 0, Center: -0.04, "Head Coach": 0 },
  cheapCvAdj: 0.06,
  midCvAdj: 0.04,
  expensiveCvAdj: -0.03,
  cheapMax: 7,
  midMin: 9,
  midMax: 13,
  expensiveMin: 14,
  cvClamp: [0.25, 0.7],
  bandZ: 1.0,
  coachStrengthTopN: 8,
  coachMarginPerStrength: 0.5,
  coachMarginSd: 12,
};

// --- normal distribution helpers ---------------------------------------------

/** Abramowitz & Stegun 7.1.26 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** standard normal CDF */
export function normalCdf(x: number, mu = 0, sd = 1): number {
  return 0.5 * (1 + erf((x - mu) / (sd * Math.SQRT2)));
}

// --- component models -------------------------------------------------------

export function priceCurvePoints(
  quotation: number,
  position: PlayerPosition,
  avgPts: number,
  p: ModelParams,
): number {
  const curve = p.priceCoef * Math.pow(Math.max(quotation, 0), p.priceExpo);
  const blended =
    avgPts > 0 ? (1 - p.statsBlend) * curve + p.statsBlend * avgPts : curve;
  return blended * (p.positionMeanMult[position] ?? 1);
}

export function cvFor(quotation: number, position: PlayerPosition, p: ModelParams): number {
  let cv = p.baseCv + (p.positionCvAdj[position] ?? 0);
  if (quotation < p.cheapMax) cv += p.cheapCvAdj;
  else if (quotation >= p.midMin && quotation <= p.midMax) cv += p.midCvAdj;
  else if (quotation > p.expensiveMin) cv += p.expensiveCvAdj;
  return Math.min(p.cvClamp[1], Math.max(p.cvClamp[0], cv));
}

const COACH_BINS: { lo: number; hi: number; pts: number }[] = [
  { lo: 20, hi: Infinity, pts: 25 }, // win 20+
  { lo: 10, hi: 20, pts: 20 }, // win 11-20
  { lo: 0, hi: 10, pts: 10 }, // win 1-10 / OT
  { lo: -10, hi: 0, pts: -5 }, // loss 1-10 / OT
  { lo: -20, hi: -10, pts: -10 }, // loss 11-20
  { lo: -Infinity, hi: -20, pts: -20 }, // loss 20+
];

/** Expected coach points + sigma from team-vs-opponent strength. */
export function coachProjection(
  teamStrength: number,
  oppStrength: number,
  p: ModelParams,
): { mean: number; sigma: number; pWin: number } {
  const mu = p.coachMarginPerStrength * (teamStrength - oppStrength);
  const sd = p.coachMarginSd;
  let e = 0;
  let e2 = 0;
  for (const b of COACH_BINS) {
    const prob =
      (b.hi === Infinity ? 1 : normalCdf(b.hi, mu, sd)) -
      (b.lo === -Infinity ? 0 : normalCdf(b.lo, mu, sd));
    e += prob * b.pts;
    e2 += prob * b.pts * b.pts;
  }
  const variance = Math.max(0, e2 - e * e);
  return { mean: e, sigma: Math.sqrt(variance), pWin: 1 - normalCdf(0, mu, sd) };
}

// --- availability + bands ---------------------------------------------------

/**
 * Fold in play probability. Points ~ Bernoulli(available) * Normal(m, s), so:
 *   E  = A·m
 *   Var = A·s² + A·(1−A)·m²
 */
export function applyAvailability(
  fullMean: number,
  fullSigma: number,
  available: number,
): { mean: number; sigma: number } {
  const a = Math.min(1, Math.max(0, available));
  const mean = a * fullMean;
  const variance = a * fullSigma * fullSigma + a * (1 - a) * fullMean * fullMean;
  return { mean, sigma: Math.sqrt(Math.max(0, variance)) };
}

export function bands(
  mean: number,
  sigma: number,
  z: number,
  allowNegativeFloor: boolean,
): { floor: number; ceiling: number } {
  const floor = mean - z * sigma;
  return {
    floor: allowNegativeFloor ? floor : Math.max(0, floor),
    ceiling: mean + z * sigma,
  };
}

// --- top-level per-player projection --------------------------------------

export type ProjectionInput = {
  position: PlayerPosition;
  quotation: number;
  avgPts: number;
  isInjured: boolean;
  probabilityOfPlaying: number;
  injuryOverride?: "out" | "ok" | null;
  /** required for Head Coach */
  teamStrength?: number;
  oppStrength?: number;
};

export type ProjectionResult = {
  mean: number;
  sigma: number;
  floor: number;
  ceiling: number;
  model: string;
};

export function projectPlayer(input: ProjectionInput, p: ModelParams): ProjectionResult {
  const isCoach = input.position === "Head Coach";

  let fullMean: number;
  let fullSigma: number;
  let model: string;

  if (isCoach) {
    const ts = input.teamStrength ?? 0;
    const os = input.oppStrength ?? 0;
    if (!ts || !os) {
      return { mean: 0, sigma: 0, floor: 0, ceiling: 0, model: "coach:no-matchup" };
    }
    const c = coachProjection(ts, os, p);
    fullMean = c.mean;
    fullSigma = c.sigma;
    model = "coach:strength-v1";
  } else {
    fullMean = priceCurvePoints(input.quotation, input.position, input.avgPts, p);
    fullSigma = cvFor(input.quotation, input.position, p) * fullMean;
    model = input.avgPts > 0 ? "price+stats-v1" : "price-v1";
  }

  // availability
  let available = input.probabilityOfPlaying;
  if (input.injuryOverride === "out") available = 0;
  else if (input.injuryOverride === "ok") available = 1;
  else if (input.isInjured) available = 0;

  const adj = applyAvailability(fullMean, fullSigma, available);
  const b = bands(adj.mean, adj.sigma, p.bandZ, isCoach);

  return {
    mean: round2(adj.mean),
    sigma: round2(adj.sigma),
    floor: round2(b.floor),
    ceiling: round2(b.ceiling),
    model,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
