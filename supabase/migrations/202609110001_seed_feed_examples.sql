insert into public.sources (
  id, name, type, url, reliability_type, primary_topic_id, is_discovery
)
values
  ('20000000-0000-4000-8000-000000000001', 'OpenAI', 'rss', 'https://openai.com/news/rss.xml', 'official', '10000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000002', 'Next.js', 'rss', 'https://nextjs.org/feed.xml', 'official', '10000000-0000-4000-8000-000000000003', true),
  ('20000000-0000-4000-8000-000000000003', 'Apple Newsroom', 'rss', 'https://www.apple.com/newsroom/rss-feed.rss', 'official', '10000000-0000-4000-8000-000000000003', true),
  ('20000000-0000-4000-8000-000000000004', 'Slowdive on Bandcamp', 'rss', 'https://slowdive.bandcamp.com', 'official', '10000000-0000-4000-8000-000000000006', true)
on conflict (id) do nothing;

insert into public.raw_items (
  id, source_id, external_id, url, canonical_url, title, excerpt, published_at, raw_metadata
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'hello-gpt-4o',
    'https://openai.com/index/hello-gpt-4o/',
    'https://openai.com/index/hello-gpt-4o',
    'Hello GPT-4o',
    'OpenAI introduced GPT-4o with text, audio, image, and video capabilities.',
    '2024-05-13T00:00:00Z',
    '{"seed": true}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'next-15',
    'https://nextjs.org/blog/next-15',
    'https://nextjs.org/blog/next-15',
    'Next.js 15',
    'The Next.js team announced version 15 with React 19 support and changed caching defaults.',
    '2024-10-21T00:00:00Z',
    '{"seed": true}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    'apple-intelligence',
    'https://www.apple.com/uk/newsroom/2024/06/introducing-apple-intelligence-for-iphone-ipad-and-mac/',
    'https://www.apple.com/uk/newsroom/2024/06/introducing-apple-intelligence-for-iphone-ipad-and-mac',
    'Introducing Apple Intelligence for iPhone, iPad, and Mac',
    'Apple introduced a personal intelligence system integrated with its major operating systems.',
    '2024-06-10T00:00:00Z',
    '{"seed": true}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000004',
    'everything-is-alive',
    'https://slowdive.bandcamp.com/album/everything-is-alive',
    'https://slowdive.bandcamp.com/album/everything-is-alive',
    'everything is alive',
    'Slowdive’s fifth album pairs shoegaze textures with a brighter sense of movement.',
    '2023-09-01T00:00:00Z',
    '{"seed": true}'::jsonb
  )
on conflict (id) do nothing;

insert into public.stories (
  id, title, summary, why_recommended, primary_topic_id, content_type,
  interest_relevance, information_value, importance, freshness,
  discussion_popularity, discovery_value, final_score, primary_url, published_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    'Hello GPT-4o',
    'OpenAI introduced GPT-4o as a model designed to work across text, audio, image, and video inputs. The announcement includes demonstrations, evaluations, and links to the accompanying system card.',
    'A useful primary-source reference for how multimodal AI products began moving toward real-time interaction.',
    '10000000-0000-4000-8000-000000000001', 'discovery', 5, 4, 3, 1, 3, 5, 91,
    'https://openai.com/index/hello-gpt-4o/', '2024-05-13T00:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'Next.js 15',
    'The Next.js team announced version 15 with React 19 support, stable Turbopack development, and changed caching defaults. The release notes collect the framework changes and migration details in one place.',
    'This is a concise official overview of changes that shaped modern App Router projects.',
    '10000000-0000-4000-8000-000000000003', 'discovery', 4, 4, 3, 1, 2, 4, 82,
    'https://nextjs.org/blog/next-15', '2024-10-21T00:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'Introducing Apple Intelligence for iPhone, iPad, and Mac',
    'Apple introduced a personal intelligence system integrated with iOS, iPadOS, and macOS. Its announcement outlines language and image features alongside the company’s Private Cloud Compute approach.',
    'It connects a major platform shift with the privacy model Apple chose to emphasize in its official announcement.',
    '10000000-0000-4000-8000-000000000003', 'discovery', 4, 4, 4, 1, 3, 4, 80,
    'https://www.apple.com/uk/newsroom/2024/06/introducing-apple-intelligence-for-iphone-ipad-and-mac/', '2024-06-10T00:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'everything is alive',
    'Slowdive’s fifth album pairs the band’s familiar shoegaze language with a brighter sense of movement and renewal. The Bandcamp page offers the complete track list, credits, and direct listening options.',
    'A strong discovery pick when you want atmospheric guitar music without chasing whatever is newest today.',
    '10000000-0000-4000-8000-000000000006', 'discovery', 5, 4, 2, 1, 3, 5, 89,
    'https://slowdive.bandcamp.com/album/everything-is-alive', '2023-09-01T00:00:00Z'
  )
on conflict (id) do nothing;

insert into public.story_sources (story_id, raw_item_id, is_primary)
values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', true),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', true),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', true),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', true)
on conflict (story_id, raw_item_id) do nothing;
