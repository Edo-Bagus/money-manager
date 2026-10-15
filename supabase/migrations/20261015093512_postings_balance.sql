-- SPEC §5: every transaction has at least two postings, and they sum to zero.
--
-- Enforced by deferred constraint triggers, i.e. at COMMIT, so a transaction
-- and its postings can be written in any order inside one database
-- transaction (the RPCs in the next migration do that). Each PostgREST request
-- is its own database transaction, which is why the app never writes a
-- transaction and its postings in separate requests.
--
-- Drafts are not exempt. A Phase 2 draft whose counterpart is not known yet
-- (SPEC §7, "tujuan dibiarkan kosong") has to post to a holding account
-- instead of staying unbalanced. Relaxing this later is one migration;
-- tightening it later would mean cleaning up existing rows first.

-- Not exposed through the Data API (only public is). Holds internals the app
-- must not call directly.
create schema private;
revoke all on schema private from public;

-- SECURITY DEFINER so the check always sees every posting of the transaction:
-- under the caller's RLS a hidden row could make an unbalanced transaction
-- look balanced. Composite foreign keys already rule that out today; this
-- does not depend on it.
create function private.assert_transaction_balanced(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
  v_sum numeric;
begin
  -- Deleted in the same database transaction; its postings went with it
  -- (on delete cascade), nothing left to check.
  if not exists (select 1 from public.transactions where id = p_transaction_id) then
    return;
  end if;

  select count(*), coalesce(sum(amount_sen), 0)
    into v_count, v_sum
    from public.postings
   where transaction_id = p_transaction_id;

  if v_count < 2 then
    raise exception 'transaction % has % posting(s); at least 2 are required',
      p_transaction_id, v_count
      using errcode = 'check_violation', constraint = 'transaction_balanced';
  end if;
  if v_sum <> 0 then
    raise exception 'postings of transaction % sum to % sen; they must sum to 0',
      p_transaction_id, v_sum
      using errcode = 'check_violation', constraint = 'transaction_balanced';
  end if;
end
$$;

create function private.postings_balance_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_transaction_balanced(old.transaction_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.transaction_id <> old.transaction_id) then
    perform private.assert_transaction_balanced(new.transaction_id);
  end if;
  return null;
end
$$;

create function private.transactions_balance_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_transaction_balanced(new.id);
  return null;
end
$$;

create constraint trigger postings_keep_transaction_balanced
  after insert or update or delete on public.postings
  deferrable initially deferred
  for each row execute function private.postings_balance_trigger();

-- A transaction inserted without any posting changes no posting row, so the
-- trigger above would never see it.
create constraint trigger transactions_start_balanced
  after insert on public.transactions
  deferrable initially deferred
  for each row execute function private.transactions_balance_trigger();

-- Triggers fire without an EXECUTE check, so nobody needs to be able to call
-- these directly.
revoke all on function private.assert_transaction_balanced(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.postings_balance_trigger()
  from public, anon, authenticated, service_role;
revoke all on function private.transactions_balance_trigger()
  from public, anon, authenticated, service_role;
