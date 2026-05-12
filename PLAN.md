# OpenMAIC Library Mode — Phased Plan (v2)

Convert OpenMAIC from "generate in your browser" to a **university LMS**. Students sign in via Clerk, complete onboarding (program, year, semester), and browse a hierarchical catalog of pre‑generated classrooms organised by **semester → subject → unit → lesson**. Live multi‑agent chat, quizzes, Q&A, PBL, and TTS remain available — backed by server‑held LLM keys. Admins run a separate instance (flags off) to author classrooms and organise the catalog.

> **Reading order**: skim §0, then jump to the active phase listed in `PROGRESS.md` → "Current status".

## §0. Locked decisions

- **Hierarchical catalog**: Semester → Subject → Unit → Lesson. Students only see semesters they have paid access to (via `enrollments` table).
- **Auth**: **Clerk** on both instances (admin + student). Single Clerk application shared by both. `ACCESS_CODE` HMAC system fully deprecated and removed.
- **Auth portability**: All tables FK to an internal `users` table (UUID PK), not Clerk's external ID. A `users.auth_provider` + `users.auth_provider_id` mapping allows migrating from Clerk without touching any other table.
- **Database**: **Neon (PostgreSQL)** via **Drizzle ORM**. Classroom data stored as JSONB. Catalog hierarchy in relational tables. Student profiles and progress server‑side.
- **Media storage**: **Cloudflare R2** (S3‑compatible, zero egress fees). TTS audio, images, thumbnails, videos.
- **Deployment**: **Railway** (Docker). No filesystem volumes needed — all persistent data in Neon + R2.
- **Live features stay on**: Live multi‑agent chat, PBL, quizzes, Q&A, TTS, ASR remain available to students. The server holds all LLM/TTS/ASR keys.
- **Default student LLM**: `google:gemini-3-flash-preview`. Configurable via `STUDENT_DEFAULT_MODEL`.
- **Two env flags**: `LIBRARY_ONLY` (server) and `NEXT_PUBLIC_LIBRARY_ONLY` (client). Flags off = admin instance. Flags on = student instance.
- **Both instances share the same Neon + R2**. Admin generates → writes to Neon/R2 → assigns to catalog → students see it. No file copying.
- **Rate limits**: per internal `users.id` (resolved from Clerk session) with hourly windows + per‑minute burst caps (see §0.4).
- **Mobile app shell**: Student UI is a native mobile app shell rendered in a web page (PWA‑installable). Fixed‑width column (`max-w-[420px]`), centered on desktop. No responsive breakpoints, no sidebars, no multi‑column. See §0.8 and `.cursor/rules/mobile-app-shell.mdc`.
- **Enrollment model**: University bulk pre‑pays for a cohort. Admin uploads approved roll numbers + semester pairs. Students sign up via Clerk, enter their roll number during onboarding, and auto‑unlock paid semesters. Access is additive — once a semester is unlocked, it is never revoked. In‑app payments (Razorpay) deferred to Phase 10+.
- **App‑level roles**: `users.role` = `'student' | 'sme' | 'admin'`. Authorization enforced by the application, not Clerk RBAC (stays on free tier). See §0.9.
- **Content language**: Classroom content is generated in English (matching university syllabus). Students choose a preferred chat language (English / Hindi / Hinglish) during onboarding; live chat agents and TTS respond in that language.
- **Session persistence**: Students resume from their last scene on return (via `student_progress.current_scene_id`). Chat history is ephemeral — fresh conversation each session.
- **Pilot target**: Single university, B.Pharmacy program. Multiple departments supported by the schema but not the initial launch scope.

## §0.1 Infrastructure stack

| Layer | Technology | Why |
|---|---|---|
| Auth | Clerk | Best Next.js integration, pre‑built UI, orgs/roles, JWT for API protection, 10K MAU free |
| Database | Neon (PostgreSQL) + Drizzle ORM | Serverless Postgres, branching for dev, type‑safe ORM |
| Media/Blob | Cloudflare R2 | S3‑compatible, zero egress, 10GB free |
| Hosting | Railway | Docker support, env management, health checks, custom domains |
| Student LLM | `google:gemini-3-flash-preview` | Cheap, fast, vision‑capable |

## §0.2 Env vars (referenced by multiple phases)

