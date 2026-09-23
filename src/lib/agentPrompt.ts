import type { TeamTradePlan } from "@/lib/trades/plan";
import type { WindowStatus } from "@/lib/trades/window";
import type { TeamRosterPlayer, TeamView } from "@/lib/teams";

const SLOT_LABEL: Record<string, string> = {
  starter: "Starter",
  sixth: "6th man (100%)",
  bench: "Bench (50%)",
  coach: "Head coach",
};

function posLetter(position: string): string {
  return position === "Head Coach" ? "HC" : position[0];
}

function playerLine(p: TeamRosterPlayer): string {
  return `${posLetter(p.position)} ${p.name} (${p.teamAbbr})${p.isCaptain ? " — CAPTAIN" : ""}`;
}

/**
 * A copy-pasteable, self-contained instruction set for a browser-automation
 * agent (e.g. Claude in Chrome) to apply one team's recommendation in the
 * live EuroLeague/EuroCup Fantasy app. Pure function — everything it needs is
 * passed in already computed.
 */
export function buildAgentPrompt(
  team: TeamView,
  trade: TeamTradePlan | undefined,
  leagueShortName: string,
  window: WindowStatus,
): string {
  const lines: string[] = [];

  lines.push(
    `Update my ${leagueShortName} Fantasy team "${trade?.realTeamName ?? team.name}" to match the plan below.`,
    "",
    `1. Open https://euroleaguefantasy.euroleaguebasketball.net (log in if needed). Make sure the ${leagueShortName} competition is selected (top dropdown, if there is one). Open the team "${trade?.realTeamName ?? team.name}" → Manage Team.`,
  );

  // --- Trades ---
  const moves = trade?.moves ?? [];
  const activeMoves = moves.filter((m) => !m.applied);
  lines.push("", "2. TRADES");
  if (!trade || trade.mode === "in-sync" || activeMoves.length === 0) {
    lines.push("   No trades needed — the roster already has the right 11 players. Skip to step 3.");
  } else {
    if (window.locked) {
      lines.push(
        `   Note: trades may be locked right now (${window.label} — ${window.note}). If the app won't let you make a trade, stop and tell me instead of forcing anything.`,
      );
    }
    for (const m of activeMoves) {
      if (m.out && m.in) {
        lines.push(`   - Sell ${m.out.name} (${m.out.teamAbbr}, ${m.out.position}) → buy ${m.in.name} (${m.in.teamAbbr}, ${m.in.position}) instead.`);
      } else if (m.in) {
        lines.push(`   - Buy ${m.in.name} (${m.in.teamAbbr}, ${m.in.position}) — filling an empty roster slot, nothing to sell for this one.`);
      } else if (m.out) {
        lines.push(`   - Sell ${m.out.name} (${m.out.teamAbbr}, ${m.out.position}) — no replacement needed.`);
      }
    }
    lines.push(
      "   If a listed player is no longer available to buy (already taken, injured-out, etc.), skip that one and tell me instead of picking a substitute yourself.",
    );
  }

  // --- Lineup ---
  const bySlot = (slot: string) => team.players.filter((p) => p.slot === slot);
  const captain = team.players.find((p) => p.isCaptain);

  lines.push(
    "",
    "3. LINEUP",
    "   I don't know what's currently set for this team, so read the screen first, then use tap-player → Substitute to rearrange the 11-player roster until it matches this exactly:",
    "",
    `   Formation: ${team.formationName ?? "(let the players below determine it)"}`,
    "",
  );
  for (const slot of ["starter", "sixth", "bench", "coach"]) {
    const players = bySlot(slot);
    if (players.length === 0) continue;
    lines.push(`   ${SLOT_LABEL[slot]}:`);
    for (const p of players) lines.push(`     - ${playerLine(p)}`);
  }
  lines.push(
    "",
    `   Captain: ${captain ? captain.name : "(see CAPTAIN tag above)"} — tap them → Captain.`,
  );

  lines.push(
    "",
    "4. VERIFY & REPORT BACK",
    "   Reopen Manage Team and confirm the on-screen starters / 6th man / bench / captain match the list above exactly. Then tell me:",
    "   - What you actually changed",
    "   - Anything you couldn't do, and why (trade blocked, player unavailable, lineup element that wouldn't match, etc.)",
    "   If anything on screen doesn't match what I described here, stop and ask me rather than guessing.",
  );

  return lines.join("\n");
}
