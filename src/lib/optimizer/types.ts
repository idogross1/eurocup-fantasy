import type { PlayerPosition, TeamStrategy } from "@/db/schema";

export type OptimizerPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  position: PlayerPosition;
  teamAbbr: string;
  quotation: number;
  mean: number;
  sigma: number;
  popularity: number;
  opponentAbbr: string | null;
  /** which turn (game day) of the round this player's club plays; null if unknown */
  turn: number | null;
};

export type StrategySpec = {
  teamId: number;
  name: string;
  strategy: TeamStrategy;
  budget: number;
  riskK: number;
};

export type RosterPlayer = OptimizerPlayer & {
  slot: "starter" | "sixth" | "bench" | "coach";
  isCaptain: boolean;
  /** strategy value used by the optimizer for this player */
  value: number;
  /** contribution to the team's weighted projected points (mean-based) */
  weightedMean: number;
};

export type TeamResult = {
  spec: StrategySpec;
  status: "optimal" | "infeasible" | "timedout" | "unbounded" | "cycled";
  players: RosterPlayer[];
  formationId: number | null;
  formationName: string | null;
  captainId: number | null;
  creditsUsed: number;
  /** objective value: strategy-weighted */
  strategyScore: number;
  /** common-scale comparison: mean-weighted (5+6th+coach 100%, bench 50%, captain x2) */
  projPoints: number;
};
