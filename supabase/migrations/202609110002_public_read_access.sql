create policy "topics_public_read"
  on public.topics for select to anon
  using (true);

create policy "sources_public_read"
  on public.sources for select to anon
  using (true);

create policy "raw_items_public_read"
  on public.raw_items for select to anon
  using (true);

create policy "stories_public_read"
  on public.stories for select to anon
  using (true);

create policy "story_sources_public_read"
  on public.story_sources for select to anon
  using (true);

create policy "tags_public_read"
  on public.tags for select to anon
  using (true);

create policy "story_tags_public_read"
  on public.story_tags for select to anon
  using (true);

create policy "digests_public_read"
  on public.digests for select to anon
  using (true);

create policy "digest_stories_public_read"
  on public.digest_stories for select to anon
  using (true);

-- Profiles, story state, preferences, and job logs intentionally remain private.
