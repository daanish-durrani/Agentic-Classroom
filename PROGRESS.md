# Progress

> This file has two sections. **Current status** at the top is overwritten every session. **Session log** below is append‑only, newest entry at the top. See `WORKFLOW.md` for the rules.

## Current status

- **Active phase**: Slice execution (Phase 0 merged ✅, DAA-5 → Done)
- **Current sub-task**: DAA-16 "Sign up → user row + profile created" — **complete**, moved to Needs QA.
- **Next action**: Start next session → query Linear DAG → pick next unblocked slice (DAA-29 "Remove ACCESS_CODE gate entirely" — blocked by DAA-16, so blocked until DAA-16 is Done).
- **Blockers**: DAA-16 needs QA approval before dependent slices can start.
- **Last completed slice**: DAA-16 (Needs QA)
- **Branch**: `daanish/daa-16-sign-up-user-row-profile-created`
- **Files modified (cumulative, merged to main)**:
  - `middleware.ts` — Clerk-only middleware; legacy ACCESS_CODE HMAC removed (Session 2, amended Session 4)
  - `app/layout.tsx` — ClerkProvider wrapper, PWA meta tags; AccessCodeGuard fallback removed (Session 2, amended Session 4)
  - `app/sign-in/[[...sign-in]]/page.tsx` — new Clerk sign-in page (Session 2)
  - `app/sign-up/[[...sign-up]]/page.tsx` — new Clerk sign-up page (Session 2)
  - `lib/server/db/schema.ts` — full Drizzle schema + `enrollments` table, `preferred_language`, sme role comment (Session 2, amended Session 4)
  - `lib/server/db/index.ts` — lazy-init Drizzle client (Session 2)
  - `lib/server/db/users.ts` — auth-agnostic user resolver (Session 2)
  - `lib/server/auth-mode.ts` — Clerk config detection; ACCESS_CODE references removed (Session 2, amended Session 4)
  - `lib/server/r2.ts` — R2 upload/delete/URL utilities (Session 2)
  - `app/api/webhooks/clerk/route.ts` — webhook with svix signature verification (Session 2)
  - `drizzle.config.ts` — Drizzle Kit config (Session 2)
  - `public/manifest.json` — PWA manifest (Session 2)
  - `railway.json` — Railway deployment config (Session 2)
  - `.env.example` — added Clerk, Neon, R2, Library Mode, Student Defaults sections (Session 2)
  - `package.json` — added @clerk/nextjs, drizzle-orm, @neondatabase/serverless, drizzle-kit, @aws-sdk/client-s3, svix, typecheck script (Session 2 + 3)
  - `PLAN.md` — §0 locked decisions, §0.6 schema, §0.8 mobile shell, §0.9 roles (Session 2 + 3)
  - `PROGRESS.md` — session logs (Session 2 + 3 + 4)
  - `AGENTS.md` — AFK protocol, dynamic DAG, change management, Linear sync rule, incremental saves, QA checklist rule (Session 2 + 3 + 4)
  - `CLAUDE.md` — mirrors AGENTS.md (Session 2 + 3 + 4)
  - `.cursor/rules/mobile-app-shell.mdc` — new agent rule (Session 2)
  - **Deleted (Session 4)**: `components/access-code-guard.tsx`, `components/access-code-modal.tsx`, `app/api/access-code/` (status + verify routes)
  - `lib/server/db/users.ts` — added student_profiles creation on getOrCreateUser (Session 5)
  - `tests/server/users.test.ts` — [NEW] 8 tests for getOrCreateUser + resolveUserByAuthId (Session 5)
  - `tests/server/clerk-webhook.test.ts` — [NEW] 8 tests for Clerk webhook handler (Session 5)
  - `AGENTS.md` — added never-commit rule (Session 5)
  - `WORKFLOW.md` — added never-commit rule to commit hygiene (Session 5)
  - `CLAUDE.md` — added never-commit rule (Session 5)

## Session log

### 2026-05-13 — Session 5 (DAA-16: sign-up creates user + profile)

**Phase**: Slice execution — DAA-16

**What was completed**:

1. **Fixed `getOrCreateUser()`**: Now inserts a `student_profiles` row (ON CONFLICT DO NOTHING) after upserting the `users` row. Every sign-up creates both records. Idempotent for webhook retries.
2. **16 new vitest tests** across two files:
   - `users.test.ts` (8 tests): user creation returns student role, two DB inserts (users + profiles), correct values, idempotent profile via DO NOTHING, user upsert via DO UPDATE, resolveUserByAuthId found/not-found.
   - `clerk-webhook.test.ts` (8 tests): missing secret → 500, missing svix headers → 400, invalid signature → 400, valid user.created → 200 + correct getOrCreateUser call, valid user.updated → 200, user.deleted → no DB call, DB error → 500 for retry, multi-email primary extraction.