### Infrastructure
- `CLERK_SECRET_KEY` — Clerk backend secret.
- `CLERK_WEBHOOK_SECRET` — Clerk webhook signing secret. Required to verify webhook payloads (`svix`).
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk frontend key.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` — defaults to `/sign-in`.
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` — defaults to `/sign-up`.
- `DATABASE_URL` — Neon connection string (pooled).
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` — Cloudflare R2 credentials.
- `R2_PUBLIC_URL` — Public URL prefix for R2 objects. Media served directly from R2 (not proxied through Next.js) for zero server load. Requires R2 CORS configured to allow the app's origin.

### Library mode
- `LIBRARY_ONLY` — server‑only. When `true`, middleware blocks generation/admin routes.
- `NEXT_PUBLIC_LIBRARY_ONLY` — client‑visible. When `true`, bundle hides generation UI.
- `STUDENT_DEFAULT_MODEL` — default `google:gemini-3-flash-preview`.
- `STUDENT_DEFAULT_TTS_PROVIDER` — required when `LIBRARY_ONLY=true` if TTS is wanted.
- `STUDENT_DEFAULT_ASR_PROVIDER` — required when `LIBRARY_ONLY=true` if voice input is wanted.

### Rate limits
- `STUDENT_CHAT_RATE_LIMIT_HOUR` — default `120`.
- `STUDENT_CHAT_RATE_LIMIT_MINUTE` — default `10`.
- `STUDENT_QUIZ_RATE_LIMIT_HOUR` — default `60`.
- `STUDENT_TTS_RATE_LIMIT_HOUR` — default `240`.
- `STUDENT_TTS_RATE_LIMIT_MINUTE` — default `30`.
- `STUDENT_ASR_RATE_LIMIT_HOUR` — default `60`.
- `STUDENT_ASR_RATE_LIMIT_MINUTE` — default `5`.
- `STUDENT_CHAT_MAX_OUTPUT_TOKENS` — default `800`.
- `STUDENT_CHAT_SESSION_CAP` — max messages per user per classroom. Default `80`.

## §0.3 Route policy in library‑only mode

**Blocked** (middleware returns 403):
- `POST /api/classroom` (creation)
- All `app/api/generate/**` **except** `/api/generate/tts`
- `app/api/generate-classroom/**`
- `app/api/parse-pdf`, `app/api/web-search`
- `app/api/verify-{model,image,pdf,video}-provider`
- `app/api/azure-voices`, `app/api/server-providers`
- `POST/PUT/DELETE /api/admin/**` (catalog CRUD — admin only, blocked in student mode)

**Open** (with server‑side hardening):
- `GET /api/classroom` (read from Neon, only `status='published'` classrooms)
- `GET /api/catalog` (hierarchical catalog)
- `GET /api/classroom-media/[classroomId]/[...path]` (redirects to R2 public URL)
- `POST /api/chat`, `POST /api/pbl/chat`, `POST /api/quiz-grade`
- `POST /api/generate/tts`, `POST /api/transcription`
- `GET/PUT /api/student/profile` (student's own profile)
- `GET/POST /api/student/progress` (student's own progress)
- `GET /api/health`
- `/api/webhooks/clerk` (Clerk webhook — signature‑verified, no auth)

Pages: `/generation-preview` and `/admin/*` redirect to `/` when `LIBRARY_ONLY=true`.

## §0.4 Rate limits

Per internal `users.id` (resolved from Clerk session at request time). Falls back to IP for edge cases.

| Bucket | Default/hour | Burst/min | Why |
|---|---|---|---|
| Chat | 120 | 10 | ~30–60 turns per 60‑min lesson. 120/hr = headroom for two lessons. |
| Quiz grade | 60 | — | Rarely > 1 answer/min. |
| TTS | 240 | 30 | 1–3 TTS calls per agent reply. |
| ASR | 60 | 5 | Rarely > 1 voice message/min. |

**Per‑message caps**: `STUDENT_CHAT_MAX_OUTPUT_TOKENS=800`, `STUDENT_CHAT_SESSION_CAP=80` (per user × classroom).

## §0.5 Student learning defaults

Same as v1: default model `gemini-3-flash-preview`, temperature 0.6 chat / 0.2 quiz / 0.4 PBL, 800 token reply cap, TTS chunked by sentence, thinking disabled, idle timeout 30 min, volume 0.7, captions on, discussion auto‑confirm 8s.

## §0.6 Database schema overview

```sql
-- Identity (auth‑provider‑agnostic)
-- All user‑referencing tables FK here, never to Clerk's external ID.
-- To migrate auth providers: update auth_provider + auth_provider_id columns.
-- Everything else (profiles, progress, rate‑limit keys) stays unchanged.
users            (id UUID PK DEFAULT gen_random_uuid(),
                  auth_provider text NOT NULL DEFAULT 'clerk',  -- 'clerk' | 'logto' | 'nextauth' | ...
                  auth_provider_id text NOT NULL,               -- e.g. Clerk's user_xxx ID
                  email text,
                  display_name text,
                  avatar_url text,
                  role text NOT NULL DEFAULT 'student',          -- 'student' | 'sme' | 'admin'
                  created_at timestamptz DEFAULT now(),
                  updated_at timestamptz DEFAULT now(),
                  UNIQUE(auth_provider, auth_provider_id))

-- Catalog hierarchy (admin‑managed, all UUIDs)
semesters       (id UUID PK DEFAULT gen_random_uuid(),
                 name text NOT NULL, year int NOT NULL,
                 "order" int NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now())
subjects        (id UUID PK DEFAULT gen_random_uuid(),
                 semester_id UUID FK → semesters.id NOT NULL,
                 name text NOT NULL, code text,
                 description text, thumbnail_key text,
                 "order" int NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now())
units           (id UUID PK DEFAULT gen_random_uuid(),
                 subject_id UUID FK → subjects.id NOT NULL,
                 name text NOT NULL, description text,
                 "order" int NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now())
lessons         (id UUID PK DEFAULT gen_random_uuid(),
                 unit_id UUID FK → units.id NOT NULL,
                 classroom_id text FK → classrooms.id NOT NULL,
                 title text NOT NULL, description text,
                 "order" int NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now())

-- Classroom content (admin writes, student reads)
-- id is text (nanoid), matching the existing codebase's ID generation.
classrooms      (id text PK,     -- nanoid, e.g. "V1StGXR8_Z5jdHi6B-myT"
                 name text NOT NULL, description text, language text,
                 stage JSONB NOT NULL, scenes JSONB NOT NULL,
                 interactive_mode boolean DEFAULT false,
                 status text NOT NULL DEFAULT 'draft',          -- 'draft' | 'published' | 'archived'
                 created_at timestamptz DEFAULT now(),
                 updated_at timestamptz DEFAULT now())
classroom_media (id UUID PK DEFAULT gen_random_uuid(),
                 classroom_id text FK → classrooms.id NOT NULL,
                 path text NOT NULL, r2_key text NOT NULL,
                 content_type text, size_bytes bigint,
                 created_at timestamptz DEFAULT now())

-- Student data (FKs to users.id, not Clerk)
student_profiles (user_id UUID FK → users.id PK,
                  program text, year text, semester_ids text[],
                  roll_number text UNIQUE,                       -- university roll number
                  preferred_language text DEFAULT 'en',           -- 'en' | 'hi' | 'hinglish'
                  onboarding_completed boolean DEFAULT false,
                  created_at timestamptz DEFAULT now(),
                  updated_at timestamptz DEFAULT now())
student_progress (id UUID PK DEFAULT gen_random_uuid(),
                  user_id UUID FK → users.id,
                  classroom_id text FK → classrooms.id,
                  current_scene_id text,
                  scenes_completed int DEFAULT 0,
                  quiz_scores JSONB DEFAULT '{}',
                  started_at timestamptz DEFAULT now(),
                  last_accessed_at timestamptz,
                  completed_at timestamptz,
                  UNIQUE(user_id, classroom_id))

-- Enrollment / access control (admin-managed)
enrollments     (id UUID PK DEFAULT gen_random_uuid(),
                 roll_number text NOT NULL,
                 semester_id UUID FK → semesters.id NOT NULL,
                 granted_by text NOT NULL DEFAULT 'admin',       -- 'admin' | 'razorpay' (future)
                 created_at timestamptz DEFAULT now(),
                 UNIQUE(roll_number, semester_id))
```

**Notes**:
- `classrooms.id` is `text` (nanoid) to match the existing codebase. All catalog FKs to classrooms use `text`.
- `classrooms.status` gates visibility: `GET /api/classroom` only returns `published` classrooms in library‑only mode. Admin can see all statuses.
- `student_profiles.roll_number` is `UNIQUE` — universities identify students by roll number.
- `student_profiles.semester_ids` is **derived** from `enrollments` — populated during onboarding by looking up `enrollments WHERE roll_number = ?`. Not self‑selected by students.
- `student_profiles.preferred_language` determines the language used for live chat responses and TTS voice. Classroom slide content itself is always English.
- `enrollments` tracks paid semester access. Admin bulk‑uploads roll numbers + semester pairs (CSV or admin UI). Students claim access during onboarding by entering their roll number.
- `users.role` supports three values: `student` (default), `sme` (Subject Matter Expert — can generate, publish, manage units/lessons), `admin` (full access including semesters, subjects, enrollments, user management). See §0.9.
- `onboarding_completed` is also stored in Clerk `publicMetadata` (JWT‑accessible) so middleware can check it without a DB query on every request. DB stays the source of truth; Clerk metadata is a read cache.

### Auth migration path

To migrate from Clerk to another provider (e.g. Logto):
1. Set up new provider, import users (email + display_name from `users` table).
2. Update `users.auth_provider = 'logto'` and `users.auth_provider_id` to the new provider's ID.
3. Swap middleware + webhook handler.
4. All FKs (`student_profiles.user_id`, `student_progress.user_id`) remain valid — zero data migration.

## §0.7 Deployment (Railway)

- **Build**: `pnpm build` → Next.js standalone output via existing Dockerfile.
- **No volumes**: all persistent data in Neon + R2.
- **Env vars**: Clerk, Neon, R2, `LIBRARY_ONLY`, student defaults, LLM provider keys.
- **Health check**: `GET /api/health`.
- **Two Railway services**: one admin, one student — same Docker image, different env vars.
- **R2 media serving**: direct from R2 public URL (not proxied through Next.js). Configure R2 CORS to allow the app's origin. Zero server load for media.

## §0.8 Mobile app shell (student UI)

The student‑facing UI is a **native mobile app shell**, not a responsive website. It is installable as a **PWA** and must look/behave like a native app.

### Layout
- Target viewport: **360px** wide. Container: `max-w-[420px] mx-auto`.
- Desktop: centered phone‑frame on a dark/blurred background. No wider breakpoints.
- Full‑height screens: `min-h-[100dvh]`. Content scrolls within the frame.
- Safe areas: `env(safe-area-inset-*)` for notch/punch‑hole devices.

### Navigation (mobile‑native)
- **Top app bar**: 56px, title + optional action icons. Back arrow for sub‑screens.
- **Bottom tab bar**: 64px fixed, primary sections (Library / Progress / Profile).
- **Screen transitions**: horizontal slide forward/back, fade for tab switches.
- No breadcrumbs, no top nav links, no hamburger menus.

### Interaction patterns
- **Tap targets**: ≥44×44px, prefer 48×48px.
- **Cards**: 12–16px radius, subtle elevation, for list items and content.
- **Bottom sheets**: half/full‑height, drag handle, for secondary actions.
- **Full‑screen modals**: slide up from bottom for focused flows.
- **Pull‑to‑refresh**: catalog and progress screens.
- No web‑style dialogs, dropdowns, or hover tooltips.

### Touch behaviour (CSS)
```css
-webkit-tap-highlight-color: transparent;
touch-action: manipulation;
overscroll-behavior: none;
user-select: none; /* interactive elements only */
```

### Typography
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
- Base: 16px (prevents iOS input zoom). Spacing: 8px grid.

### PWA setup (Phase 0)
- `public/manifest.json`: `"display": "standalone"`, `"orientation": "portrait"`.
- `<meta name="theme-color">`, `<meta name="apple-mobile-web-app-capable" content="yes">`.
- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">`.
- App icons (192×192, 512×512).

