create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null check (email = lower(email)),
  line_user_id text unique,
  created_at timestamptz not null default now()
);

create unique index profiles_single_user_key on public.profiles ((true));

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  default_weight smallint not null check (default_weight between 1 and 5)
);

create table public.topic_preferences (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  weight smallint not null check (weight between 1 and 5),
  primary key (profile_id, topic_id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  url text unique not null,
  reliability_type text not null,
  primary_topic_id uuid references public.topics (id) on delete set null,
  is_discovery boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.raw_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  external_id text,
  url text not null,
  canonical_url text unique not null,
  title text not null,
  excerpt text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb
);

create unique index raw_items_source_external_id_key
  on public.raw_items (source_id, external_id)
  where external_id is not null;

create index raw_items_published_at_idx on public.raw_items (published_at desc);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  why_recommended text not null,
  primary_topic_id uuid not null references public.topics (id) on delete restrict,
  content_type text not null check (content_type in ('current', 'discovery')),
  interest_relevance smallint not null check (interest_relevance between 1 and 5),
  information_value smallint not null check (information_value between 1 and 5),
  importance smallint not null check (importance between 1 and 5),
  freshness smallint not null check (freshness between 1 and 5),
  discussion_popularity smallint not null check (discussion_popularity between 1 and 5),
  discovery_value smallint not null check (discovery_value between 1 and 5),
  final_score numeric(8, 4) not null,
  primary_url text not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index stories_feed_idx on public.stories (final_score desc, published_at desc);
create index stories_topic_idx on public.stories (primary_topic_id, final_score desc);

create table public.story_sources (
  story_id uuid not null references public.stories (id) on delete cascade,
  raw_item_id uuid not null references public.raw_items (id) on delete cascade,
  is_primary boolean not null default false,
  primary key (story_id, raw_item_id)
);

create unique index story_sources_one_primary_per_story
  on public.story_sources (story_id)
  where is_primary;

create table public.story_state (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  is_read boolean not null default false,
  is_saved boolean not null default false,
  is_read_later boolean not null default false,
  is_not_interested boolean not null default false,
  feedback_reason text check (
    feedback_reason in (
      'topic_not_interesting',
      'low_value_or_gossip',
      'too_technical',
      'already_knew',
      'poor_source',
      'do_not_recommend_type'
    )
  ),
  read_at timestamptz,
  saved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, story_id),
  constraint feedback_requires_not_interested check (
    feedback_reason is null or is_not_interested
  )
);

create index story_state_saved_idx
  on public.story_state (profile_id, saved_at desc)
  where is_saved;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table public.story_tags (
  story_id uuid not null references public.stories (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (story_id, tag_id)
);

create table public.digests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('daily', 'weekly')),
  date date not null,
  title text not null,
  summary text not null,
  created_at timestamptz not null default now(),
  unique (type, date)
);

create table public.digest_stories (
  digest_id uuid not null references public.digests (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  position smallint not null check (position > 0),
  primary key (digest_id, story_id),
  unique (digest_id, position)
);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed')),
  items_processed integer not null default 0 check (items_processed >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

insert into public.topics (id, slug, name, default_weight)
values
  ('10000000-0000-4000-8000-000000000001', 'ai', 'AI / LLM', 5),
  ('10000000-0000-4000-8000-000000000002', 'cybersecurity', 'Cybersecurity', 2),
  ('10000000-0000-4000-8000-000000000003', 'technology', 'Technology', 4),
  ('10000000-0000-4000-8000-000000000004', 'finance', 'Investment / Finance', 3),
  ('10000000-0000-4000-8000-000000000005', 'world', 'Major World Events', 4),
  ('10000000-0000-4000-8000-000000000006', 'music', 'Shoegaze / Dream Pop / Indie Rock', 5),
  ('10000000-0000-4000-8000-000000000007', 'photography', 'Photography', 4);

create function public.is_current_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
  );
$$;

revoke all on function public.is_current_profile() from public;
grant execute on function public.is_current_profile() to authenticated;

alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.topic_preferences enable row level security;
alter table public.sources enable row level security;
alter table public.raw_items enable row level security;
alter table public.stories enable row level security;
alter table public.story_sources enable row level security;
alter table public.story_state enable row level security;
alter table public.tags enable row level security;
alter table public.story_tags enable row level security;
alter table public.digests enable row level security;
alter table public.digest_stories enable row level security;
alter table public.job_runs enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

create policy "topics_read_for_current_profile"
  on public.topics for select to authenticated
  using ((select public.is_current_profile()));

create policy "sources_read_for_current_profile"
  on public.sources for select to authenticated
  using ((select public.is_current_profile()));

create policy "raw_items_read_for_current_profile"
  on public.raw_items for select to authenticated
  using ((select public.is_current_profile()));

create policy "stories_read_for_current_profile"
  on public.stories for select to authenticated
  using ((select public.is_current_profile()));

create policy "story_sources_read_for_current_profile"
  on public.story_sources for select to authenticated
  using ((select public.is_current_profile()));

create policy "tags_read_for_current_profile"
  on public.tags for select to authenticated
  using ((select public.is_current_profile()));

create policy "story_tags_read_for_current_profile"
  on public.story_tags for select to authenticated
  using ((select public.is_current_profile()));

create policy "digests_read_for_current_profile"
  on public.digests for select to authenticated
  using ((select public.is_current_profile()));

create policy "digest_stories_read_for_current_profile"
  on public.digest_stories for select to authenticated
  using ((select public.is_current_profile()));

create policy "job_runs_read_for_current_profile"
  on public.job_runs for select to authenticated
  using ((select public.is_current_profile()));

create policy "topic_preferences_select_own"
  on public.topic_preferences for select to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_current_profile()));

create policy "topic_preferences_insert_own"
  on public.topic_preferences for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select public.is_current_profile()));

create policy "topic_preferences_update_own"
  on public.topic_preferences for update to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_current_profile()))
  with check (profile_id = (select auth.uid()) and (select public.is_current_profile()));

create policy "topic_preferences_delete_own"
  on public.topic_preferences for delete to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_current_profile()));

create policy "story_state_select_own"
  on public.story_state for select to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_current_profile()));

create policy "story_state_insert_own"
  on public.story_state for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select public.is_current_profile()));

create policy "story_state_update_own"
  on public.story_state for update to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_current_profile()))
  with check (profile_id = (select auth.uid()) and (select public.is_current_profile()));

create policy "story_state_delete_own"
  on public.story_state for delete to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_current_profile()));
