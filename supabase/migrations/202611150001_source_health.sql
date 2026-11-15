-- Source health clean-up (feeds re-checked live on 2026-11-15).
-- Idempotent: every statement is an update keyed by source id.

-- DPReview's old URL now answers 301 -> https://www.dpreview.com/feed/
-- (200, newest item 2026-11-14). Point at the final URL so we do not depend on a redirect.
update public.sources
set url = 'https://www.dpreview.com/feed/'
where id = '20000000-0000-4000-8000-000000000702';

-- Routine news feeds are not "discovery": discovery sources skip the 72h freshness
-- window, so these flooded the feed with ordinary news. Discovery stays for
-- Bandcamp Daily, the Reddit communities, the Google News location searches,
-- Gorilla vs. Bear and Show HN, which surface new bands, tools and places.
update public.sources
set is_discovery = false
where id in (
  '20000000-0000-4000-8000-000000000602', -- Pitchfork News
  '20000000-0000-4000-8000-000000000603', -- Stereogum
  '20000000-0000-4000-8000-000000000701', -- PetaPixel
  '20000000-0000-4000-8000-000000000702', -- DPReview
  '20000000-0000-4000-8000-000000000003'  -- Apple Newsroom (official press releases)
);
