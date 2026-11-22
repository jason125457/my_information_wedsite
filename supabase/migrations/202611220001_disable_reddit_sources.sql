-- Reddit stopped serving its public RSS feeds to unauthenticated clients.
-- Every Reddit fetch has answered HTTP 404 since 2026-11-17 18:24 UTC, and a
-- live check on 2026-11-22 returned 403/404/429 with
-- x-ratelimit-remaining: 0 from a home connection too, so this is not a
-- CI-only block. AGENTS.md forbids scraping workarounds and the project does
-- not use a Reddit OAuth app, so the Reddit sources are switched off.
-- The rows and their stories stay; set is_active back to true if Reddit
-- reopens its feeds.
-- Idempotent: every statement is an update keyed by source id.
update public.sources
set is_active = false
where id in (
  '20000000-0000-4000-8000-000000000104', -- r/LocalLLaMA + r/ClaudeAI + r/OpenAI
  '20000000-0000-4000-8000-000000000601', -- r/shoegaze + r/dreampop + r/indieheads
  '20000000-0000-4000-8000-000000000703'  -- r/streetphotography + r/astrophotography
);
