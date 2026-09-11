alter table public.story_state
  add column if not exists read_later_at timestamptz;

create index if not exists story_state_read_later_idx
  on public.story_state (profile_id, read_later_at desc)
  where is_read_later;

create index if not exists story_state_read_idx
  on public.story_state (profile_id, read_at desc)
  where is_read;