3. **All tests mocked** — no real Neon connection needed. DB layer mocked via vi.mock.
4. **Linear updated**: DAA-16 → Needs QA, completion comment with QA checklist posted.
5. **Post-review fixes** (same session):
   - Wrapped user + profile inserts in `db.transaction()` for atomicity (prevents orphaned user rows).
   - Replaced duplicated schema definitions in tests with `vi.importActual()` passthrough to eliminate schema drift.
   - Added `transaction()` mock to test's `buildMockDb()`.
   - Added "never run git add/commit/push" rule to `AGENTS.md`, `WORKFLOW.md`, and `CLAUDE.md`.

**What was deferred and why**:
- Manual QA (sign up via Clerk, check Neon) — requires reviewer to verify with real credentials.
- No PR opened yet — waiting for QA pass before merge.

**Decisions made (with rationale)**:
- **Always create student_profiles for all users**: Everyone starts as `role='student'`. Admin/SME users get promoted later. Single Clerk app means the webhook fires for all sign-ups.
- **ON CONFLICT DO NOTHING for profiles**: Prevents duplicate rows when Clerk retries or concurrent webhook deliveries happen. Simpler than checking existence first.
- **Atomic transaction**: Both inserts now share a `db.transaction()` so a profile-insert failure rolls back the user row.
- **Never-commit rule**: Agents must never run git add/commit/push. Human reviews and commits manually.

**Test/lint/build status at session end**: `typecheck ✅`, `tests ✅` (333 total, 16 new), `build ✅`

**Tech debt observed**: Line ending warnings (LF vs CRLF) on Windows — cosmetic only.

### 2026-05-12 — Session 4 (Phase 0 amendments + workflow hardening)

**Phase**: Phase 0 — Infrastructure foundation

**What was completed**:

1. **AccessCodeGuard removal**: Deleted `access-code-guard.tsx`, `access-code-modal.tsx`, `app/api/access-code/` (status + verify routes). Cleaned `layout.tsx` and `middleware.ts` to be Clerk-only.
2. **Schema amendments**: Added `enrollments` table, `preferred_language` column to student_profiles, documented sme role via schema comment. Pushed to Neon.
3. **Agent workflow hardening** — four gaps fixed in AGENTS.md + CLAUDE.md:
   - Cumulative PROGRESS.md: "Overwrite means update, not erase" — file lists must stay cumulative across sessions.
   - Linear status transitions: explicitly must move status when work is fully complete.
   - Linear comments: changed "description or comment" to "description AND comment" for audit trail.
   - QA checklist: completion comments must include a `- [ ]` checklist for the reviewer.
4. **PR merged**: `phase-0-infrastructure` → `main`. DAA-5 moved to Done in Linear.
5. **QA passed**: Clerk sign-in loads, access-code routes gone, Neon tables verified.

**Tech debt observed**: Line ending warnings (LF vs CRLF) on Windows — not blocking, cosmetic only.

### 2026-05-12 — Session 3 (product interview)

**Phase**: pre-phase (product decisions)

**What was completed**:

Product interview covering 15 decisions that refine the plan. All decisions documented in `PLAN.md`. Key changes to the plan:

1. **Enrollment model**: University bulk pre-pays for a cohort. Admin uploads roll numbers + semester pairs. Students claim access during onboarding. Access is additive (never revoked). In-app payments (Razorpay) deferred to Phase 10+.
2. **ACCESS_CODE fully removed**: Both admin and student instances use Clerk (single Clerk application). `AccessCodeGuard` and `app/api/access-code/` to be deleted.
3. **App-level roles**: `users.role` expanded to `'student' | 'sme' | 'admin'`. No Clerk RBAC (stays on free tier). SMEs (Subject Matter Experts) can generate, publish, create units/lessons. Admins additionally manage semesters, subjects, enrollments, users, and deletions.
4. **Content language**: Classroom content in English. Students pick preferred chat language (en/hi/hinglish) during onboarding. Chat agents + TTS respond in that language.
5. **Semester gating**: Strict per-semester access, not cumulative. Students see only semesters they've paid for.
6. **Onboarding rewrite**: Roll number → lookup `enrollments` table → auto-populate `semester_ids`. Invalid/unclaimed roll number blocks onboarding.
7. **Session persistence**: Resume from last scene (server-side). Chat history ephemeral.
8. **Phase 9 expanded**: Now includes enrollment management UI (table + CSV upload), user/role management, role-gated admin navigation (SME vs admin).
9. **Pilot target**: Single university, B.Pharmacy program first.
10. **All student features retained**: Slides, TTS, chat, quizzes, widgets, PBL, whiteboard.
11. **Fresh content for pilot**: No migration of existing filesystem classrooms needed for launch.

