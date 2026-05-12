# Claude Code Instructions

> This file mirrors `AGENTS.md` so Claude Code picks up the same rules. If they ever diverge, `AGENTS.md` is the canonical source.

This repository is a vibe‑coded project with a structured human + AI workflow. **You must follow the workflow before making changes.**

## Required reading (in this order, every new session)

1. **`WORKFLOW.md`** — the contract. File roles, session start/end protocol, branching, PR policy, scope discipline, done definition. Read it fully on first interaction.
2. **`PROGRESS.md`** — only the **Current status** section at the top. That tells you the active phase, current sub‑task, next concrete action, blockers, and which files were last touched.
3. **`PLAN.md`** — only the **active phase** identified by `PROGRESS.md`. Each phase lists Goal, Files to touch, Detailed steps, Acceptance criteria, Out of scope, Risks.
4. **`ARCHITECTURE.md`** — only if you need an overview of how the codebase fits together.

## Hard rules

- **Do not start the next phase until the active one is merged.**
- **Do not silently change direction.** If an assumption in `PLAN.md` turns out wrong, surface it or make the smallest reversible change and log it in `PROGRESS.md`.
- **No drive‑by refactors.** Note unrelated issues under "Tech debt observed" in the session log.
- **No `.env.local`, `node_modules`, or `data/classrooms/` commits.**
- **One PR per phase.** Branch name `phase-N-<slug>`. Include a co‑author line in commits: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Always end a session by updating `PROGRESS.md`**: overwrite the "Current status" section, append a new "Session log" entry. See `WORKFLOW.md` for required fields.
  - **Save incrementally, not just at the end.** After each meaningful milestone, update `PROGRESS.md` immediately. In long sessions, context degrades — treat it like a save point the next session can trust.
- **Always keep Linear in sync.** After any work, update the relevant Linear issue and any affected Linear documents. If you changed it in the repo, reflect it in Linear.

## Project context (short)

OpenMAIC is a Next.js 16 multi‑agent classroom platform (see `ARCHITECTURE.md` for the full map). We are converting it to a **university LMS** in library mode: students sign in via **Clerk**, complete enrollment‑based onboarding (roll number → auto‑unlock paid semesters), and browse a hierarchical catalog (**semester → subject → unit → lesson**) of pre‑generated classrooms. Live multi‑agent chat, quizzes, PBL, Q&A, and TTS remain available — backed by server‑held LLM keys. Data lives in **Neon (PostgreSQL)** + **Cloudflare R2** (media). Deployed on **Railway**. Pilot target: single university, B.Pharmacy program.

Both instances (admin + student) share a **single Clerk application** and the same Neon + R2. `ACCESS_CODE` is fully deprecated. Three app‑level roles: `student | sme | admin` (see `PLAN.md` §0.9).

Two env flags drive the mode:

- `LIBRARY_ONLY` — server‑only. Middleware blocks generation routes when true.
- `NEXT_PUBLIC_LIBRARY_ONLY` — client‑visible. Hides generation UI in the bundle when true.

Default student LLM: `google:gemini-3-flash-preview`. Rate limits in `PLAN.md` §0.4. Student‑learning defaults (temperature, reply length, captions, idle timeout, etc.) in `PLAN.md` §0.5.

**Student UI is a mobile app shell** (PWA-installable, `max-w-[420px]`, centered on desktop). Not responsive web. See `PLAN.md` §0.8 and `.cursor/rules/mobile-app-shell.mdc`.

## AFK execution protocol (slice-based)

When running autonomously (AFK / night-shift mode), follow this loop **one slice at a time**:

1. Read `CLAUDE.md` → `WORKFLOW.md` → `PROGRESS.md` (current status only).
2. Read the assigned Linear slice issue (description + acceptance criteria).
3. Move the issue → **In Progress** in Linear.
4. Explore the codebase to understand existing patterns before writing code.
5. Prefer **deep modules with simple interfaces** — few files, rich internals, easy to test.
6. Use **TDD**: write a failing test → implement → pass the test → refactor.
7. Run the feedback loop: `pnpm typecheck && pnpm test && pnpm lint`
8. Stop when **ALL** acceptance criteria from the Linear issue are met.
9. Run `pnpm build` to confirm no regressions.
10. **Post a completion comment** on the Linear issue. Write for a non-technical reader — plain English, no jargon. Include: what was done, what was tested, pass/fail results, and anything the reviewer should know.
11. Move the issue → **Needs QA** in Linear.
12. Update `PROGRESS.md` with a session log entry.

**One slice per session. Do NOT add features beyond scope. Do NOT skip tests.**

**Execution order**: Query Linear for the current DAG — list `Slice`-labeled issues, check `blockedBy` relations, pick the next `Todo` issue with all blockers `Done`. Do not rely on a hardcoded list.

## Handling change requests

When the human asks for changes (new features, altered requirements, pivots): **do NOT jump to code.** Instead:
1. **Detect** — scope change, new slice, deletion, or rework?
2. **Clarify** — ask what exactly changes, which slices are affected, are Done slices impacted?
3. **Propagate** — update Linear issues, Linear docs, DAG, and repo docs (`PLAN.md`, `AGENTS.md`, `PROGRESS.md`)
4. **Summarize** — tell the human what changed and where

**Never silently absorb a change.** Always confirm → update everywhere → summarize.

## When in doubt

Ask the human before guessing. The vibe coder unblocks; the AI does not fabricate. The workflow is designed so a new session can produce useful work within 5 minutes of reading these files — don't shortcut it.
