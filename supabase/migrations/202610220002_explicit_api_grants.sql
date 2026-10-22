-- Supabase projects created after 2026-05-30 no longer grant the API roles
-- access to new tables by default, so PostgREST returns permission errors
-- until grants exist. These grants restore the previous defaults; Row Level
-- Security (enabled on every table) still decides which rows each role sees.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;
