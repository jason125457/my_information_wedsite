-- Free-tier source set: every feed below is public RSS/Atom and needs no API key.
-- Reddit and YouTube use their public feeds (see createCollectorFromSource).
-- Feeds were checked live on 2026-10-22.

-- Placeholder examples that are not real feeds or are off-profile.
update public.sources
set is_active = false
where id in (
  '20000000-0000-4000-8000-000000000002', -- Next.js blog
  '20000000-0000-4000-8000-000000000004'  -- Slowdive Bandcamp page (not a feed)
);

insert into public.sources (
  id, name, type, url, reliability_type, primary_topic_id, is_discovery, config
)
values
  -- AI / LLM
  ('20000000-0000-4000-8000-000000000101', 'Google AI Blog', 'rss',
   'https://blog.google/technology/ai/rss/', 'official',
   '10000000-0000-4000-8000-000000000001', false, '{}'),
  ('20000000-0000-4000-8000-000000000102', 'Hugging Face Blog', 'rss',
   'https://huggingface.co/blog/feed.xml', 'official',
   '10000000-0000-4000-8000-000000000001', false, '{}'),
  ('20000000-0000-4000-8000-000000000103', 'Simon Willison', 'rss',
   'https://simonwillison.net/atom/everything/', 'known_blog',
   '10000000-0000-4000-8000-000000000001', false, '{}'),
  ('20000000-0000-4000-8000-000000000104', 'r/LocalLLaMA + r/ClaudeAI + r/OpenAI', 'reddit',
   'https://www.reddit.com/r/LocalLLaMA+ClaudeAI+OpenAI', 'reddit',
   '10000000-0000-4000-8000-000000000001', false,
   '{"listing": "top", "period": "day"}'),

  -- Cybersecurity
  ('20000000-0000-4000-8000-000000000201', 'Krebs on Security', 'rss',
   'https://krebsonsecurity.com/feed/', 'original_reporting',
   '10000000-0000-4000-8000-000000000002', false, '{}'),
  ('20000000-0000-4000-8000-000000000202', 'The Hacker News', 'rss',
   'https://feeds.feedburner.com/TheHackersNews', 'major_media',
   '10000000-0000-4000-8000-000000000002', false, '{}'),

  -- Technology
  ('20000000-0000-4000-8000-000000000301', 'Ars Technica', 'rss',
   'https://feeds.arstechnica.com/arstechnica/index', 'major_media',
   '10000000-0000-4000-8000-000000000003', false, '{}'),
  ('20000000-0000-4000-8000-000000000302', 'The Verge', 'rss',
   'https://www.theverge.com/rss/index.xml', 'major_media',
   '10000000-0000-4000-8000-000000000003', false, '{}'),

  -- Investment / Finance
  ('20000000-0000-4000-8000-000000000401', 'Federal Reserve Press Releases', 'rss',
   'https://www.federalreserve.gov/feeds/press_all.xml', 'official',
   '10000000-0000-4000-8000-000000000004', false, '{}'),
  ('20000000-0000-4000-8000-000000000402', 'CNBC Top News', 'rss',
   'https://www.cnbc.com/id/100003114/device/rss/rss.html', 'major_media',
   '10000000-0000-4000-8000-000000000004', false, '{}'),
  ('20000000-0000-4000-8000-000000000403', '中央社 財經', 'rss',
   'https://feeds.feedburner.com/rsscna/finance', 'major_media',
   '10000000-0000-4000-8000-000000000004', false, '{}'),

  -- Major World Events
  ('20000000-0000-4000-8000-000000000501', 'BBC World', 'rss',
   'https://feeds.bbci.co.uk/news/world/rss.xml', 'major_media',
   '10000000-0000-4000-8000-000000000005', false, '{}'),
  ('20000000-0000-4000-8000-000000000502', 'The Guardian World', 'rss',
   'https://www.theguardian.com/world/rss', 'major_media',
   '10000000-0000-4000-8000-000000000005', false, '{}'),
  ('20000000-0000-4000-8000-000000000503', '中央社 國際', 'rss',
   'https://feeds.feedburner.com/rsscna/intworld', 'major_media',
   '10000000-0000-4000-8000-000000000005', false, '{}'),

  -- Shoegaze / Dream Pop / Indie Rock (discovery)
  ('20000000-0000-4000-8000-000000000601', 'r/shoegaze + r/dreampop + r/indieheads', 'reddit',
   'https://www.reddit.com/r/shoegaze+dreampop+indieheads', 'reddit',
   '10000000-0000-4000-8000-000000000006', true,
   '{"listing": "top", "period": "week"}'),
  ('20000000-0000-4000-8000-000000000602', 'Pitchfork News', 'rss',
   'https://pitchfork.com/feed/feed-news/rss', 'major_media',
   '10000000-0000-4000-8000-000000000006', true, '{}'),
  ('20000000-0000-4000-8000-000000000603', 'Stereogum', 'rss',
   'https://www.stereogum.com/feed/', 'major_media',
   '10000000-0000-4000-8000-000000000006', true, '{}'),
  ('20000000-0000-4000-8000-000000000604', 'Bandcamp Daily', 'rss',
   'https://daily.bandcamp.com/feed', 'known_blog',
   '10000000-0000-4000-8000-000000000006', true, '{}'),
  ('20000000-0000-4000-8000-000000000605', 'KEXP (YouTube)', 'youtube',
   'https://www.youtube.com/channel/UC3I2GFN_F8WudD_2jUZbojA', 'official',
   '10000000-0000-4000-8000-000000000006', true, '{}'),

  -- Photography (discovery)
  ('20000000-0000-4000-8000-000000000701', 'PetaPixel', 'rss',
   'https://petapixel.com/feed/', 'major_media',
   '10000000-0000-4000-8000-000000000007', true, '{}'),
  ('20000000-0000-4000-8000-000000000702', 'DPReview', 'rss',
   'https://www.dpreview.com/feeds/news.xml', 'major_media',
   '10000000-0000-4000-8000-000000000007', true, '{}'),
  ('20000000-0000-4000-8000-000000000703', 'r/streetphotography + r/astrophotography', 'reddit',
   'https://www.reddit.com/r/streetphotography+astrophotography', 'reddit',
   '10000000-0000-4000-8000-000000000007', true,
   '{"listing": "top", "period": "week"}')
on conflict (id) do nothing;