**Schema changes** (to be applied to Phase 0 branch):
- New `enrollments` table (`roll_number`, `semester_id`, `granted_by`)
- `users.role`: `'student' | 'admin'` → `'student' | 'sme' | 'admin'`
- `student_profiles`: added `preferred_language text DEFAULT 'en'`

**What was deferred and why**:
- Phase 0 code amendments deferred to next session.
- In-app payments (Razorpay) — Phase 10+.
- SME scoping to specific subjects — Phase 10+ (when multiple departments coexist).

**Decisions made (with rationale)**:
- **Enrollment over self-select**: University pre-pays, admin controls access. Students don't choose semesters — they unlock what they've paid for. Matches Indian university fee structure.
- **App-level roles over Clerk RBAC**: Keeps Clerk on free tier, avoids vendor lock-in for authorization. Role logic stays in the codebase.
- **Single Clerk app over separate apps**: Simpler user directory. Role checks in the app handle separation.
- **ACCESS_CODE full removal**: Can't distinguish between users (needed for SME accounts). Clerk replaces it entirely.
- **SME can publish**: SMEs are content owners — create, review, publish is their workflow. Admin gatekeeps structural decisions (semesters, subjects).
- **Preferred language for chat (not content)**: Syllabus is English, but Hindi/Hinglish explanations aid comprehension. Huge differentiator for pharmacy students.
- **Chat history ephemeral**: Avoids new table, storage costs, privacy concerns. Students don't expect chat persistence.
- **Resume from last scene**: Essential for interrupted sessions. Already supported by `student_progress.current_scene_id`.

**Test/lint/build status at session end**: not run (docs-only changes this session).

**Tech debt observed**: Phase 0 branch code needs amendments before PR (ACCESS_CODE removal, enrollments table, preferred_language, sme role).

### 2026-05-12 — Session 2 (Phase 0 execution)

**Phase**: Phase 0 — Infrastructure foundation

**What was completed**:

- Created branch `phase-0-infrastructure`.
- Installed 6 dependencies: `@clerk/nextjs`, `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`, `@aws-sdk/client-s3`, `svix`.
- **Middleware**: replaced with Clerk `clerkMiddleware()` + `createRouteMatcher`. Public routes: `/sign-in`, `/sign-up`, `/api/health`, `/api/webhooks/clerk`, `/api/access-code`. Legacy ACCESS_CODE HMAC fallback preserved for admin instances without Clerk.
- **Layout**: wrapped with `<ClerkProvider>` (conditional on `CLERK_SECRET_KEY`). Added PWA meta: `manifest.json` link, `theme-color`, `apple-mobile-web-app-capable`, `viewport-fit=cover`, `maximum-scale=1`.
- **Auth pages**: `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx` using Clerk pre-built components.
- **Database schema** (`lib/server/db/schema.ts`): 8 tables — `users` (auth-portable), `semesters`, `subjects`, `units`, `lessons`, `classrooms` (JSONB + status), `student_profiles` (roll_number), `student_progress`. All with proper FK relations, indexes, and cascading deletes.
- **Drizzle client** (`lib/server/db/index.ts`): lazy-initialized via Proxy to prevent build-time crash when `DATABASE_URL` is unset.
- **User resolver** (`lib/server/db/users.ts`): `resolveUserByAuthId()` and `getOrCreateUser()` — auth-agnostic identity mapping.
- **R2 utility** (`lib/server/r2.ts`): `uploadToR2()`, `deleteFromR2()`, `getR2Url()` — direct R2 public URL serving.
- **Webhook** (`app/api/webhooks/clerk/route.ts`): svix signature verification, syncs `user.created`/`user.updated` to internal `users` table.
- **PWA manifest** (`public/manifest.json`): `display: standalone`, `orientation: portrait`, dark theme.
- **Railway config** (`railway.json`): Dockerfile builder, `/api/health` health check.
- **.env.example**: added 7 new sections (Clerk, Neon, R2, Library Mode, Student Defaults).
- **Mobile app shell spec**: added `PLAN.md` §0.8, created `.cursor/rules/mobile-app-shell.mdc` agent rule, updated AGENTS.md + CLAUDE.md.
- **Project rename note**: added to PLAN.md cross-phase notes — rename from "OpenMAIC" after all phases complete.
- **Build verification**: `pnpm build` passes — all routes registered including new Clerk routes.

