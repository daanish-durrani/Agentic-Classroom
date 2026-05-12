# Agent Instructions

This repository is a vibe‑coded project with a structured human + AI workflow. **Any AI agent working in this repo must follow the workflow before making changes.**

## Required reading (in this order, every new session)

1. **`WORKFLOW.md`** — the contract. File roles, session start/end protocol, branching, PR policy, scope discipline, done definition. Read it fully on first interaction.
2. **`PROGRESS.md`** — only the **Current status** section at the top. That tells you the active phase, current sub‑task, next concrete action, blockers, and which files were last touched.
3. **`PLAN.md`** — only the **active phase** identified by `PROGRESS.md`. Each phase lists Goal, Files to touch, Detailed steps, Acceptance criteria, Out of scope, Risks.
4. **`ARCHITECTURE.md`** — only if you need an overview of how the codebase fits together.

## Hard rules

- **Do not start the next phase until the active one is merged.**
- **Do not silently change direction.** If an assumption in `PLAN.md` turns out wrong, surface it or make the smallest reversible change and log it in `PROGRESS.md` session log.
- **No drive‑by refactors.** Note unrelated issues under "Tech debt observed" in the session log.
- **No `.env.local`, `node_modules`, or `data/classrooms/` commits.**
- **One PR per phase.** Branch name `phase-N-<slug>`.
- **Never run `git add`, `git commit`, or `git push`.** The human reviews all changes and commits manually. This applies in both interactive and AFK modes — agents write code and update docs, the human controls version history.
- **Always end a session by updating `PROGRESS.md`**: overwrite the "Current status" section, append a new "Session log" entry. See `WORKFLOW.md` for required fields.
  - **Save incrementally, not just at the end.** After each meaningful milestone (schema push, code change, doc update), update `PROGRESS.md` immediately. In long sessions, context degrades — if you only write at the end, you risk documenting work inaccurately. Treat `PROGRESS.md` like a save point: the next session must be able to trust it completely.
  - **"Overwrite" means update, not erase.** When rewriting "Current status", preserve cumulative context from prior sessions. File lists must stay cumulative (add new entries, annotate amended ones with session numbers). Never drop entries from earlier sessions — the next agent needs the full picture of the branch.
- **Always keep Linear in sync.** After completing any work — slices, infra, doc changes, schema pushes, anything — update the relevant Linear issue (description **and** comment), move its **status** if the work is fully complete (e.g. In Progress → Needs QA → Done), and update any affected Linear documents (Architecture, Schema, Roles). If you changed it in the repo, reflect it in Linear.

## Project context (short)

OpenMAIC is a Next.js 16 multi‑agent classroom platform (see `ARCHITECTURE.md` for the full map). We are converting it to a **university LMS** in library mode: students sign in via **Clerk**, complete enrollment‑based onboarding (roll number → auto‑unlock paid semesters), and browse a hierarchical catalog (**semester → subject → unit → lesson**) of pre‑generated classrooms. Live multi‑agent chat, quizzes, PBL, Q&A, and TTS remain available — backed by server‑held LLM keys. Data lives in **Neon (PostgreSQL)** + **Cloudflare R2** (media). Deployed on **Railway**. Pilot target: single university, B.Pharmacy program.

Both instances (admin + student) share a **single Clerk application** and the same Neon + R2. `ACCESS_CODE` is fully deprecated. Three app‑level roles: `student | sme | admin` (see `PLAN.md` §0.9).

Two env flags drive the mode:

- `LIBRARY_ONLY` — server‑only. Middleware blocks generation routes when true.
- `NEXT_PUBLIC_LIBRARY_ONLY` — client‑visible. Hides generation UI in the bundle when true.

Default student LLM: `google:gemini-3-flash-preview`. Rate limits in `PLAN.md` §0.4. Student‑learning defaults (temperature, reply length, captions, idle timeout, etc.) in `PLAN.md` §0.5.

**Student UI is a mobile app shell** (PWA-installable, `max-w-[420px]`, centered on desktop). Not responsive web. See `PLAN.md` §0.8 and `.cursor/rules/mobile-app-shell.mdc`.

## Tool‑specific notes

