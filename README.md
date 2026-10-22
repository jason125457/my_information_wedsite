# Personal Feed

Personal Feed is a single-user information filter built to surface a small number of worthwhile stories without infinite scroll. The repository now includes the application foundation, Supabase authentication and schema, Row Level Security, a database-backed feed, persistent reading actions, source collectors, the tested AI editing and ranking foundation, and the complete production ingestion pipeline with database persistence.

Discovery, weekly review, and LINE conversational features are deferred to later slices.

## Stack

Everything runs on free tiers with no payment method attached (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

- Next.js 16, TypeScript, and App Router, deployed to Cloudflare Workers with `@opennextjs/cloudflare`
- Tailwind CSS 4 with a shadcn/ui-compatible component structure
- Supabase PostgreSQL, Auth, and SSR clients
- Key-free collectors: RSS/Atom, Hacker News API, Reddit public RSS, YouTube channel RSS
- Google Gemini API (free AI Studio key) with batched structured JSON output and Zod validation
- Deterministic topic-aware ranking, feedback adjustment, and first-layer deduplication
- Database-backed For You, Saved, Read Later, and History views
- Public read-only Feed and Digest access; sign-in is optional for personal actions
- Scheduled ingestion (every 3 hours) and 22:00 Taipei Daily Digest in GitHub Actions; optional LINE push
- Vitest for authorization, collectors, AI pipeline, and migration-contract tests

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

## Running the jobs locally

With Supabase and `GEMINI_API_KEY` set in `.env.local`:

```powershell
npm run job:ingest
npm run job:digest
```

These are the same scripts GitHub Actions runs on schedule (`.github/workflows/jobs.yml`).

## Previewing the Cloudflare build

```powershell
npm run preview
```

This builds with OpenNext and serves the Worker locally in `workerd`, the Cloudflare runtime.

## Production configuration

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Supabase, the Gemini key, GitHub Actions secrets, and Cloudflare Workers. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), [PRODUCT.md](./PRODUCT.md), and [ARCHITECTURE.md](./ARCHITECTURE.md) for the remaining work and constraints.
