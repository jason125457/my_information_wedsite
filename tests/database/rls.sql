\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('20000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('20000000-0000-4000-8000-000000000002', 'other@example.com');

insert into public.profiles (id, email)
values ('20000000-0000-4000-8000-000000000001', 'owner@example.com');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"email":"owner@example.com"}', true);

do $$
begin
  if (select count(*) from public.topics) <> 7 then
    raise exception 'the provisioned owner must be able to read all seeded topics';
  end if;
end;
$$;

insert into public.topic_preferences (profile_id, topic_id, weight)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  5
);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"email":"other@example.com"}', true);

do $$
begin
  if (select count(*) from public.profiles) <> 0 then
    raise exception 'an unprovisioned user must not read the owner profile';
  end if;
  if (select count(*) from public.topics) <> 0 then
    raise exception 'an unprovisioned user must not read global feed data';
  end if;

  begin
    insert into public.topic_preferences (profile_id, topic_id, weight)
    values (
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      1
    );
    raise exception 'an unprovisioned user unexpectedly wrote owner preferences';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback;

begin;
set local role anon;
do $$
begin
  if (select count(*) from public.topics) <> 0 then
    raise exception 'anonymous users must not read feed data';
  end if;
end;
$$;
rollback;

begin;
set local role service_role;
do $$
begin
  if (select count(*) from public.topics) <> 7 then
    raise exception 'service_role must retain ingestion access';
  end if;
end;
$$;
rollback;
