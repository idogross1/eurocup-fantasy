import type { PlanPlayer, TeamPlan, TurnPlan } from "@/lib/planner";
import type { TeamTradePlan } from "@/lib/trades/plan";
import type { WindowStatus } from "@/lib/trades/window";

function posLetter(position: string): string {
  return position === "Head Coach" ? "HC" : position[0];
}

function playerLine(p: PlanPlayer, captainId: number | undefined): string {
  const tag = p.id === captainId ? " — CAPTAIN" : "";
  return `${posLetter(p.position)} ${p.name} (${p.teamAbbr})${tag}`;
}

/**
 * The TRADES + LINEUP body for one team — no intro/open-app boilerplate, no
 * verify-footer, so it can be reused standalone (one team) or stitched into a
 * combined multi-team prompt.
 *
 * The lineup section must match /planner's per-turn view, not the flat
 * round-level roster: within a round the best 100%/50% split shifts turn to
 * turn (a bench player with a game can outrank a starter without one), and
 * /planner already computes that. Handing the agent the *round-level* slot
 * assignment instead produced a real, reported gap — e.g. Bar Timor shown as
 * a Turn-1 starter on /planner but "bench" here, because this used to read
 * the static round-level list. Always target the earliest turn that hasn't
 * happened yet, since that's what's actionable right now.
 */
function buildTeamSection(team: TeamPlan, trade: TeamTradePlan | undefined, window: WindowStatus): string {
  const lines: string[] = [];

  const moves = trade?.moves ?? [];
  const activeMoves = moves.filter((m) => !m.applied);
  lines.push("TRADES");
  if (!trade || trade.mode === "in-sync" || activeMoves.length === 0) {
    lines.push("  No trades needed — the roster already has the right 11 players. Skip to LINEUP.");
  } else {
    if (window.locked) {
      lines.push(
        `  Note: trades may be locked right now (${window.label} — ${window.note}). If the app won't let you make a trade, stop and tell me instead of forcing anything.`,
      );
    }
    for (const m of activeMoves) {
      if (m.out && m.in) {
        lines.push(`  - Sell ${m.out.name} (${m.out.teamAbbr}, ${m.out.position}) → buy ${m.in.name} (${m.in.teamAbbr}, ${m.in.position}) instead.`);
      } else if (m.in) {
        lines.push(`  - Buy ${m.in.name} (${m.in.teamAbbr}, ${m.in.position}) — filling an empty roster slot, nothing to sell for this one.`);
      } else if (m.out) {
        lines.push(`  - Sell ${m.out.name} (${m.out.teamAbbr}, ${m.out.position}) — no replacement needed.`);
      }
    }
    lines.push(
      "  If a listed player is no longer available to buy (already taken, injured-out, etc.), skip that one and tell me instead of picking a substitute yourself.",
    );
  }

  lines.push("", "LINEUP");
  const turn: TurnPlan | undefined = team.turns[0];
  if (!turn) {
    lines.push("  No turn data available yet — sync first, then regenerate this prompt.");
  } else {
    const captainId = turn.captain?.id;
    lines.push(
      `  This is the target for Turn ${turn.turn} specifically (game-day ${turn.turn} of this round) —` +
        " it's the best split for who actually has a game right now, and may differ from a later turn's." +
        " After Turn 1's games, come back to /planner and regenerate this for Turn 2 if it's different.",
      "  I don't know what's currently set for this team, so read the screen first, then use tap-player → Substitute to rearrange the 11-player roster until it matches this exactly:",
      "",
      `  Formation: ${team.formationName ?? "(let the players below determine it)"}`,
      "",
      "  Starters (100%):",
      ...turn.starters.map((p) => `    - ${playerLine(p, captainId)}${p.playing ? "" : " (no game this turn)"}`),
    );
    if (turn.sixth) {
      lines.push(
        "  6th man (100%):",
        `    - ${playerLine(turn.sixth, captainId)}${turn.sixth.playing ? "" : " (no game this turn)"}`,
      );
    }
    lines.push(
      "  Bench (50%):",
      ...turn.bench.map((p) => `    - ${playerLine(p, captainId)}${p.playing ? "" : " (no game this turn)"}`),
    );
    if (turn.coach) {
      lines.push("  Head coach:", `    - ${playerLine(turn.coach, undefined)}`);
    }
    lines.push(
      "",
      `  Captain: ${turn.captain ? turn.captain.name : "(none of the starters have a game this turn — leave the current captain, it won't score anyway)"}${turn.captain ? " — tap them → Captain." : ""}`,
    );
  }

  return lines.join("\n");
}

