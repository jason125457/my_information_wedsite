# Implementation Status & Remaining MVP Plan

## Completed
- **Foundation**: Next.js 16 (App Router, Turbopack), Tailwind CSS 4, shadcn/ui components, TypeScript, Vitest, ESLint.
- **Auth**: Single-user Supabase Auth Magic Link restricted by `ALLOWED_EMAIL`, server-side profile provisioning.
- **Database & RLS**: 13 core tables created in migrations with RLS enabled; anonymous public read access for global content tables.
- **Feed UI**: Calm, responsive feed (`/`, `/saved`, `/read-later`, `/history`), topic filtering, unread/read state styles.
- **Collectors**: Official/API-first collectors for RSS/Atom, Hacker News API, Reddit OAuth, and YouTube Data API v3 with per-collector failure isolation.
- **AI Pipeline**: Cheap classification, deterministic topic-aware ranking, rule-based feedback adjustment, multi-level event deduplication, and grounded summarization.
- **Personal State**: Persistent Read, Save, Read Later, and Not Interested feedback with validation.
- **Daily Digest**: Taipei 22:00 (UTC 14:00) idempotent digest generation surfacing ~15–20 high-quality stories.
- **LINE Notification**: Notification-only push via LINE Messaging API linking back to web app.
- **Production Deployment**: Vercel configuration, cron definitions, and production environment separation.
- **Ingestion Persistence**:
  - `GET|POST /api/cron/ingest` guarded by `CRON_SECRET`.
  - Active source orchestration from database `sources` table.
  - In-memory deterministic prefiltering.
  - Database-level duplicate pre-checking against `raw_items` prior to AI processing (eliminating redundant API costs).
  - Deduplicated persistence to `raw_items`, `stories`, and `story_sources`.
  - Comprehensive per-source and aggregate execution metrics in `job_runs`.
  - 2-hour cron schedule `0 */2 * * *` in `vercel.json`.

## Current Focus
- Production Ingestion Pipeline & Collector Persistence verification and stability.

## Remaining MVP Plan (Next Steps)
1. **Discovery**:
   - OpenAI Web Search exploration targeting ~20% of daily content (new AI tools, indie bands, Taiwan photography locations).
2. **Settings & Job Observability**:
   - `/settings` for topic weights and preferences.
   - `/settings/jobs` for inspecting recent ingestion runs, digest generation, and collector errors.
3. **Weekly Review**:
   - Sunday evening digest analyzing reading habits, saved topics, and a weekly synthesis.
