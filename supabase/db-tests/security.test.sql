-- SPEC §4: RLS per owner, nothing readable by anon, unique constraints include
-- owner_id. The catalog checks loop over every table and function in public,
-- so a table added later without the rules fails here.

begin;

-- Catalog: rules every table in public must follow -----------------------------

do $$
declare
  t record;
  v_cmd text;
begin
  for t in
    select c.oid, c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) as owner
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    assert t.relrowsecurity, format('%s: row level security is off', t.relname);
    assert t.owner = 'postgres', format('%s: owner is %s, not postgres', t.relname, t.owner);

    assert exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t.relname and column_name = 'owner_id'
        and data_type = 'uuid' and is_nullable = 'NO' and column_default = 'auth.uid()'
    ), format('%s: owner_id must be uuid not null default auth.uid()', t.relname);

    -- One policy per command, for authenticated only, tied to auth.uid().
    foreach v_cmd in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      assert exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.relname and p.cmd = v_cmd
          and p.roles = '{authenticated}'
          and coalesce(p.qual, p.with_check) like '%owner_id = ( SELECT auth.uid()%'
          and (v_cmd not in ('INSERT', 'UPDATE') or p.with_check like '%owner_id = ( SELECT auth.uid()%')
      ), format('%s: missing owner policy for %s', t.relname, v_cmd);
    end loop;
    assert not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = t.relname and p.cmd = 'ALL'
    ), format('%s: FOR ALL policy; use one per command', t.relname);

    -- Every unique index except the primary key includes owner_id.
    assert not exists (
      select 1 from pg_index i
      where i.indrelid = t.oid and i.indisunique and not i.indisprimary
        and not exists (
          select 1 from pg_attribute a
          where a.attrelid = t.oid and a.attname = 'owner_id' and a.attnum = any(i.indkey)
        )
    ), format('%s: a unique constraint without owner_id', t.relname);

    -- Foreign keys to other public tables carry owner_id (composite key).
    assert not exists (
      select 1 from pg_constraint fk
      where fk.conrelid = t.oid and fk.contype = 'f'
        and fk.confrelid <> 'auth.users'::regclass
        and not exists (
          select 1 from pg_attribute a
          where a.attrelid = t.oid and a.attname = 'owner_id' and a.attnum = any(fk.conkey)
        )
    ), format('%s: a foreign key without owner_id', t.relname);
  end loop;
end
$$;

-- Catalog: privileges ---------------------------------------------------------

do $$
declare
  r record;
  priv text;
