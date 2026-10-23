-- Programmatic discovery sources (no AI web search, no API keys).
-- Google News search feeds turn keyword queries into RSS; "when:Nd" keeps
-- them recent. Feeds were checked live on 2026-10-23.

-- YouTube's channel feed now answers 404/500 intermittently (also from CI).
update public.sources
set is_active = false
where id = '20000000-0000-4000-8000-000000000605'; -- KEXP (YouTube)

insert into public.sources (
  id, name, type, url, reliability_type, primary_topic_id, is_discovery, config
)
values
  -- Taiwan photography locations
  ('20000000-0000-4000-8000-000000000704', 'Google 新聞：台灣攝影景點', 'rss',
   'https://news.google.com/rss/search?q=%E5%8F%B0%E7%81%A3%20%E6%94%9D%E5%BD%B1%E6%99%AF%E9%BB%9E%20when%3A30d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
   'unknown', '10000000-0000-4000-8000-000000000007', true, '{"maxItems": 15}'),
  ('20000000-0000-4000-8000-000000000705', 'Google 新聞：台灣銀河星空', 'rss',
   'https://news.google.com/rss/search?q=%E9%8A%80%E6%B2%B3%20%E6%94%9D%E5%BD%B1%20%E5%8F%B0%E7%81%A3%20when%3A60d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
   'unknown', '10000000-0000-4000-8000-000000000007', true, '{"maxItems": 10}'),
  ('20000000-0000-4000-8000-000000000706', 'Google 新聞：台灣季節賞景', 'rss',
   'https://news.google.com/rss/search?q=%E5%8F%B0%E7%81%A3%20%E8%B3%9E%E8%8A%B1%20OR%20%E8%B3%9E%E6%A5%93%20OR%20%E8%8A%92%E8%8A%B1%20%E6%99%AF%E9%BB%9E%20when%3A30d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
   'unknown', '10000000-0000-4000-8000-000000000007', true, '{"maxItems": 15}'),

  -- Shoegaze / dream pop / indie discovery (replaces KEXP)
  ('20000000-0000-4000-8000-000000000606', 'Gorilla vs. Bear', 'rss',
   'https://www.gorillavsbear.net/feed/',
   'known_blog', '10000000-0000-4000-8000-000000000006', true, '{}'),
  ('20000000-0000-4000-8000-000000000607', 'Google News: shoegaze / dream pop', 'rss',
   'https://news.google.com/rss/search?q=shoegaze%20OR%20%22dream%20pop%22%20when%3A14d&hl=en-US&gl=US&ceid=US:en',
   'unknown', '10000000-0000-4000-8000-000000000006', true, '{"maxItems": 15}'),

  -- New tools people are sharing
  ('20000000-0000-4000-8000-000000000105', 'Hacker News Show HN', 'hacker_news',
   'https://news.ycombinator.com/show',
   'community', '10000000-0000-4000-8000-000000000001', true, '{"list": "showstories"}')
on conflict (id) do nothing;
