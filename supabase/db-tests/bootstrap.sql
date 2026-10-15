-- Minimal stand-in for what a Supabase project has before our migrations run,
-- so the migrations and their tests run on a plain Postgres (CI service
-- container or a local install) without the Supabase stack.
--
-- It mirrors only what our migrations and tests depend on:
-- - the API roles anon, authenticated and service_role;
-- - when psql variable auto_expose is true, the default privileges Supabase
--   gives those roles on schema public ("expose new tables" on, the cloud
--   default). They matter: without them a table is unreadable for lack of a
--   grant, and an anon or RLS test could pass for the wrong reason. run.sh
--   runs every test with auto_expose true and again with false, so the
--   migrations must work under either project setting;
-- - auth.users (id only, plus email for readability) and auth.uid(), which
--   reads the JWT claims the same way Supabase's does.
--
-- This is NOT Supabase. The verification queries run against the real project
-- after `supabase db push` close the remaining gap (see README).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

\if :auto_expose
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
\endif

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text
);

-- Same body as Supabase's auth.uid(): PostgREST puts the verified JWT claims in
-- request.jwt.claims (older versions used request.jwt.claim.sub).
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