### What NOT to do
- ❌ No `@media (min-width: 768px)` breakpoints for layout changes.
- ❌ No sidebars, multi‑column grids, or wide layouts.
- ❌ No hover‑only interactions.
- ❌ No browser‑style `<select>` or `<dialog>`.
- ❌ No tap targets < 44px.

Full agent rule: `.cursor/rules/mobile-app-shell.mdc`.

## §0.9 Roles & permissions

Three app-level roles in `users.role` (enforced by the application, not Clerk RBAC — stays on free tier):

| Capability | Student | SME | Admin |
|---|---|---|---|
| Browse library / play classrooms | ✅ | ✅ | ✅ |
| Generate classrooms | ❌ | ✅ | ✅ |
| Create/edit **units and lessons** | ❌ | ✅ | ✅ |
| Assign classrooms to catalog | ❌ | ✅ | ✅ |
| Publish classrooms (`status = 'published'`) | ❌ | ✅ | ✅ |
| Create/edit **semesters and subjects** | ❌ | ❌ | ✅ |
| Manage enrollments (CSV upload, add/remove roll numbers) | ❌ | ❌ | ✅ |
| Manage users & roles | ❌ | ❌ | ✅ |
| Delete published content | ❌ | ❌ | ✅ |

Both admin and student instances share the same Clerk application and Neon database. The `LIBRARY_ONLY` flag controls which UI is rendered and which API routes are accessible — not which users exist. An SME signing into the student instance sees the student library (useful for previewing). A student signing into the admin instance is blocked by role checks on all admin/generation APIs.

