alter table public.sources
  add column if not exists config jsonb not null default '{}'::jsonb;

insert into public.sources (
  id, name, type, url, reliability_type, primary_topic_id, is_discovery, config
)
values
  (
    '20000000-0000-4000-8000-000000000005',
    'Hacker News Top',
    'hacker_news',
    'https://news.ycombinator.com',
    'community',
    '10000000-0000-4000-8000-000000000003',
    false,
    '{"list": "topstories"}'::jsonb
  )
on conflict (id) do nothing;
