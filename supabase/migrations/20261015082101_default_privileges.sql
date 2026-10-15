-- Default privileges for schema public. No business tables yet (Phase 1).
--
-- SPEC §4: no table may be readable by the anon role, and RLS is on for every
-- table. Out of the box Supabase grants ALL on every new table, sequence and
-- function in public to anon, authenticated and service_role, which leaves RLS
-- as the only barrier between anon and the data. This migration takes anon out
-- of those defaults, so a table created later without RLS (or with a policy
-- mistake) is still unreadable without a login.
--
-- This does NOT replace RLS: every table migration must still
-- `enable row level security` and declare explicit policies for authenticated.

-- New objects created by the migration role in public: nothing for anon.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;

-- Postgres also grants EXECUTE on every new function to PUBLIC (which anon is
-- part of). That default is global, so it can only be revoked globally.
-- authenticated and service_role keep their explicit grants from Supabase.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Anything that already exists in public (nothing should, on a new project).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