---

## Phase 0 — Infrastructure foundation

**Status**: Complete — pending PR
**Estimated work**: ~1.5 days
**Depends on**: none
**Branch**: `phase-0-infrastructure`

### Goal

Set up Clerk auth, Neon database with Drizzle ORM, Cloudflare R2 media storage, and Railway deployment config. After this phase the app boots with Clerk protecting all routes (replacing `ACCESS_CODE`), connects to Neon, and can upload/serve files from R2.

### What this phase delivers

- Clerk middleware replaces `ACCESS_CODE` HMAC system.
- Drizzle schema + migrations for the tables in §0.6.
- R2 upload/download utility (`lib/server/r2.ts`).
- Railway deployment config.
- Existing classroom generation still works on the admin instance (regression).

### Files to touch

- `middleware.ts` — replace ACCESS_CODE logic with `clerkMiddleware()`.
- `app/layout.tsx` — wrap with `<ClerkProvider>`.
- `app/sign-in/[[...sign-in]]/page.tsx` — **new**. Clerk sign‑in page.
- `app/sign-up/[[...sign-up]]/page.tsx` — **new**. Clerk sign‑up page.
- `app/api/webhooks/clerk/route.ts` — **new**. Syncs Clerk user events → `users` row + `student_profiles` row.
- `lib/server/db/users.ts` — **new**. `resolveUserByAuthId(provider, providerUserId)` → internal `users.id`. `getOrCreateUser()` for webhook upsert.
- `lib/server/db/index.ts` — **new**. Drizzle client + Neon connection.
- `lib/server/db/schema.ts` — **new**. Full Drizzle schema per §0.6.
- `lib/server/db/migrate.ts` — **new**. Migration runner.
- `drizzle.config.ts` — **new**. Drizzle Kit config.
- `lib/server/r2.ts` — **new**. `uploadToR2()`, `getR2Url()`, `deleteFromR2()`.
- `components/access-code-guard.tsx` — **delete**. No longer needed.
- `app/api/access-code/` — **delete**. `ACCESS_CODE` system fully deprecated.
- `.env.example` — add Clerk, Neon, R2 vars.
- `Dockerfile` — no changes needed (standalone output already works).
- `railway.json` — **new**. Railway service config.
- `public/manifest.json` — **new**. PWA manifest (`display: standalone`, `orientation: portrait`).
- `app/layout.tsx` — also add PWA meta tags (`theme-color`, `apple-mobile-web-app-capable`, `viewport` with `viewport-fit=cover`).

### Detailed steps

1. `pnpm add @clerk/nextjs` + `pnpm add drizzle-orm @neondatabase/serverless` + `pnpm add -D drizzle-kit` + `pnpm add @aws-sdk/client-s3`.
2. Create Clerk app at clerk.com. Get publishable + secret keys.
3. Replace `middleware.ts`: use `clerkMiddleware()` with `createRouteMatcher` for public routes (`/sign-in`, `/sign-up`, `/api/health`, `/api/webhooks/clerk`). All other routes require auth.
4. Wrap `app/layout.tsx` with `<ClerkProvider>`.
5. Create sign‑in/sign‑up pages using `<SignIn>` / `<SignUp>` components.
6. Create Drizzle schema (`lib/server/db/schema.ts`) matching §0.6 — `users` table first, then catalog + classroom + student tables.
7. Create `lib/server/db/users.ts` with `getOrCreateUser({ authProvider, authProviderId, email, displayName })` and `resolveUserByAuthId(provider, id)`. All downstream code uses the returned internal UUID.
8. Set up Neon project. Run `pnpm drizzle-kit push` to create tables.
9. Create `lib/server/r2.ts` with S3 SDK configured for R2 endpoint.
10. Create Clerk webhook route (verify signature via `CLERK_WEBHOOK_SECRET` + `svix`): on `user.created` → `getOrCreateUser()` → insert `student_profiles` row with `onboarding_completed=false`. On `user.updated` → sync email/displayName/avatar to `users` row. On `user.deleted` → soft‑delete or cascade.
11. Create `railway.json` with build/start commands and health check.
12. Update `.env.example` with all new vars.
13. Delete `AccessCodeGuard` component and `app/api/access-code/` routes. `ACCESS_CODE` fully deprecated.

