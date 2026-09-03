"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncResponse = {
  ok?: boolean;
  error?: string;
  sync?: {
    matchdayNumber: number;
    playersUpserted: number;
    prunedPlayers?: number;
    syncedTeams: { name: string }[];
  };
  projected?: number;
  teams?: { id: number; name: string; status: string; projPoints: number }[];
};

export function SyncButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data: SyncResponse = await res.json();
      if (!res.ok || data.error) {
        setMsg({ kind: "err", text: data.error ?? `Sync failed (${res.status})` });
      } else {
        const parts = [
          `Matchday ${data.sync?.matchdayNumber}`,
          `${data.sync?.playersUpserted ?? 0} players`,
          data.sync?.prunedPlayers ? `${data.sync.prunedPlayers} pruned` : null,
          data.projected ? `${data.projected} projected` : null,
          data.teams ? `${data.teams.length} teams rebuilt` : null,
        ].filter(Boolean);
        setMsg({ kind: "ok", text: `Synced — ${parts.join(", ")}.` });
        router.refresh();
      }
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={busy || disabled}
        className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-sm hover:border-[var(--accent)] disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {msg && (
        <p className={`text-sm ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
