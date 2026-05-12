# Workflow — Human + AI Co‑Build Contract

This is the **rules of engagement** for the Library Mode project. Both the human (vibe coder) and any AI session (Cursor, Claude Code, Antigravity, Warp/Oz, Copilot, etc.) must follow this. Read this file first, then `PROGRESS.md` (top section), then `PLAN.md` for the active phase.

## Files

- `WORKFLOW.md` — this file. Stable. Rarely edited.
- `PLAN.md` — the phased plan. Stable. Only edited when scope changes (and only with the human's explicit say‑so).
- `PROGRESS.md` — the journal. Two sections:
  - **Top: "Current status"** — overwritten every session. Says exactly where work is paused.
  - **Below: "Session log"** — append‑only. Newest entry at top. One entry per working session.
- `AGENTS.md` — short cross‑tool pointer file at repo root that tells any agent which files to read. Most modern AI editors automatically pick this up.
- `CLAUDE.md` — Claude Code convention. Same content as `AGENTS.md` (mirror).
- `.cursor/rules/library-mode.mdc` — Cursor rule that auto‑attaches to every chat in this repo.

## How a new AI session starts work

1. Read `WORKFLOW.md` (this file) — full.
2. Read `PROGRESS.md` — only the "Current status" section at the top. That tells you the active phase, current sub‑task, next action, blockers, and which files to read first.
3. Read the matching phase in `PLAN.md` — only the active phase, not the whole file.
4. Skim the listed "Files to touch" for that phase before writing code.
5. Then do the work.

If "Current status" says blocked, **do not invent next steps**. Surface the blocker to the human and stop.

## How a session ends

Before you stop, you **must**:

1. Update the "Current status" section at the top of `PROGRESS.md` in place. Overwrite, don't append. Include:
   - Active phase + sub‑task
   - Next action (concrete, one sentence)
   - Blockers (or "none")
   - Files modified this session (paths only)
2. Append a new entry to the "Session log" section at the bottom (newest at top). Include:
   - Date
   - Phase
   - What was completed
   - What was deferred and why
   - Any decisions made (with rationale)
   - Test/lint/build status at session end

If a phase is finished, also:
3. Set the phase status in `PLAN.md` to "Complete" (the only edit ever made to `PLAN.md` outside scope changes).
4. Open a PR titled `phase-N: <slug>` and link it from the session log entry.

## Branching and PRs

- One PR per phase. Branch name: `phase-N-<short-slug>` (e.g. `phase-1-server-hardening`).
- Phases ship in order. Don't start phase N+1 until N is merged.
- If a phase grows, **split it**: append `Phase N.5` to `PLAN.md` rather than ballooning a single PR.

## Decision changes

If during implementation an assumption in `PLAN.md` turns out to be wrong, **do not silently change direction**. Either:

- Surface it to the human and wait for a yes/no, or
- Make the smallest reversible change, log the decision in the session log with rationale, and call it out at session end.

## Scope discipline

- "Out of scope" sections in `PLAN.md` are load‑bearing. Don't slip them in mid‑phase. If something feels essential that's listed as out of scope, append a `Phase N.5` or a new phase rather than expanding the current one.
- No drive‑by refactors. If a file needs cleanup unrelated to the active phase, note it in the session log under "Tech debt observed" and move on.

## Commit hygiene

- Commits inside a phase should be small and reversible. Conventional prefix: `phase-N: <verb> <thing>`.
- Don't commit `node_modules`, generated `data/classrooms/`, audio blobs, or `.env.local`.
- Include a co‑author line for the AI that made the change, e.g. `Co-Authored-By: Oz <oz-agent@warp.dev>` for Warp/Oz, `Co-Authored-By: Claude <noreply@anthropic.com>` for Claude Code, etc.

## Done definition (per phase)

A phase is "Complete" only when **all** of these hold:

- All acceptance criteria in the phase's `PLAN.md` section pass.
- Lint + typecheck + unit tests green.
- PR opened, reviewed, merged.
- `PLAN.md` status updated to Complete.
- `PROGRESS.md` session log entry written.
- `PROGRESS.md` "Current status" advanced to point at the next phase.

## When stuck

If you genuinely cannot make progress (missing decision, missing env var, missing file), do **not** guess. Stop, update "Current status" with the blocker, and surface it. The vibe coder unblocks; the AI doesn't fabricate.

## Tool‑specific notes

- **Cursor**: `.cursor/rules/library-mode.mdc` auto‑attaches this workflow to every chat in the repo. No extra steps.
- **Claude Code**: reads `CLAUDE.md` at repo root automatically. Same content as `AGENTS.md`.
- **Antigravity / Windsurf / generic agents**: read `AGENTS.md` at repo root.
- **Warp / Oz**: this repo's WARP Rules already exist; this file is the project‑specific complement.
- **Copilot**: not rule‑driven; rely on inline comments + the human keeping these files open as context.