### Acceptance criteria

- `pnpm dev` with Clerk keys set → sign‑in page shows, auth works.
- Drizzle schema pushes to Neon without errors.
- `uploadToR2('test.txt', buffer)` succeeds, `getR2Url('test.txt')` returns valid URL.
- Clerk webhook creates a `users` row + `student_profiles` row on sign‑up.
- `resolveUserByAuthId('clerk', clerkId)` returns the internal UUID.
- Both admin and student instances use Clerk auth (single Clerk app).
- `railway.json` valid.

### Out of scope

- Student onboarding flow (Phase 3).
- Classroom storage migration to Neon (Phase 2).
- LIBRARY_ONLY route blocking (Phase 1).

### Risks

- Clerk free tier: 10K MAU. Sufficient for university department. Monitor usage.
- Neon cold starts: first query after idle may be slow (~500ms). Use connection pooling.

---

## Phase 1 — Server hardening

**Status**: Not started
**Estimated work**: ~1 day
**Depends on**: Phase 0
**Branch**: `phase-1-server-hardening`

### Goal

Make the server safe for student exposure. With `LIBRARY_ONLY=true`, generation routes return 403, the five live routes use server‑held keys (ignoring client overrides), and rate limits per §0.4 are enforced per internal `users.id` (resolved from Clerk session).

### What this phase delivers

- `middleware.ts` extended with `LIBRARY_ONLY` route blocking (composes with Clerk).
- Five live routes (`/api/chat`, `/api/pbl/chat`, `/api/quiz-grade`, `/api/generate/tts`, `/api/transcription`) ignore client model/key params and resolve from server config.
- Rate limiting per Clerk userId (hourly + burst).
- Per‑user per‑classroom message cap (`STUDENT_CHAT_SESSION_CAP`), keyed by internal `users.id`.
- Page redirects for `/generation-preview` and `/admin/*`.

### Files to touch

- `middleware.ts` — extend Clerk middleware with `LIBRARY_ONLY` branch.
- `app/api/chat/route.ts` — server resolver + rate limit + session cap.
- `app/api/pbl/chat/route.ts` — same.
- `app/api/quiz-grade/route.ts` — same.
- `app/api/generate/tts/route.ts` — same (TTS provider). **Note**: server ignores the client's `ttsProviderId` and resolves from `STUDENT_DEFAULT_TTS_PROVIDER` env; consistent with chat/ASR override semantics.
- `app/api/transcription/route.ts` — same (ASR provider).
- `lib/server/runtime-flags.ts` — **new**. `isLibraryOnly()`.
- `lib/utils/runtime-flags.ts` — **new**. `IS_LIBRARY_MODE = process.env.NEXT_PUBLIC_LIBRARY_ONLY === 'true'` (client\u2011side counterpart).
- `lib/server/resolve-server-model.ts` — **new**. Forces `STUDENT_DEFAULT_MODEL`.
- `lib/server/resolve-server-asr.ts` — **new**. Forces `STUDENT_DEFAULT_ASR_PROVIDER`.
- `lib/server/rate-limit.ts` — **new**. Two‑tier limiter keyed by internal `users.id` (resolved via `resolveUserByAuthId()` from Phase 0).
- `.env.example` — add student default + rate limit vars.

### Detailed steps

1. Create `lib/server/runtime-flags.ts` exporting `isLibraryOnly()`.
2. Extend `middleware.ts`: after Clerk auth, if `LIBRARY_ONLY=true`:
   - Return 403 for blocked routes per §0.3.
   - Redirect `/generation-preview` and `/admin/*` to `/`.
3. Create `lib/server/resolve-server-model.ts`: `resolveStudentModel()` reads `STUDENT_DEFAULT_MODEL` (fallback `google:gemini-3-flash-preview`), calls existing `resolveModel()` with no client overrides.
4. Create `lib/server/resolve-server-asr.ts`: `resolveStudentASR()` reads `STUDENT_DEFAULT_ASR_PROVIDER`, resolves via `provider-config.ts`.
5. Update each of the five live routes: branch on `isLibraryOnly()`. If true, use server resolver, ignore all client params, cap output tokens (chat/PBL only). Resolve internal `users.id` via `auth().userId` → `resolveUserByAuthId()` for rate limiting.
6. Create `lib/server/rate-limit.ts`: two‑tier `Map<string, {count, windowStart}>` per bucket. Keyed by Clerk `userId`. Returns `{ allowed, retryAfter }`.
7. Wire rate limiting + session cap (per userId × classroomId) into routes. Session cap applies to chat/PBL/quiz only (not TTS/ASR).
8. Add env vars to `.env.example`.

### Acceptance criteria