- **Cursor**: `.cursor/rules/library-mode.mdc` auto‑attaches a summary of this file. You should still read `WORKFLOW.md` + `PROGRESS.md` directly.
- **Claude Code**: `CLAUDE.md` mirrors this file. Same rules apply.
- **Antigravity / Windsurf / Aider / generic agents**: this file (`AGENTS.md`) is the single source of truth at repo root.
- **Warp / Oz**: WARP Rules already supply environment context; this file supplies project‑specific rules.
- **GitHub Copilot**: not rule‑driven; keep `WORKFLOW.md` and `PROGRESS.md` open in your editor as context.

## AFK execution protocol (slice-based)

When running autonomously (AFK / night-shift mode), follow this loop **one slice at a time**:

### Startup

1. Read `AGENTS.md` → `WORKFLOW.md` → `PROGRESS.md` (current status only).
2. Read the assigned Linear slice issue (description + acceptance criteria).
3. Move the issue → **In Progress** in Linear.

### Implementation

4. Explore the codebase to understand existing patterns before writing code.
5. Prefer **deep modules with simple interfaces** — few files, rich internals, easy to test.
6. Use **TDD**: write a failing test → implement → pass the test → refactor.
7. Run the feedback loop after every meaningful change:
   ```
   pnpm typecheck && pnpm test && pnpm lint
   ```
8. Stop when **ALL** acceptance criteria from the Linear issue are met.

### Wrap-up

9. Run `pnpm build` to confirm no regressions.
10. **Post a completion comment** on the Linear issue. Write it for a non-technical reader — no jargon, no code snippets, no file paths in the summary. Include:
    - **What was done** — plain English, e.g. "When a student signs up, their account is now saved to the database automatically"
    - **What was tested** — e.g. "Tested that signing up creates the right records, and that fake/broken requests are rejected"
    - **Result** — did all checks pass? (`typecheck ✅`, `tests ✅`, `build ✅`)
    - **Anything the reviewer should know** — gotchas, decisions made, things that felt off
    - **QA checklist** — a markdown checklist (`- [ ]`) of specific steps the reviewer should follow to verify the work. Tailor it to the slice (e.g. "Sign up with a test account and confirm a user row appears in the database"). Keep it concrete and actionable — no vague items like "verify it works."
11. Move the issue → **Needs QA** in Linear.
12. Update `PROGRESS.md` with a session log entry.

### Hard rules

- **One slice per session.** Do not start the next slice.
- **Do NOT add features** beyond the slice scope.
- **Do NOT refactor** unrelated code (log it as tech debt).
- **Do NOT skip** the test step — tests are the feedback loop.
- **Do NOT review your own work** in the same session (dumb zone risk).

### Execution order

**Query Linear for the current dependency graph** — do not rely on a hardcoded list. Use the Linear MCP to:
1. List all `Slice`-labeled issues in the project.
2. Check each issue's `blockedBy` relations to build the DAG.
3. Pick the next issue that is in `Todo` and has **all** blockers in `Done`.

If Linear MCP is unavailable, fall back to `PROGRESS.md` which records the last completed slice.

## Handling change requests

The human may ask for changes at any time — new features, altered requirements, architecture pivots. When this happens, **do NOT jump to code.** Follow this protocol:

### 1. Detect the type of change

| Signal | Type | Example |
|---|---|---|
| "Actually, change X to Y" | **Scope change** | "Use Auth0 instead of Clerk" |
| "Add [new feature]" | **New slice** | "Add a leaderboard" |
| "Remove [feature]" | **Slice deletion** | "Drop the TTS feature" |
| "I don't like how X works" | **Rework** | "Onboarding should be one step, not three" |

### 2. Ask clarifying questions

Before making any changes, confirm:
- **What exactly changes?** (get specifics, not vibes)
- **Which slices does this affect?** (check the DAG)
- **Are any Done slices impacted?** (those need new slices, not edits)

### 3. Propagate the change

Once confirmed, update **all** affected locations:
- **Linear issue descriptions** — edit the slice specs
- **Linear DAG** — add/remove/reorder dependencies if needed
- **Linear documents** — update Architecture, Schema, Roles if affected
- **Repo docs** — update `PLAN.md`, `AGENTS.md`, `PROGRESS.md` as needed
- **Create new slices** if a Done slice needs rework

### 4. Summarize what changed

Post a summary to the human:
- What was changed and where (Linear issues, repo files)
- Any new slices created
- Updated execution order if the DAG changed

**Never silently absorb a change.** Always confirm → update everywhere → summarize.

## When in doubt

Ask the human before guessing. The vibe coder unblocks; the AI does not fabricate. The workflow is designed so a new session can produce useful work within 5 minutes of reading these files — don't shortcut it.