const VERIFY_FOOTER = [
  "Reopen Manage Team and confirm the on-screen starters / 6th man / bench / captain match the list above exactly. Then tell me:",
  "  - What you actually changed",
  "  - Anything you couldn't do, and why (trade blocked, player unavailable, lineup element that wouldn't match, etc.)",
  "If anything on screen doesn't match what I described here, stop and ask me rather than guessing.",
].join("\n");

/**
 * A copy-pasteable, self-contained instruction set for a browser-automation
 * agent (e.g. Claude in Chrome) to apply one team's recommendation in the
 * live EuroLeague/EuroCup Fantasy app. Pure function — everything it needs is
 * passed in already computed.
 */
/** Indent every line of a multi-line block by `prefix` (first line included). */
function indent(block: string, prefix = "   "): string {
  return block
    .split("\n")
    .map((l) => (l ? prefix + l : l))
    .join("\n");
}

export function buildAgentPrompt(
  team: TeamPlan,
  trade: TeamTradePlan | undefined,
  leagueShortName: string,
  window: WindowStatus,
): string {
  const teamName = trade?.realTeamName ?? team.name;
  return [
    `Update my ${leagueShortName} Fantasy team "${teamName}" to match the plan below.`,
    "",
    `1. Open https://euroleaguefantasy.euroleaguebasketball.net (log in if needed). Make sure the ${leagueShortName} competition is selected (top dropdown, if there is one). Open the team "${teamName}" → Manage Team.`,
    "",
    "2. " + indent(buildTeamSection(team, trade, window)).trimStart(),
    "",
    "3. VERIFY & REPORT BACK",
    indent(VERIFY_FOOTER),
  ].join("\n");
}

/**
 * One combined prompt covering all 3 teams: shared open-app step, one
 * TRADES+LINEUP section per team (in order), one shared verify-all footer.
 * Meant for pasting into a single agent turn that works through all three
 * teams before reporting back.
 */
export function buildAllTeamsAgentPrompt(
  entries: { team: TeamPlan; trade: TeamTradePlan | undefined }[],
  leagueShortName: string,
  window: WindowStatus,
): string {
  const lines: string[] = [
    `Update all ${entries.length} of my ${leagueShortName} Fantasy teams to match the plan below. Do them one at a time, in the order listed, and don't move to the next team until the current one is verified.`,
    "",
    `1. Open https://euroleaguefantasy.euroleaguebasketball.net (log in if needed). Make sure the ${leagueShortName} competition is selected (top dropdown, if there is one).`,
  ];

  entries.forEach(({ team, trade }, i) => {
    const teamName = trade?.realTeamName ?? team.name;
    lines.push(
      "",
      `════════ TEAM ${i + 1} — "${teamName}" (${team.strategy}) ════════`,
      `Open this team → Manage Team.`,
      "",
      buildTeamSection(team, trade, window),
    );
  });

  lines.push(
    "",
    "════════ FINALLY — VERIFY & REPORT BACK, FOR ALL 3 TEAMS ════════",
    VERIFY_FOOTER.replace("Reopen Manage Team", "For each of the 3 teams, reopen Manage Team"),
  );

  return lines.join("\n");
}