- With `LIBRARY_ONLY` unset: `pnpm dev` works exactly as today (regression).
- With `LIBRARY_ONLY=true`:
  - `POST /api/generate/scene-content` → 403.
  - `POST /api/generate-classroom` → 403.
  - `POST /api/parse-pdf` → 403.
  - `/generation-preview` → redirects to `/`.
  - `POST /api/generate/tts` → reachable (not 403).
  - `POST /api/transcription` → reachable (not 403).
  - `/api/chat` with bogus `apiKey` body → works (server key used).
  - 11th chat call in one minute → 429 with `retry-after`.
  - 121st chat call in one hour → 429.
- Vitest covers: middleware allow/block matrix, resolve‑server‑model, resolve‑server‑asr, rate‑limit (both windows).

### Out of scope

- Any UI change.
- Catalog endpoints (Phase 2).
- Removing client header‑sending code (Phase 7).

### Risks

- `provider-config.ts` may not expose server LLM in the shape needed — refactor minimally.
- Rate limit Map is single‑process; document limitation. Fine for single Railway instance.

---

## Phase 2 — Classroom storage migration + catalog API

**Status**: Not started
**Estimated work**: ~1.5 days
**Depends on**: Phase 0
**Branch**: `phase-2-catalog-storage`

### Goal

Migrate classroom storage from filesystem to Neon + R2. Build the catalog CRUD API so admins can organise classrooms into semesters → subjects → units → lessons. The `GET /api/catalog` endpoint powers the student library home.

### What this phase delivers

- Classroom generation writes stage/scenes to `classrooms` table in Neon.
- Media (TTS audio, images, thumbnails) uploads to R2 via `classroom_media` records.
- `GET /api/classroom?id=` reads from Neon (falls back to filesystem for migration).
- `GET /api/classroom-media/[classroomId]/[...path]` proxies from R2.
- Admin CRUD API: `POST/PUT/DELETE /api/admin/catalog/{semesters,subjects,units,lessons}`.
- `GET /api/catalog?semester_id=` returns the hierarchical tree for a semester.

### Files to touch

- `lib/server/classroom-storage.ts` — rewrite: read/write to Neon.
- `lib/server/classroom-job-runner.ts` — write media to R2.
- `lib/server/classroom-media-generation.ts` — upload to R2.
- `app/api/classroom/route.ts` — read from Neon.
- `app/api/classroom-media/[classroomId]/[...path]/route.ts` — proxy from R2.
- `app/api/admin/catalog/` — **new**. CRUD routes for catalog hierarchy.
- `app/api/catalog/route.ts` — **new**. Public hierarchical read endpoint.
- `scripts/migrate-classrooms.mjs` — **new**. One‑time migration of filesystem classrooms to Neon + R2.

### Acceptance criteria

- New classroom generation stores data in Neon + media in R2.
- `GET /api/classroom?id=` returns classroom from Neon.
- `GET /api/catalog?semester_id=sem-1` returns `{ subjects: [{ units: [{ lessons }] }] }`.
- Admin can create semester → subject → unit → lesson via API.
- Migration script moves existing `data/classrooms/*.json` to Neon + R2.
- Vitest covers: classroom CRUD, catalog hierarchy, R2 upload/download.

### Out of scope

- Admin catalog UI (Phase 9).
- Student‑facing library UI (Phase 4).

---

## Phase 3 — Student onboarding

**Status**: Not started
**Estimated work**: ~1.5 days
**Depends on**: Phase 0, Phase 2
**Branch**: `phase-3-onboarding`

### Goal

After Clerk sign‑up, students complete an enrollment‑based onboarding flow. They enter their university roll number, which is looked up against the `enrollments` table (pre‑populated by admin). Matching semesters are auto‑unlocked. Students also pick their program, year, and preferred chat language. `onboarding_completed=true` is written to both the DB and Clerk `publicMetadata` so middleware can check it from the JWT without a DB query.

### What this phase delivers

- Onboarding page at `/onboarding` (mobile app shell, multi‑step form).
- Middleware redirects to `/onboarding` if `onboarding_completed=false`.
- Step 1: Program + year selection.
- Step 2: Roll number entry → lookup against `enrollments` table → auto‑populate `semester_ids`.
- Step 3: Preferred language selection (English / Hindi / Hinglish).
- If roll number has zero enrollments → "Your roll number isn't activated yet. Contact your department." Cannot proceed.
- If roll number is already claimed by another account → "This roll number is already registered." Cannot proceed.
- `student_profiles` row updated with program, year, semester_ids (from enrollments), roll_number, preferred_language.
- Clerk `publicMetadata.onboardingCompleted = true` set via Clerk Backend API.
- `GET /api/catalog` filters by student's semester_ids.
- Profile screen in settings (view program, year, roll number, language; switch active semester for browsing).
- Semester switcher in library UI — student can browse any unlocked semester.

### Files to touch

- `app/onboarding/page.tsx` — **new**. Multi‑step form (mobile app shell).
- `app/api/student/profile/route.ts` — **new**. GET/PUT for student profile.
- `app/api/student/enrollments/route.ts` — **new**. GET enrollments for a roll number (used during onboarding).
- `middleware.ts` — redirect to `/onboarding` if `onboarding_completed=false`.
- `app/api/catalog/route.ts` — filter by student's semester_ids.

### Acceptance criteria

- New user signs up → redirected to `/onboarding`.
- Valid roll number with enrollments → semesters auto‑unlocked, onboarding completes.
- Invalid/missing roll number → blocked with helpful message.
- Already‑claimed roll number → blocked.
- `GET /api/catalog` returns only semesters matching the student's profile.
- Student can view profile and switch active semester for browsing.
- Preferred language stored in `student_profiles.preferred_language`.

### Out of scope

