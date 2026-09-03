import type { Db } from "./connection";
import { schema } from "./connection";

/**
 * League-agnostic base rows: the 3 optimiser teams and default tuning settings.
 * Idempotent (onConflictDoNothing) — never clobbers later tuning. Called by the
 * CSV importer and by `npm run seed` (the live-only bootstrap for a league that
 * skips the CSV).
 */
export async function seedBaseData(db: Db): Promise<void> {
  const seedTeams = [
    { id: 1, name: "Safe", strategy: "safe" as const, riskK: 0.6 },
    { id: 2, name: "Balanced", strategy: "balanced" as const, riskK: 0 },
    { id: 3, name: "Aggressive", strategy: "aggressive" as const, riskK: 0.6 },
  ];
  for (const t of seedTeams) {
    await db
      .insert(schema.fantasyTeams)
      .values({ ...t, budget: 100 })
      .onConflictDoNothing();
  }

  const seedSettings: Record<string, unknown> = {
    overlapCap: 6,
    teamCapPerRealTeam: 6,
    rosterSize: 11,
    positionCounts: { Guard: 4, Forward: 4, Center: 2, "Head Coach": 1 },
    captainMultiplier: 2,
    benchWeight: 0.5,
    contrarianWeight: 0.2,
    turnBalancePenalty: 6,
    minPerTurn: 5,
    projectionModel: {},
  };
  for (const [key, value] of Object.entries(seedSettings)) {
    await db
      .insert(schema.settings)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoNothing();
  }
}
