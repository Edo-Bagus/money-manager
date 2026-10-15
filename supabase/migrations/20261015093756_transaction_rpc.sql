-- SPEC §5: a transaction and its postings are only ever written together,
-- through these functions. Each call is one PostgREST request, hence one
-- database transaction, so the deferred balance check sees the finished
-- result instead of a half-written one.
--
-- The app turns a template into postings in pure TypeScript; these functions
-- only validate and store. Postings arrive as a JSON array:
--   [{"account_id": "<uuid>", "amount_sen": -2500000}, ...]
-- amount_sen must be a JSON integer (what JSON.stringify gives for a safe
-- integer); strings and fractions are rejected, never rounded.
--
-- SECURITY INVOKER: they run as the caller, so RLS and the composite foreign
-- keys keep doing the ownership checks. The table write grants stay for the
-- same reason; whichever way a write arrives, the deferred trigger still
-- rejects an unbalanced transaction.

-- Shared by create_transaction and update_transaction: checks the postings
-- and replaces the transaction's postings with them. authenticated needs
-- USAGE on private and EXECUTE here because the RPCs run as the caller; the
-- Data API cannot reach it (only public is exposed), and calling it directly
-- would get past nothing, since RLS and the balance trigger still apply.
create function private.replace_postings(p_transaction_id uuid, p_postings jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_index bigint;
  v_amount bigint;
  v_sum numeric := 0;
begin
  if p_postings is null or jsonb_typeof(p_postings) <> 'array' then
    raise exception 'postings must be a JSON array'
      using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_postings) < 2 then
    raise exception 'a transaction needs at least 2 postings, got %', jsonb_array_length(p_postings)
      using errcode = 'check_violation', constraint = 'transaction_balanced';
  end if;

  -- Written with IS DISTINCT FROM throughout: a missing key yields NULL, and
  -- NULL <> 'x' is NULL, which IF treats as false.
  for v_item, v_index in
    select value, ordinality from jsonb_array_elements(p_postings) with ordinality
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'posting %: expected an object', v_index
        using errcode = 'invalid_parameter_value';
    end if;
    if (select array_agg(k order by k) from jsonb_object_keys(v_item) as k)
       is distinct from array['account_id', 'amount_sen'] then
      raise exception 'posting %: expected exactly the keys account_id and amount_sen', v_index
        using errcode = 'invalid_parameter_value';
    end if;
    if jsonb_typeof(v_item -> 'account_id') is distinct from 'string' then
      raise exception 'posting %: account_id must be a uuid string', v_index
        using errcode = 'invalid_parameter_value';
    end if;
    perform (v_item ->> 'account_id')::uuid;
    if jsonb_typeof(v_item -> 'amount_sen') is distinct from 'number'
       or (v_item ->> 'amount_sen') !~ '^-?[0-9]+$' then
      raise exception 'posting %: amount_sen must be a whole number of sen', v_index
        using errcode = 'invalid_parameter_value';
    end if;
    v_amount := (v_item ->> 'amount_sen')::bigint;
    if v_amount = 0 then
      raise exception 'posting %: amount_sen must not be 0', v_index
        using errcode = 'check_violation';
    end if;
    v_sum := v_sum + v_amount;
  end loop;

  if v_sum <> 0 then
    raise exception 'postings sum to % sen; they must sum to 0', v_sum
      using errcode = 'check_violation', constraint = 'transaction_balanced';
  end if;

  -- RLS hides other owners' accounts, so "someone else's" and "does not exist"
  -- give the same error. The composite foreign key would refuse it anyway;
  -- this only makes the message clearer.
  if exists (
    select 1 from jsonb_array_elements(p_postings) as e
    where not exists (
      select 1 from public.accounts as a where a.id = (e ->> 'account_id')::uuid
    )
  ) then
    raise exception 'postings refer to an unknown account'
      using errcode = 'foreign_key_violation';
  end if;

  delete from public.postings where transaction_id = p_transaction_id;
  insert into public.postings (transaction_id, account_id, amount_sen)
  select p_transaction_id, (e ->> 'account_id')::uuid, (e ->> 'amount_sen')::bigint
  from jsonb_array_elements(p_postings) as e;
end
$$;

-- Empty text and null mean the same in both functions: description is stored
-- as '' (never null), notes as null (never ''). The generated TypeScript types
-- cannot express nullable arguments, so the app may send either.

-- Returns the new transaction's id.
create function public.create_transaction(
  p_occurred_at timestamptz,
  p_status public.transaction_status,
  p_source public.transaction_source,
  p_postings jsonb,
  p_description text default '',
  p_notes text default null,
  p_tags text[] default '{}',
  p_external_ref text default null,
  p_source_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  insert into public.transactions
    (occurred_at, description, notes, status, source, external_ref, source_key, tags)
  values
    (p_occurred_at, coalesce(p_description, ''), nullif(p_notes, ''), p_status, p_source,
     p_external_ref, p_source_key, coalesce(p_tags, '{}'))
  returning id into v_id;

  perform private.replace_postings(v_id, p_postings);
  return v_id;
end
$$;

-- Replaces the whole transaction: every field and all postings. Nothing has a
-- default, so leaving a field out is an error rather than silently clearing
-- it. source, external_ref and source_key identify where a transaction came
-- from and cannot be changed.
create function public.update_transaction(
  p_id uuid,
  p_occurred_at timestamptz,
  p_status public.transaction_status,
  p_postings jsonb,
  p_description text,
  p_notes text,
  p_tags text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  update public.transactions
     set occurred_at = p_occurred_at,
         status = p_status,
         description = coalesce(p_description, ''),
         notes = nullif(p_notes, ''),
         tags = coalesce(p_tags, '{}')
   where id = p_id;
  if not found then
    raise exception 'transaction % not found', p_id using errcode = 'no_data_found';
  end if;

  perform private.replace_postings(p_id, p_postings);
end
$$;

create function public.delete_transaction(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Postings go with it (on delete cascade).
  delete from public.transactions where id = p_id;
  if not found then
    raise exception 'transaction % not found', p_id using errcode = 'no_data_found';
  end if;
end
$$;

-- Grants: only authenticated may call these. Explicit, so they do not depend
-- on the default privileges of whoever ran the migration.
grant usage on schema private to authenticated;
revoke all on function private.replace_postings(uuid, jsonb) from public, anon;
grant execute on function private.replace_postings(uuid, jsonb) to authenticated;

revoke all on function public.create_transaction(
  timestamptz, public.transaction_status, public.transaction_source, jsonb, text, text, text[], text, text
) from public, anon;
grant execute on function public.create_transaction(
  timestamptz, public.transaction_status, public.transaction_source, jsonb, text, text, text[], text, text
) to authenticated;

revoke all on function public.update_transaction(
  uuid, timestamptz, public.transaction_status, jsonb, text, text, text[]
) from public, anon;
grant execute on function public.update_transaction(
  uuid, timestamptz, public.transaction_status, jsonb, text, text, text[]
) to authenticated;

revoke all on function public.delete_transaction(uuid) from public, anon;
grant execute on function public.delete_transaction(uuid) to authenticated;