- Admin enrollment management UI (Phase 9). Enrollments pre‑populated via API/scripts for now.
- In‑app payments (Phase 10+).

---

## Phase 4 — Hierarchical library home

**Status**: Not started
**Estimated work**: ~1.5 days
**Depends on**: Phase 2, Phase 3
**Branch**: `phase-4-library-home`

### Goal

When `NEXT_PUBLIC_LIBRARY_ONLY=true`, the home page renders a **mobile app shell** (see §0.8): a phone‑frame library with subjects → units → lessons, filtered by the student's semester(s). Includes progress indicators. The UI must feel like a native app, not a responsive website.

### What this phase delivers

- Mobile app shell container (`max-w-[420px]`, centered, dark desktop background).
- **Top app bar** (56px) with greeting / semester selector.
- **Bottom tab bar** (64px) — Library / Progress / Profile tabs.
- Library screen: subject cards (card‑based grid), unit expansion, lesson rows.
- "Continue learning" section (in‑progress classrooms) at top of Library tab.
- Progress indicators (completed, in‑progress, not started) on lesson rows.
- Search within semester scope.
- Pull‑to‑refresh on catalog.
- All tap targets ≥44×44px. Bottom sheets for filters/sort.

### Files to touch

- `app/page.tsx` — branch on `IS_LIBRARY_MODE`.
- `components/library/app-shell.tsx` — **new**. The `max-w-[420px]` centered container + dark desktop backdrop.
- `components/library/top-app-bar.tsx` — **new**. 56px app bar.
- `components/library/bottom-tabs.tsx` — **new**. 64px bottom tab bar.
- `components/library/library-screen.tsx` — **new**. Library tab content.
- `components/library/subject-card.tsx` — **new**. Card with thumbnail, title, lesson count.
- `components/library/unit-accordion.tsx` — **new**. Expandable unit.
- `components/library/lesson-row.tsx` — **new**. Row with progress badge, 48px height.
- `components/library/progress-screen.tsx` — **new**. Progress tab content.
- `components/library/profile-screen.tsx` — **new**. Profile tab content.
- `lib/hooks/use-catalog.ts` — **new**. Fetches `/api/catalog`.
- `lib/hooks/use-progress.ts` — **new**. Fetches student progress.

### Acceptance criteria

- Flag on: home shows mobile app shell centered on desktop.
- Shell is `max-w-[420px]` — no wider even on 4K screen.
- Top app bar (56px) + bottom tabs (64px) always visible.
- Tapping subject card → expands units → shows lessons.
- Tapping lesson → `/classroom/<id>`.
- Progress badges show on lessons.
- No horizontal scroll on 360×740.
- All tap targets ≥44×44px.
- Pull‑to‑refresh reloads catalog.
- Flag off: home renders today's generator UI (regression).
- Lighthouse mobile ≥ 90.

---

## Phase 5 — Read‑only classroom playback

**Status**: Not started
**Estimated work**: ~1 day
**Depends on**: Phase 1, Phase 2
**Branch**: `phase-5-readonly-playback`

### Goal

`/classroom/[id]` becomes read‑only when `NEXT_PUBLIC_LIBRARY_ONLY=true`: fetches from Neon (not IndexedDB), media from R2, no generation, progress tracked server‑side.

### What this phase delivers

- Classroom loads from Neon via `GET /api/classroom?id=`.
- Media (audio, images) loaded from R2 URLs.
- No IndexedDB writes for stages/scenes.
- `useSceneGenerator` returns no‑ops.
- Progress writes to `student_progress` table on scene completion.
- "Not available yet" state for incomplete classrooms.

### Files to touch

- `app/classroom/[id]/page.tsx` — fetch from server, skip IndexedDB.
- `lib/hooks/use-scene-generator.ts` — no‑op when flag on.
- `lib/store/stage.ts` — gate IndexedDB writes.
- `components/stage.tsx` — force `mode='playback'`; hide export/rename.
- `app/api/student/progress/route.ts` — **new**. Record progress.

### Acceptance criteria

- Flag on: classroom loads from Neon, media from R2, no IndexedDB writes.
- Scene completion updates `student_progress`.
- Incomplete classroom → "not available" state.
- Flag off: unchanged (regression).

---

## Phase 6 — Mobile app classroom shell

**Status**: Not started
**Estimated work**: ~2 days
**Depends on**: Phase 5
**Branch**: `phase-6-mobile-playback`

### Goal

`<Stage>` renders inside the mobile app shell (§0.8) when `NEXT_PUBLIC_LIBRARY_ONLY=true`. Chat → bottom sheet (half/full snap), sidebar → full‑screen drawer (slide from right), whiteboard → full‑screen overlay, player controls → fixed bar above bottom tabs. All within the `max-w-[420px]` frame.

### Files to touch

- `components/stage.tsx` — wrap in app shell; force mobile layout.
- `components/chat/chat-area.tsx` — render as bottom sheet with drag handle.
- `components/scene-sidebar.tsx` — full‑screen drawer (slide from right, no overlay dimming main content on small sheets).
- `components/whiteboard/` — full‑screen overlay with close button.
- `components/quiz/quiz-renderer.tsx` — full‑screen card stack.
- `components/pbl/pbl-renderer.tsx` — full‑screen with bottom sheet for tools.
- `components/roundtable/discussion-card.tsx` — card‑based, 48px touch targets.
- `components/player-controls.tsx` — fixed bar (48px) above bottom tabs.

### Acceptance criteria

