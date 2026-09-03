import { db, schema } from "@/db";
import { DUNKEST_TOKEN_KEY, getLastSync, getSetting } from "@/lib/kv";

import { RebuildBanner } from "../rebuild-banner";
import { clearToken, saveMapping, saveToken, saveTuning } from "./actions";
import { SyncButton } from "./sync-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const storedToken = getSetting<string>(db, DUNKEST_TOKEN_KEY);
  const envToken = Boolean(process.env.DUNKEST_TOKEN?.trim());
  const hasToken = envToken || Boolean(storedToken);
  const lastSync = getLastSync(db);
  const syncedTeams = await db.select().from(schema.syncedTeams).orderBy(schema.syncedTeams.dunkestTeamId);
  const fantasyTeams = await db.select().from(schema.fantasyTeams).orderBy(schema.fantasyTeams.id);

  const safeK = fantasyTeams.find((t) => t.strategy === "safe")?.riskK ?? 0.6;
  const aggK = fantasyTeams.find((t) => t.strategy === "aggressive")?.riskK ?? 0.6;
  const budget = fantasyTeams[0]?.budget ?? 100;
  const overlapCap = getSetting<number>(db, "overlapCap") ?? 6;
  const contrarianWeight = getSetting<number>(db, "contrarianWeight") ?? 0.2;
  const turnBalancePenalty = getSetting<number>(db, "turnBalancePenalty") ?? 6;
  const minPerTurn = getSetting<number>(db, "minPerTurn") ?? 5;

  const mask = (t: string) => (t.length > 10 ? `${t.slice(0, 4)}…${t.slice(-4)}` : "set");

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <RebuildBanner />

      {/* Token */}
      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <div>
          <h2 className="font-medium">Dunkest API token</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Log in at euroleaguefantasy.euroleaguebasketball.net, open devtools console on that
            tab, and run{" "}
            <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5">
              localStorage.getItem(&apos;flutter.authToken&apos;)
            </code>
            . Paste the value (quotes are stripped automatically). Stored locally in your DB; used
            only to read your own account.
          </p>
        </div>

        <p className="text-sm">
          Status:{" "}
          {envToken ? (
            <span className="text-emerald-400">set via DUNKEST_TOKEN env</span>
          ) : storedToken ? (
            <span className="text-emerald-400">stored ({mask(storedToken)})</span>
          ) : (
            <span className="text-amber-400">not set</span>
          )}
        </p>

        {!envToken && (
          <form action={saveToken} className="flex gap-2">
            <input
              type="password"
              name="token"
              placeholder="paste flutter.authToken…"
              autoComplete="off"
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm hover:border-[var(--accent)]">
              Save
            </button>
            {storedToken && (
              <button
                formAction={clearToken}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-red-400"
              >
                Clear
              </button>
            )}
          </form>
        )}
      </section>

      {/* Sync */}
      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="font-medium">Sync</h2>
        <p className="text-sm text-[var(--muted)]">
          Pulls the current matchday&apos;s player pool + prices, your real rosters and ranks, then
          recomputes projections and rebuilds the 3 optimizer teams.
        </p>
        <SyncButton disabled={!hasToken} />
        {lastSync && (
          <p className="text-xs text-[var(--muted)]">
            Last run: {new Date(lastSync.startedAt).toLocaleString()} —{" "}
            {lastSync.ok ? (
              <span className="text-emerald-400">ok</span>
            ) : lastSync.finishedAt ? (
              <span className="text-red-400">failed: {lastSync.error}</span>
            ) : (
              <span className="text-amber-400">in progress / interrupted</span>
            )}
          </p>
        )}
      </section>

      {/* Tuning */}
      <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
        <h2 className="font-medium">Optimiser tuning</h2>
        <p className="text-sm text-[var(--muted)]">
          How the 3 teams are built. Save, then rebuild (banner appears above).
        </p>
        <form action={saveTuning} className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Field
            label="Budget (credits)"
            name="budget"
            defaultValue={budget}
            step={0.1}
            hint="100 + 0.3 per round joined late"
          />
          <Field
            label="Overlap cap"
            name="overlapCap"
            defaultValue={overlapCap}
            step={1}
            hint="max shared players between any 2 teams"
          />
          <Field
            label="Safe · risk k"
            name="safeK"
            defaultValue={safeK}
            step={0.1}
            hint="floor = mean − k·σ; higher = more conservative"
          />
          <Field
            label="Aggressive · risk k"
            name="aggK"
            defaultValue={aggK}
            step={0.1}
            hint="ceiling = mean + k·σ; higher = more boom/bust"
          />
          <Field
            label="Contrarian weight"
            name="contrarianWeight"
            defaultValue={contrarianWeight}
            step={0.05}
            hint="aggressive team: value −= w · ownership%"
          />
          <Field
            label="Turn-balance penalty"
            name="turnBalancePenalty"
            defaultValue={turnBalancePenalty}
            step={1}
            hint="pts/slot for <min outfielders on a game-day"
          />
          <Field
            label="Min per turn"
            name="minPerTurn"
            defaultValue={minPerTurn}
            step={1}
            hint="target outfielders playable each game-day"
          />
          <div className="col-span-2">
            <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-sm hover:border-[var(--accent)]">
              Save tuning
            </button>
          </div>
        </form>
      </section>

      {/* Team mapping */}
      {syncedTeams.length > 0 && (
        <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
          <h2 className="font-medium">Team mapping</h2>
          <p className="text-sm text-[var(--muted)]">
            Which of your real EuroCup teams should be compared against each optimizer strategy
            (drives trade suggestions).
          </p>
          <div className="space-y-2">
            {syncedTeams.map((st) => (
              <form key={st.dunkestTeamId} action={saveMapping} className="flex items-center gap-3">
                <input type="hidden" name="dunkestTeamId" value={st.dunkestTeamId} />
                <span className="w-48 truncate text-sm">
                  {st.name}
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    #{st.dunkestTeamId}
                    {st.position != null ? ` · rank ${st.position}` : ""}
                  </span>
                </span>
                <span className="text-[var(--muted)]">→</span>
                <select
                  name="fantasyTeamId"
                  defaultValue={st.mappedFantasyTeamId ?? ""}
                  className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm"
                >
                  <option value="">unmapped</option>
                  {fantasyTeams.map((ft) => (
                    <option key={ft.id} value={ft.id}>
                      Team {ft.id} · {ft.name}
                    </option>
                  ))}
                </select>
                <button className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-xs hover:border-[var(--accent)]">
                  Save
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  step,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: number;
  step: number;
  hint: string;
}) {
  return (
    <label className="block">
      <span className="text-[var(--text)]">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        step={step}
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
      />
      <span className="mt-0.5 block text-[11px] text-[var(--muted)]">{hint}</span>
    </label>
  );
}