**What was deferred and why**:

- Drizzle migration (`drizzle-kit push/migrate`) deferred until Neon credentials are configured in `.env.local`.
- PWA icons (192×192, 512×512) deferred — paths in manifest point to `/logos/icon-192.png` and `/logos/icon-512.png` which don't exist yet. Will generate during UI phase.
- `AccessCodeGuard` component preserved as-is; gating done via `AuthWrapper` in `layout.tsx` (only renders when Clerk is not configured).

**Decisions made (with rationale)**:

- **Lazy DB initialization**: Drizzle client uses a Proxy so `import { db }` works but the actual Neon connection isn't created until first query. This prevents build-time crashes when `DATABASE_URL` is unset (common in CI/CD).
- **Conditional ClerkProvider**: rather than erroring when Clerk env vars are missing, the layout checks `CLERK_SECRET_KEY` at render time and falls back to `AccessCodeGuard`. This lets the admin instance work without Clerk.
- **PWA manifest at Phase 0**: per §0.8, the mobile app shell contract starts early so all future UI work respects the phone-frame constraint.

**Test/lint/build status at session end**: `pnpm build` ✅ (exit code 0). All routes render. No runtime test yet (needs Clerk + Neon credentials).

**Tech debt observed**: same as prior sessions (`app/page.tsx` ~1300 lines; `components/stage.tsx` ~1000+ lines).

### 2026-05-12 — Session 1 (architecture decisions, plan v2)

**Phase**: pre‑phase (planning only)

**What was completed**:

- Analysed the full codebase for Phase 1 readiness: read `middleware.ts`, all 5 live API routes, `resolve-model.ts`, `provider-config.ts`, `.env.example`, `vitest.config.ts`, test structure.
- Identified that the original flat‑catalog plan was insufficient for the user's LMS requirements (university: 4 years × 8 semesters × multiple courses × units × lessons = ~1,500 classrooms).
- Identified that filesystem storage (`data/classrooms/*.json`) breaks at ~15–75 GB of media + 1,500 JSON files.
- Evaluated auth options: Clerk vs Logto vs Better Auth vs NextAuth. Selected **Clerk** (best Next.js integration, pre‑built UI, orgs/roles, JWT, 10K MAU free).
- Evaluated storage options: filesystem vs Postgres + blob. Selected **Neon (PostgreSQL) + Drizzle ORM** for structured data, **Cloudflare R2** for media (zero egress).
- Confirmed **Railway** as deployment target.
- Rewrote `PLAN.md` v2 with 10 phases incorporating: Clerk auth, Neon DB, R2 storage, hierarchical catalog (semester → subject → unit → lesson), student onboarding, progress tracking, Railway deployment.
- Fixed `/api/transcription` in v1 plan: moved from blocked to open list, added `STUDENT_DEFAULT_ASR_PROVIDER`.

**What was deferred and why**:

- No code changes yet. Phase 0 starts in the next session.
- Admin catalog UI deferred to Phase 9 (optional) — API‑first for now.

**Decisions made (with rationale)**:

- **Clerk over Logto/NextAuth**: best Next.js DX, pre‑built components save ~1 week of auth UI, JWT verification for API protection, orgs/roles for admin vs student. Free tier (10K MAU) sufficient for university department.
- **Internal `users` table for auth portability**: all tables FK to `users.id` (UUID), never to Clerk's external `user_xxx` ID. A `(auth_provider, auth_provider_id)` unique pair maps external → internal. Migrating from Clerk to Logto/NextAuth later requires updating only two columns + swapping middleware — zero FK changes across `student_profiles`, `student_progress`, or any future user‑referencing table.
- **Neon over Supabase**: user already has Neon experience, Drizzle ORM is lighter than Prisma, serverless Postgres fits Railway deployment. Classroom data stored as JSONB (preserves existing structure, enables queries).
- **R2 over S3**: zero egress fees critical for serving TTS audio + images to hundreds of students. S3‑compatible API means easy migration if needed.
- **Hierarchical catalog over flat list**: university use case requires semester → subject → unit → lesson structure. Flat catalog with tags was considered but insufficient for semester gating.
- **Per‑userId rate limiting (Clerk) over per‑IP**: solves school/corporate NAT problem where many students share one IP. Clerk session provides reliable identity.
- **Shared Neon DB between admin + student instances**: eliminates the "copy files to student server" workflow. Admin generates → writes to Neon → assigns to catalog → students see it immediately.
- **Phase 0 before Phase 1**: infrastructure (Clerk, Neon, R2) must be in place before server hardening can use Clerk userId for rate limiting.
- **ACCESS_CODE kept as fallback for admin instance**: admin instance doesn't need Clerk — it's one person. Student instance uses Clerk exclusively.

