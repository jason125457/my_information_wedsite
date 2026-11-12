-- AI-written key points (Traditional Chinese) so a story can be understood
-- without opening the original. Derived text only; full articles are never stored.
alter table public.stories
  add column if not exists key_points text[] not null default '{}';
