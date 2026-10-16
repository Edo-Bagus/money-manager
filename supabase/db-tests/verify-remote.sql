-- Read-only checks for the REAL Supabase project, after `supabase db push`.
-- Paste into Dashboard → SQL Editor (runs as postgres) and run one block at a
-- time. Nothing here changes data. Not run by run.sh.

-- 1. Every table in public: owner postgres, RLS on.
--    Expect 5 rows (accounts, balance_checks, day_closures, postings,
--    transactions), owner = postgres, rls_enabled = true.
select c.relname as table_name,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
order by 1;

-- 2. Policies. Expect 20 rows: 4 per table (SELECT, INSERT, UPDATE, DELETE),
--    roles = {authenticated}, qual/with_check = (owner_id = ( SELECT auth.uid() AS uid)).
select tablename, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- 3. What anon may do. Expect 0 rows from each query.
select c.relname, p.privilege
from pg_class c
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
  as p(privilege)
where c.relnamespace = 'public'::regnamespace
  and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  and has_table_privilege('anon', c.oid, p.privilege);

select n.nspname, p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- Expect false.
select has_schema_privilege('anon', 'private', 'USAGE') as anon_can_use_private;

-- 4. anon in practice. Expect: ERROR 42501 permission denied for table accounts
--    (not an empty result: empty would mean only RLS stood in the way).
begin;
set local role anon;
select count(*) from public.accounts;
rollback;

-- 5. Functions. Expect: owner = postgres on every row; every public.* has
--    security_definer = false; the three private.* balance functions true,
--    private.replace_postings false; every row has
--    config = {"search_path=\"\""} (search_path pinned to empty).
--    The owner matters: `supabase db push` connects through a temporary login
--    role, and a SECURITY DEFINER function runs as its owner. Owned by anyone
--    but postgres (the table owner), the balance check would be subject to
--    RLS and might not see every posting.
select n.nspname, p.proname, pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer, p.proconfig as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
order by 1, 2;

-- Expect postgres.
select pg_get_userbyid(nspowner) as private_schema_owner
from pg_namespace where nspname = 'private';

-- 6. After logging out and in once: the default accounts exist.
--    Expect expense 13, income 4, equity 2 (per user; one user here).
select owner_id, kind, count(*)
from public.accounts
where system_key is not null
group by owner_id, kind
order by owner_id, kind;
