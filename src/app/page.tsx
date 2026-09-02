import Link from "next/link";
import { sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { getCurrentMatchday } from "@/lib/players";

export const dynamic = "force-dynamic";

async function counts() {
  const [p] = await db.select({ n: sql<number>`count(*)` }).from(schema.players);
  const [s] = await db.select({ n: sql<number>`count(*)` }).from(schema.playerSnapshots);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(schema.realTeams);
  const ft = await db.select().from(schema.fantasyTeams).orderBy(schema.fantasyTeams.id);
  return { players: p?.n ?? 0, snapshots: s?.n ?? 0, teams: t?.n ?? 0, fantasyTeams: ft };
}

export default async function Home() {
  const [{ players, snapshots, teams, fantasyTeams }, matchday] = await Promise.all([
    counts(),
    getCurrentMatchday(),
  ]);

  const empty = players === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {matchday ? `Current: ${matchday.label} (Round ${matchday.number})` : "No matchday loaded"}
        </p>
      </div>

      {empty ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5 text-sm">
          <p className="font-medium">No data yet.</p>
          <p className="mt-1 text-[var(--muted)]">
            Run <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">npm run setup</code> to
            create the database and import the players CSV.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Players" value={players} />
          <Stat label="Snapshots" value={snapshots} />
          <Stat label="Real teams" value={teams} />
          <Stat label="Fantasy teams" value={fantasyTeams.length} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {fantasyTeams.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Team {t.id}</span>
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {t.strategy}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Budget {t.budget} · risk k={t.riskK}
            </p>
            <p className="mt-3 text-xs text-[var(--muted)]">Roster builder arrives in step 3.</p>
          </div>
        ))}
      </div>

      <div>
        <Link
          href="/players"
          className="inline-block rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-sm hover:border-[var(--accent)]"
        >
          Browse players →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}