begin
  -- anon: nothing on any table, view or sequence in public.
  for r in
    select c.oid, c.relname, c.relkind from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      assert not has_table_privilege('anon', r.oid, priv),
        format('anon has %s on %s', priv, r.relname);
    end loop;
    -- authenticated: plain DML (RLS picks the rows), granted explicitly so it
    -- does not depend on the project's default grants. TRUNCATE skips RLS.
    if r.relkind in ('r', 'p') then
      foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        assert has_table_privilege('authenticated', r.oid, priv),
          format('authenticated lacks %s on %s', priv, r.relname);
      end loop;
      foreach priv in array array['TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        assert not has_table_privilege('authenticated', r.oid, priv),
          format('authenticated has %s on %s', priv, r.relname);
      end loop;
    end if;
  end loop;

  for r in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
  loop
    assert not has_sequence_privilege('anon', format('public.%I', r.relname), 'USAGE'),
      format('anon can use sequence %s', r.relname);
  end loop;

  -- anon: cannot execute any of our functions. Functions in public are RPC
  -- endpoints, so none may be SECURITY DEFINER (that would skip RLS), and all
  -- pin search_path.
  for r in
    select p.oid, p.proname, n.nspname, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
  loop
    assert not has_function_privilege('anon', r.oid, 'EXECUTE'),
      format('anon can execute %s.%s', r.nspname, r.proname);
    assert r.nspname <> 'public' or has_function_privilege('authenticated', r.oid, 'EXECUTE'),
      format('authenticated cannot execute public.%s', r.proname);
    assert r.nspname <> 'public' or not r.prosecdef,
      format('public.%s is SECURITY DEFINER', r.proname);
    assert 'search_path=""' = any(coalesce(r.proconfig, '{}')),
      format('%s.%s does not set search_path = ''''', r.nspname, r.proname);
  end loop;
end
$$;

-- anon in practice -------------------------------------------------------------

select tests.login_as_anon();
select tests.assert_raises('select * from public.accounts', '42501');
select tests.assert_raises('select * from public.transactions', '42501');
select tests.assert_raises('select * from public.postings', '42501');
select tests.assert_raises('select * from public.balance_checks', '42501');
select tests.assert_raises('select * from public.day_closures', '42501');
select tests.assert_raises($$insert into public.accounts (name, kind) values ('x', 'expense')$$, '42501');
select tests.logout();

-- Owner isolation ---------------------------------------------------------------
-- User A owns an account, a transaction, a balance check and a closed day.

select tests.login_as('00000000-0000-4000-8000-00000000000a');

insert into public.accounts (id, name, kind, subtype, is_own)
values ('10000000-0000-4000-8000-0000000000a1', 'Mandiri', 'asset', 'bank', true);
insert into public.accounts (id, name, kind)
values ('10000000-0000-4000-8000-0000000000a2', 'Makan', 'expense');

insert into public.transactions (id, occurred_at, status, source)
values ('20000000-0000-4000-8000-0000000000a1', '2026-10-15 12:00+07', 'confirmed', 'manual');
insert into public.postings (transaction_id, account_id, amount_sen) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', -2500000),
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2', 2500000);
insert into public.balance_checks (account_id, check_date, expected_sen, actual_sen, resolution)
values ('10000000-0000-4000-8000-0000000000a1', '2026-10-15', 100, 100, 'ok');
insert into public.day_closures (date) values ('2026-10-15');
select tests.run_deferred_checks();

do $$
begin
  assert (select owner_id from public.accounts where id = '10000000-0000-4000-8000-0000000000a1')
    = '00000000-0000-4000-8000-00000000000a', 'owner_id defaults to auth.uid()';
  assert (select count(*) from public.postings) = 2, 'A sees own postings';
end
$$;

-- User B sees nothing of A's and cannot change it.
select tests.login_as('00000000-0000-4000-8000-00000000000b');

do $$
begin
  assert (select count(*) from public.accounts) = 0, 'B sees no accounts';
  assert (select count(*) from public.transactions) = 0, 'B sees no transactions';
  assert (select count(*) from public.postings) = 0, 'B sees no postings';
  assert (select count(*) from public.balance_checks) = 0, 'B sees no balance checks';
  assert (select count(*) from public.day_closures) = 0, 'B sees no day closures';

  update public.accounts set name = 'hacked' where id = '10000000-0000-4000-8000-0000000000a1';
  delete from public.accounts where id = '10000000-0000-4000-8000-0000000000a2';
  delete from public.transactions where id = '20000000-0000-4000-8000-0000000000a1';
  delete from public.day_closures;
end
$$;

-- B cannot write rows in A's name.
select tests.assert_raises(
  $$insert into public.accounts (owner_id, name, kind)
    values ('00000000-0000-4000-8000-00000000000a', 'x', 'expense')$$,
  '42501');
select tests.assert_raises(
  $$insert into public.day_closures (owner_id, date)
    values ('00000000-0000-4000-8000-00000000000a', '2026-10-16')$$,
  '42501');

-- B cannot hang its own rows on A's account or transaction (composite foreign
-- keys), and the error is the same as for an id that does not exist at all,
-- so B cannot probe for A's ids either.
insert into public.accounts (id, name, kind)
values ('10000000-0000-4000-8000-0000000000b1', 'Makan', 'expense');
insert into public.transactions (id, occurred_at, status, source)
values ('20000000-0000-4000-8000-0000000000b1', '2026-10-15 12:00+07', 'draft', 'manual');

select tests.assert_raises(
  $$insert into public.postings (transaction_id, account_id, amount_sen)
    values ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000a1', 1)$$,
  '23503');
select tests.assert_raises(
  $$insert into public.postings (transaction_id, account_id, amount_sen)
    values ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-00000000ffff', 1)$$,
  '23503');
select tests.assert_raises(
  $$insert into public.postings (transaction_id, account_id, amount_sen)
    values ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000b1', 1)$$,
  '23503');
select tests.assert_raises(
  $$insert into public.balance_checks (account_id, check_date, expected_sen, actual_sen, resolution)
    values ('10000000-0000-4000-8000-0000000000a1', '2026-10-15', 0, 0, 'ok')$$,
  '23503');

-- Unique constraints are per owner: B's "Makan" did not clash with A's, and B
-- can close the same day A closed.
insert into public.day_closures (date) values ('2026-10-15');

-- B gives up its draft (it has no postings and would fail at commit).
delete from public.transactions where id = '20000000-0000-4000-8000-0000000000b1';

select tests.logout();

do $$
begin
  assert (select name from public.accounts where id = '10000000-0000-4000-8000-0000000000a1') = 'Mandiri',
    'A''s account was not renamed by B';
  assert (select count(*) from public.accounts where owner_id = '00000000-0000-4000-8000-00000000000a') = 2,
    'A''s accounts were not deleted by B';
  assert (select count(*) from public.transactions where owner_id = '00000000-0000-4000-8000-00000000000a') = 1,
    'A''s transaction was not deleted by B';
  assert (select count(*) from public.day_closures where owner_id = '00000000-0000-4000-8000-00000000000a') = 1,
    'A''s day closure was not deleted by B';
end
$$;

-- A cannot move a row to B by rewriting owner_id.
select tests.login_as('00000000-0000-4000-8000-00000000000a');
select tests.assert_raises(
  $$update public.day_closures set owner_id = '00000000-0000-4000-8000-00000000000b'$$,
  '42501');
select tests.logout();

-- Deleting a user who still has data is refused (ON DELETE RESTRICT).
select tests.assert_raises(
  $$delete from auth.users where id = '00000000-0000-4000-8000-00000000000a'$$,
  '23503');

rollback;
