# Implementation Status & Remaining MVP Plan

## Completed
- **Foundation**: Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui components, TypeScript, Vitest, ESLint.
- **Auth**: Single-user Supabase Auth Magic Link restricted by `ALLOWED_EMAIL`, server-side profile provisioning.
- **Database & RLS**: Core tables in migrations with RLS; anonymous read access for global content; explicit API grants for new Supabase projects.
- **Feed UI**: Calm, responsive feed (`/`, `/saved`, `/read-later`, `/history`), topic filtering, unread/read state styles.
- **Collectors**: RSS/Atom, Hacker News API, Reddit public RSS (multireddits, fetched sequentially), YouTube channel RSS. Per-collector failure isolation. No API keys needed.
- **AI Pipeline**: Gemini batch classification (25/request) and batch summaries (8/request), deterministic topic-aware ranking, feedback adjustment, event deduplication. Paced requests, retry on per-minute limits, stop on daily quota.
- **Personal State**: Persistent Read, Save, Read Later, and Not Interested feedback.
- **Daily Digest**: Taipei 22:00 idempotent digest of ~15–20 stories; optional LINE push.
- **Free-tier hosting** (2026-10-22): Cloudflare Workers via OpenNext; scheduled ingestion and digest via GitHub Actions (`.github/workflows/jobs.yml`).
- **Seeded sources**: Verified feeds for all 7 topics (`202610220001_free_tier_sources.sql`).

## Next Steps
1. **First deployment**: follow `DEPLOYMENT.md` (Supabase, Gemini key, GitHub secrets, Cloudflare).
2. **Tune after a few days of real data**: sources, `minimumScore`, schedule versus the actual Gemini quota.
3. **Discovery**: Gemini Google Search grounding targeting ~20% of daily content (new AI tools, indie bands, Taiwan photography locations).
4. **Settings & Job Observability**: `/settings` for topic weights; `/settings/jobs` for recent runs and source errors.
5. **Weekly Review**: Sunday evening summary of reading habits and saved topics.
