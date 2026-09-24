---
name: apply-lineup
description: Fetch this repo's current recommended trades + lineup (the same "Copy agent prompt" text from /planner or /trades) and, if a browser-automation tool (Claude in Chrome) is connected in this session, apply it to the live EuroLeague/EuroCup Fantasy app and verify. Use when the user says "apply my lineup", "run the agent prompt", "sync my fantasy teams", or `/apply-lineup [eurocup|euroleague|all]`.
---

# /apply-lineup — generate today's recommendation and apply it live

This wraps the eurocup-fantasy app's own "Copy agent prompt" feature end to
end: get the freshest recommendation straight from the deployed app, then (if
a browser tool is available) actually make the changes in the real
EuroLeague/EuroCup Fantasy app and report back — no manual copy-paste step.

**Only ever changes the *real fantasy app*.** This skill never touches this
repo's code or its database directly — it drives the browser exactly the way
a human would.

## Step 1 — figure out which league(s)

Parse `$ARGUMENTS`: `eurocup` or `euroleague` → just that one; empty, or
`all` → both. Deployment URLs:

| League | URL |
|---|---|
| EuroCup | https://eurocup-fantasy.vercel.app |
| EuroLeague | *(fill in once known — see `deployments.md` in this skill's folder if present, otherwise ask the user)* |

## Step 2 — get the current prompt from the app itself

Do this by driving the browser against **our own app**, not by re-deriving
the recommendation by hand — the exported prompt text already encodes real,
debugged logic (turn-specific lineup, "no trades needed" detection, locked
trade windows, "no game this turn" annotations). Re-reading the dashboard UI
and reconstructing it yourself will drift from that logic; don't.

If `mcp__claude-in-chrome__*` tools aren't loaded yet, load the core set in
one `ToolSearch` call:
`select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__tabs_close_mcp`

If no Chrome tab/tools are available at all in this session (e.g. no
Claude-in-Chrome connected), **stop here** — open the deployment's `/planner`
page for the user to read manually, and tell them why you can't go further
(no browser tool connected in this session).

Otherwise, for each target league:

1. `tabs_create_mcp` → navigate to `{baseUrl}/planner`.
2. Use `javascript_tool` to click the combined button and read the clipboard
   it fills — do this as **one direct DOM `.click()` call**, not a synthetic
   `computer`-tool click: only a real DOM click reliably passes the
   clipboard-permission chain in this automation context.
   ```js
   [...document.querySelectorAll('button')]
     .find(b => b.textContent.includes('all 3 teams'))
     ?.click();
   ```
   Wait briefly (e.g. re-check after ~500ms), then read it back:
   ```js
   await navigator.clipboard.readText();
   ```
   If that returns empty/throws, the clipboard fallback textarea will be
   visible on the page instead — read its `.value` directly:
   ```js
   document.querySelector('textarea')?.value;
   ```
3. Close the tab.

You now have the exact same text the user would get from clicking "Copy
prompt for all 3 teams" by hand.

## Step 3 — apply it

Follow the fetched prompt's own instructions literally (open the real
fantasy app, log in if needed, work through TRADES then LINEUP per team,
verify). It is already self-contained and step-by-step — don't improvise
beyond what it says. In particular:

- If it says trades may be locked or a listed player isn't available, stop
  on that item and report it — don't guess a substitute.
- Never click through a `window.confirm`/`alert` dialog blindly; if one
  appears, read it first.
- This changes the user's real fantasy roster. Go through all 3 teams for a
  league before reporting back on that league, per the prompt's own
  instructions — but if anything looks wrong or unexpected mid-way (a price
  that doesn't match, a player not found), stop and ask rather than pushing
  through.

## Step 4 — report back

For each league processed: what you changed, per team, and anything you
couldn't do (and why). This mirrors the VERIFY & REPORT BACK section already
in the prompt — just relay it, don't re-summarize from scratch.
