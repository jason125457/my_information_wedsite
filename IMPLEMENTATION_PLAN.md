# Implementation Status & Remaining MVP Plan

## Completed
- **Foundation**: Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui components, TypeScript, Vitest, ESLint.
- **Auth**: Single-user Supabase Auth Magic Link restricted by `ALLOWED_EMAIL`, server-side profile provisioning.
- **Database & RLS**: Core tables in migrations with RLS; anonymous read access for global content; explicit API grants for new Supabase projects.
- **Feed UI**: Calm, responsive feed (`/`, `/saved`, `/read-later`, `/history`), topic filtering, unread/read state styles.
- **Collectors**: RSS/Atom, Hacker News API, Reddit public RSS (multireddits, one per run in rotation), YouTube channel RSS, feed images. Per-collector failure isolation. No API keys needed.
- **AI Pipeline**: Gemini judges only topics and four editorial scores (40/request); content type, fact status, freshness and popularity are computed in code. Promotional prefilter, per-run caps (10 stories, 3 per topic, 2 per source), Chinese-title retry, batch summaries (8/request), topic-aware ranking, feedback adjustment, event deduplication. Paced requests, retry on per-minute limits, stop on daily quota.
- **Personal State**: Persistent Read, Save, Read Later, and Not Interested feedback.
- **Daily Digest**: Taipei 22:00 idempotent digest of ~15–20 stories; optional LINE push.
- **Free-tier hosting** (2026-10-22): Cloudflare Workers via OpenNext; scheduled ingestion and digest via GitHub Actions (`.github/workflows/jobs.yml`).
- **Seeded sources**: Verified feeds for all 7 topics (`202610220001_free_tier_sources.sql`).
- **Saved search**: keyword, topic, source and saved-date filters on `/saved` (client-side over up to 500 saved stories).
- **Settings** (`/settings`): topic weights 1–5 (stored in `topic_preferences`, used by ingestion ranking) and per-source on/off switches.
- **Today's progress**: the front page tracks how much of today's edition (lead, side list, first grid page, discovery band) has been read and says when you're done.
- **PWA**: web app manifest, icons (`public/icons`, `app/icon.png`, `app/apple-icon.png`), theme colours; installable to the home screen.
- **Weekly Review** (`/weekly/[date]`, Sunday 21:07 Taipei via `npm run job:weekly`): ten topic-balanced picks, one Gemini summary paragraph, discoveries, and the owner's week (reads, saves, skips, top topics, unread Read Later).
- **Dark mode**: tokens follow the system, with a header toggle (system / light / dark) stored in the browser and applied before first paint.
- **Job history**: `/settings/jobs` shows recent ingestion and digest runs to the signed-in owner. Ingestion records a partial job without fetching when Gemini is not configured.

## Next Steps
1. **First deployment**: follow `DEPLOYMENT.md` (Supabase, Gemini key, GitHub secrets, Cloudflare).
2. **Tune after a few days of real data**: sources, `minimumScore`, schedule versus the actual Gemini quota.
3. **Discovery**: programmatic sources are live (Google News search RSS for Taiwan photography and shoegaze, Show HN, Gorilla vs. Bear); consider Gemini search grounding later if quota allows.
