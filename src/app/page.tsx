import Link from "next/link";
import { sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { getDashboard, type ActionItem } from "@/lib/dashboard";
import { getLastSync } from "@/lib/kv";
import { getCurrentMatchday } from "@/lib/players";
import { getTeamsForCurrentMatchday } from "@/lib/teams";

export const dynamic = "force-dynamic";

async function counts() {
  const [p] = await db.select({ n: sql<number>`count(*)` }).from(schema.players);
  const [s] = await db.select({ n: sql<number>`count(*)` }).from(schema.playerSnapshots);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(schema.realTeams);
  return { players: p?.n ?? 0, snapshots: s?.n ?? 0, teams: t?.n ?? 0 };
}

export default async function Home() {
  const [{ players, snapshots, teams }, matchday, { teams: teamViews }, dash] = await Promise.all([
    counts(),
    getCurrentMatchday(),
    getTeamsForCurrentMatchday(),
    getDashboard(),
  ]);
  const lastSync = getLastSync(db);
  const syncedTeams = await db
    .select()
    .from(schema.syncedTeams)
    .orderBy(schema.syncedTeams.dunkestTeamId);
  const mappedById = new Map(
    syncedTeams
      .filter((s) => s.mappedFantasyTeamId != null)
      .map((s) => [s.mappedFantasyTeamId as number, s]),
  );

  const empty = players === 0;

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {matchday
              ? `${matchday.label} (Round ${matchday.number}) · ${dash.windowLabel}`
              : "No matchday loaded"}
            {dash.roundCountdownDays != null &&
              (dash.roundCountdownDays > 0
                ? ` · round starts in ${dash.roundCountdownDays}d`
                : " · round underway")}
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {lastSync
            ? `Last sync: ${new Date(lastSync.startedAt).toLocaleString()} ${
                lastSync.ok ? "ok" : "failed — check Settings"
              }`
            : "Never synced — "}
          {!lastSync && (
            <Link href="/settings" className="text-[var(--accent)]">
              set up token
            </Link>
          )}
        </p>
      </div>

      {empty ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5 text-sm">
          <p className="font-medium">No data yet.</p>
          <p className="mt-1 text-[var(--muted)]">
            Run <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">npm run setup</code> for
            the CSV bootstrap, or add a token on{" "}
            <Link href="/settings" className="text-[var(--accent)]">
              Settings
            </Link>{" "}
            and sync live data.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Players" value={players} />
          <Stat label="Snapshots" value={snapshots} />
          <Stat label="Real teams" value={teams} />
          <Stat label="Synced teams" value={syncedTeams.length} />
        </div>
      )}

      {dash.actions.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
          <h2 className="text-sm font-medium">Needs attention</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {dash.actions.map((a, i) => (
              <ActionRow key={i} a={a} />
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {teamViews.map((t) => {
          const real = mappedById.get(t.id);
          return (
            <div
              key={t.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">
                  Team {t.id} · {t.name}
                </span>
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {t.strategy}
                </span>
              </div>
              <div className="mt-3 flex gap-4 text-sm tabular-nums">
                <span>
                  <span className="text-[var(--muted)]">Proj </span>
                  <span className="font-semibold">{t.projPoints || "—"}</span>
                </span>
                <span>
                  <span className="text-[var(--muted)]">Cr </span>
                  {t.creditsUsed || "—"}/{t.budget}
                </span>
                {t.formationName && (
                  <span>
                    <span className="text-[var(--muted)]">Form </span>
                    {t.formationName}
                  </span>
                )}
              </div>
              {real && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  ↔ {real.name}
                  {real.position != null ? ` · global rank ${real.position}` : ""}
                  {real.totalPts != null ? ` · ${real.totalPts} pts` : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Link
          href="/teams"
          className="inline-block rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-sm hover:border-[var(--accent)]"
        >
          View teams →
        </Link>
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

function ActionRow({ a }: { a: ActionItem }) {
  const dot =
    a.severity === "high" ? "bg-red-400" : a.severity === "med" ? "bg-amber-400" : "bg-[var(--muted)]";
  const body = (
    <span className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {a.text}
    </span>
  );
  return (
    <li>
      {a.href ? (
        <Link href={a.href} className="hover:text-[var(--accent)]">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
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