- Classroom renders inside `max-w-[420px]` shell on all screens.
- Chat bottom sheet: snaps to 40% and 90% height, drag handle visible.
- Scene sidebar: full‑screen drawer, swipe‑right to dismiss.
- No horizontal scroll on 360×740.
- All tap targets ≥44×44px.
- Player controls always visible above bottom tabs (not hidden behind sheet).
- Discussion card works on phone with large touch targets.
- Smooth 60fps sheet/drawer animations.
- Flag off: unchanged (regression).

---

## Phase 7 — Strip student bundle

**Status**: Not started
**Estimated work**: ~0.5 day
**Depends on**: Phase 4, Phase 6
**Branch**: `phase-7-bundle-strip`

### Goal

When `NEXT_PUBLIC_LIBRARY_ONLY=true`, the bundle contains only student‑safe settings and none of the generation/config/provider UI. Same as original Phase 6 spec.

### Files to touch

Same as original Phase 6 file list (settings, agent-bar, generation-toolbar, outlines-editor, header stripping for x-api-key etc., plus use-audio-recorder.ts for ASR).

### Acceptance criteria

Same as original Phase 6 (bundle excludes generation components, settings shows only student sections, no x-api-key headers, regression check).

---

## Phase 8 — Tests, docs, deploy

**Status**: Not started
**Estimated work**: ~1 day
**Depends on**: Phases 0–7
**Branch**: `phase-8-tests-docs`

### Goal

Ship‑ready: E2E tests, docs, Railway deployment verified.

### What this phase delivers

- Playwright E2E: sign‑up → onboarding → library browse → playback → chat.
- Vitest gaps filled.
- README updated with new architecture (Clerk, Neon, R2, Railway).
- `CHANGELOG.md` updated.
- Railway deployment tested end‑to‑end.

### Acceptance criteria

- All tests green.
- Railway deploy boots student + admin instances.
- README reviewed.

---

## Phase 9 — Admin dashboard

**Status**: Not started
**Estimated work**: ~3 days
**Depends on**: Phase 2
**Branch**: `phase-9-admin-dashboard`

### Goal

Admin UI for managing the catalog, enrollments, and users. Role‑gated: SMEs see generation + catalog assignment tools; admins see everything.

### What this phase delivers

- **Catalog organiser**: Drag‑and‑drop hierarchy for semesters → subjects → units → lessons. Assign generated classrooms to catalog slots. Thumbnail upload. SMEs can create/edit units and lessons; only admins can create/edit semesters and subjects.
- **Enrollment management**: Table view of roll numbers + semester access. Add/remove individual entries. CSV bulk upload (columns: `roll_number, semester_name`). Admin‑only.
- **User management**: List users, view roles, promote student → SME or SME → admin. Admin‑only.
- **Role‑gated navigation**: SMEs see a stripped admin UI (generation + catalog only). Admins see the full dashboard.

### Acceptance criteria

- Admin can create semester → subject → unit → lesson via UI.
- Admin can upload CSV of roll numbers → enrollments created.
- Admin can change a user's role.
- SME sees only generation + catalog tools (no enrollments, no user management).
- All admin APIs check `users.role` and return 403 for insufficient permissions.

---

## Cross‑phase notes

### Definition of "regression check"

For each phase, run with `LIBRARY_ONLY` **unset** (Clerk configured, admin or SME role) and confirm: home renders generator UI, classroom generation works, playback works.

### Where the flag is read

- **Server**: `process.env.LIBRARY_ONLY === 'true'` via `isLibraryOnly()` from `lib/server/runtime-flags.ts`.
- **Client**: `process.env.NEXT_PUBLIC_LIBRARY_ONLY === 'true'` via `IS_LIBRARY_MODE` from `lib/utils/runtime-flags.ts`.

### Publish workflow (admin → student)

1. Admin generates classroom on admin instance → stored in Neon + R2 (shared) with `status='draft'`.
2. Admin reviews the classroom, then sets `status='published'` via catalog API.
3. Admin assigns lesson entry under semester → subject → unit.
4. Students in that semester see it immediately — no file copying, no deploy.

### Things explicitly **not** in this project (MVP)

Content moderation beyond admin review, classroom versioning, analytics dashboards, native mobile app, search ranking ML, push notifications, federated auth.

### Future: Multi‑university & payments (Phase 10+)

The MVP launches with one university (B.Pharmacy). Future phases will add:

- **University entity**: `organizations` table representing each partner university. Each university gets its own catalog scope and enrollment pool.
- **In‑app payments**: Razorpay integration for individual student payments (semester unlock) and/or university bulk billing.
- **Tiers**: Free tier with limited access (e.g., 3 classrooms, limited chat). Paid tier (via university or individual) unlocks full access.
- **SME scoping**: When multiple departments coexist, scope SMEs to specific subjects via a `sme_subjects` join table.
- **Multi‑department catalog**: Separate catalog trees per department/program within a university.

The `enrollments` table and roll‑number‑based access model (already in MVP) are designed to extend cleanly into this multi‑university model.

### Future: Project rename

After all phases are complete, rename the project from "OpenMAIC" to the final product name. This includes:
- Replace all occurrences of "OpenMAIC" / "openmaic" in code, configs, docs, and comments.
- Update `README.md` to reflect the current active codebase, architecture, and setup instructions.
- Update `package.json` `name` field.
- Update PWA manifest (`public/manifest.json`) app name.
- Final commit + deploy to Railway.

Do this **after** Phase 8 (or 9) is merged — not during any earlier phase.
