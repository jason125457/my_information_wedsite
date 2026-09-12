# Personal Feed

Personal Feed is a single-user information filter built to surface a small number of worthwhile stories without infinite scroll. The repository now includes the application foundation, Supabase authentication and schema, Row Level Security, a database-backed feed, persistent reading actions, source collectors, the tested AI editing and ranking foundation, and the complete production ingestion pipeline with database persistence.

Discovery, weekly review, and LINE conversational features are deferred to later slices.

## Stack

- Next.js 16, TypeScript, and App Router
- Tailwind CSS 4 with a shadcn/ui-compatible component structure
- Supabase PostgreSQL, Auth, and SSR clients
- Official/API-first RSS, Hacker News, Reddit OAuth, and YouTube collectors
- Gemini Interactions API structured outputs with Zod validation
- Deterministic topic-aware ranking, feedback adjustment, and first-layer deduplication
- Database-backed For You, Saved, Read Later, and History views
- Public read-only Feed and Digest access; sign-in is optional for personal actions
- Idempotent 22:00 Taipei Daily Digest generation and notification-only LINE push
- Authenticated `/settings/jobs` history for ingestion and Digest results, with source-level errors
- Vitest for authorization and migration-contract tests
- Vercel as the target deployment platform

## Prerequisites

- Node.js 20.9 or newer (Node.js 24 is used for repository verification)
- npm 10 or newer
- Docker Desktop, if you want to run Supabase locally

## Local setup

1. Install dependencies.

   ```powershell
   npm install
   ```

2. Start the local Supabase services. The Supabase CLI can be run through `npx`; its first use may download the CLI.

   ```powershell
   npx supabase start
   ```

   The command applies `supabase/migrations/202609100001_initial_schema.sql`. To reapply the migration from a clean local database later, run:

   ```powershell
   npx supabase db reset
   ```

3. Copy the environment template.

   ```powershell
   Copy-Item .env.example .env.local
   ```

4. Get the local API keys.

   ```powershell
   npx supabase status -o env
   ```

   Put `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` into the corresponding `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` entries in `.env.local`. Keep `APP_URL=http://localhost:3000`, and set `ALLOWED_EMAIL` to the single address that may sign in.

5. Create that one user in Supabase Studio at [http://127.0.0.1:54323](http://127.0.0.1:54323) under **Authentication → Users**. Use the same address as `ALLOWED_EMAIL`. Public user creation is disabled, and the app requests Magic Links with `shouldCreateUser: false`.

6. Start the web app.

   ```powershell
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to browse without signing in. To test personal actions, request a Magic Link and read the local email in Inbucket at [http://127.0.0.1:54324](http://127.0.0.1:54324).

The callback provisions a `profiles` row through the server-only service-role client only after the authenticated email matches `ALLOWED_EMAIL`. RLS allows anonymous reads only for Feed/Digest content; personal state and job data remain private. Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code or commit `.env.local`.

## Verification

Run the full repository check:

```powershell
npm run verify
```

Or run each check independently:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

The Vitest suite checks the email allowlist and safe callback paths, confirms every initial table enables RLS, verifies that browser sessions cannot provision profiles, and validates collector, AI, ranking, feedback-input, deduplication, and digest-idempotency contracts. `npx supabase db reset` additionally validates the SQL against a live local PostgreSQL instance.

Pull requests also run a PostgreSQL 17 integration job in GitHub Actions. It applies every migration in order to a clean database and verifies anonymous, unprovisioned authenticated, owner, and service-role RLS behavior, including persistent story state, with `tests/database/rls.sql`.

## Production configuration

Create a Supabase project, apply the migration with the Supabase CLI, create only the allowed Auth user, and keep public email signups disabled. Configure the values from `.env.example` in Vercel, including an HTTPS `APP_URL`, and add `${APP_URL}/auth/callback` to the Supabase Auth redirect allowlist.

Reddit collection requires an approved official API application and the three `REDDIT_*` values in `.env.local`. YouTube collection requires `YOUTUBE_API_KEY`. RSS and Hacker News do not require credentials. Collector requests are server-side only; never expose API credentials in browser code.

Collectors share a common contract under `lib/collectors/`, return normalized candidates, and accept an injectable fetch implementation for deterministic tests. A failed source is isolated from the remaining collection run.

The production ingestion pipeline runs via `GET|POST /api/cron/ingest`, protected by `CRON_SECRET`. On the current Vercel Hobby deployment it runs daily at 20:00 Taipei (`0 12 * * *` UTC), ahead of the 22:00 Digest. The two-hour cadence remains a future target because Hobby does not accept more-than-daily cron expressions. The pipeline:
1. Loads active sources from the database (`sources` table).
2. Runs collectors concurrently with per-source error isolation.
3. Applies deterministic in-memory prefiltering (`prefilterCandidates`).
4. Checks existing canonical URLs and external IDs against `raw_items` in the database to filter out duplicates before AI processing (eliminating wasted API costs).
5. Passes novel candidates through cheap AI classification, topic ranking, and event deduplication.
6. Generates grounded summaries for worthwhile stories.
7. Persists new candidates to `raw_items` (upsert on `canonical_url`), creates `stories`, and links primary and secondary sources in `story_sources`.
8. Records execution metrics (fetched, filtered, duplicate, processed, and inserted counts, timings, and status) in `job_runs`.

Idempotency is strictly guaranteed: re-running ingestion or encountering duplicate URLs skips redundant processing without inserting duplicate records or inflating stories.

AI ingestion requires `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, and `GEMINI_MODEL_REASONING`; `GEMINI_MODEL_SEARCH` is reserved for future Discovery. For the user's current AI Studio limits, start with `gemini-3.1-flash-lite` for batched classification and `gemini-3.5-flash-lite` for summaries and ambiguous deduplication. Do not put the API key in Git, this README, or chat; set it as a sensitive Production environment variable in Vercel and redeploy. The application does not hardcode production model versions. Gemini calls use the stateless Interactions API (`store: false`), strict JSON schemas, runtime Zod validation, a conservative per-model 14 RPM start limit, batches of up to five classifications, at most 100 candidate classifications, 20 summaries, and 10 ambiguous AI deduplication reviews per run. Failed and deferred candidates remain eligible for a future run. A missing key or model skips ingestion before fetching. Actual Gemini quotas depend on the AI Studio project; free-tier content may be used by Google to improve its products. The scheduled job cannot be considered live until a real Gemini key is configured and an ingestion run succeeds.

For Daily Digest deployment, set `CRON_SECRET`, `APP_URL`, `LINE_CHANNEL_ACCESS_TOKEN`, and `LINE_TARGET_USER_ID`. Vercel calls the protected route at `14:00 UTC`, which is `22:00 Asia/Taipei`. A LINE failure records a partial job but does not remove the completed Digest. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), [PRODUCT.md](./PRODUCT.md), and [ARCHITECTURE.md](./ARCHITECTURE.md) for the remaining sequence and constraints.
