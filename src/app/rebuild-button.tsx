"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { rebuildTeams } from "./rebuild-action";

export function RebuildButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await rebuildTeams();
          router.refresh();
        })
      }
      className="shrink-0 rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1 text-xs font-medium hover:bg-amber-500/25 disabled:opacity-60"
    >
      {pending ? "Rebuilding…" : "Rebuild teams"}
    </button>
  );
}