**Test/lint/build status at session end**: not run (no code changes this session).

**Tech debt observed**: same as prior sessions (`app/page.tsx` ~1300 lines; `components/stage.tsx` ~1000+ lines).

### 2026-05-11 — Session 0.1 (workflow setup, decisions locked)

**Phase**: pre‑phase (planning only)

**What was completed**:

- Locked the two open questions from session 0:
  1. `STUDENT_DEFAULT_MODEL = google:gemini-3-flash-preview` (cheap, fast, vision‑capable).
  2. Rate limits tuned for natural learning, not punitive: chat 120/hr + 10/min burst, quiz 60/hr, TTS 240/hr + 30/min burst. Plus a per‑message output cap (800 tokens) and a per‑(session × classroom) cap (80 messages). See `PLAN.md` §0.3.
- Added §0.4 to `PLAN.md` listing the broader student‑learning defaults beyond rate limits: model, temperature, reply length, live TTS chunking, thinking mode disabled, idle timeout, mobile audio policy (volume 0.7), captions on, discussion auto‑confirm.
- Moved the three planning files from `docs/` to repo root (the `docs/` folder was Warp‑restricted in this user's setup). Removed the now‑empty `docs/` directory.
- Created cross‑tool agent rule files so Cursor, Claude Code, Antigravity/Windsurf, Warp/Oz, etc. all pick up the workflow automatically:
  - `AGENTS.md` at repo root (cross‑tool emerging standard).
  - `CLAUDE.md` at repo root (Claude Code convention).
  - `.cursor/rules/library-mode.mdc` (Cursor — auto‑attaches to every chat in the repo).

**What was deferred and why**:

- No code changes yet. Phase 1 starts in the next session.

**Decisions made (with rationale)**:

- **Hourly windows + per‑minute burst caps** instead of single 15‑minute windows. A real lesson with a chatty student rarely hits 120 chat msgs/hr but easily hits 10 chat msgs/min in a clarifying exchange — so per‑minute is a small burst safety, not the primary cap.
- **Per‑message output cap 800 tokens**. Keeps AI agent replies tight and readable on phone screens; cheaper too.
- **Per‑session cap 80 messages per classroom** via an anonymous HMAC‑signed cookie. Catches one‑tab abuse without bothering school networks where many real students share an IP.
- **Thinking mode disabled** for student routes. Adds latency for no pedagogical benefit in friendly chat; admins can opt in.
- **TTS default volume 0.7, captions on**. Phones, public spaces, accessibility.
- **3 + cross‑tool files** instead of just 2 user‑facing docs. The pointer files (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/...`) all reference the same `WORKFLOW.md` so there's still one source of truth.

**Test/lint/build status at session end**: not run (no code changes this session).

**Tech debt observed**: same as session 0 (`app/page.tsx` ~1300 lines; `components/stage.tsx` ~1000+ lines). Phases 3 and 5 each include a preparatory split commit.

**Links**:

- Architecture overview: `ARCHITECTURE.md`
- Plan: `PLAN.md`
- Workflow contract: `WORKFLOW.md`
- Cross‑tool pointers: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/library-mode.mdc`

### 2026-05-11 — Session 0 (initial planning)

**Phase**: pre‑phase

**What was completed**:

- Verified the alternative GPT 5.5 plan against the actual codebase. Confirmed `data/classrooms/*.json` storage, `GET /api/classroom?id=` route, TTS endpoint location. Caught three inaccuracies in the GPT plan: quiz‑grade and PBL chat should stay open for students; the list endpoint must read fields from `record.stage`, not top‑level; settings should be trimmed not removed.
- Locked four high‑level decisions with the human:
  1. Live multi‑agent discussion / quizzes / PBL / Q&A / TTS stay enabled for students.
  2. Mode switch uses env flags (`LIBRARY_ONLY` + `NEXT_PUBLIC_LIBRARY_ONLY`), not `/admin` routes.
  3. Client persistence drops `Stage`/`Scene`/outline records on student build.
  4. UI must be mobile‑first LMS.
- First version of `WORKFLOW.md`, `PLAN.md`, `PROGRESS.md` written (then moved to root in session 0.1).
- Earlier in the conversation: created `ARCHITECTURE.md` and applied review corrections.

**What was deferred**: see session 0.1.

**Test/lint/build status**: not run (no code changes).
