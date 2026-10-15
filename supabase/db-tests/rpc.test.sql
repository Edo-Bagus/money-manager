-- create_transaction / update_transaction / delete_transaction (SPEC §5):
-- validate, store atomically, stay inside the caller's own data.

begin;

-- B has an account, used to check that A cannot post to it.
select tests.login_as('00000000-0000-4000-8000-00000000000b');
insert into public.accounts (id, name, kind) values
  ('10000000-0000-4000-8000-0000000000b1', 'Makan & Minum', 'expense');

select tests.login_as('00000000-0000-4000-8000-00000000000a');
insert into public.accounts (id, name, kind, subtype) values
  ('10000000-0000-4000-8000-0000000000a1', 'Mandiri', 'asset', 'bank');
insert into public.accounts (id, name, kind) values
  ('10000000-0000-4000-8000-0000000000a2', 'Makan & Minum', 'expense'),
  ('10000000-0000-4000-8000-0000000000a3', 'Budi', 'person');

-- create_transaction: happy path ---------------------------------------------

do $$
declare
  v_id uuid;
begin
  v_id := public.create_transaction(
    p_occurred_at => '2026-10-15 12:30+07',
    p_status => 'confirmed',
    p_source => 'manual',
    p_postings => '[
      {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -2500000},
      {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 2500000}
    ]',
    p_notes => ''
  );
  perform tests.run_deferred_checks();

  assert (select notes from public.transactions where id = v_id) is null, 'empty notes stored as null';

  assert (select description from public.transactions where id = v_id) = '',
    'description defaults to empty';
  assert (select tags from public.transactions where id = v_id) = '{}', 'tags default to empty';
  assert (select owner_id from public.transactions where id = v_id) = '00000000-0000-4000-8000-00000000000a',
    'transaction belongs to the caller';
  assert (
    select count(*) from public.postings
    where transaction_id = v_id and owner_id = '00000000-0000-4000-8000-00000000000a'
  ) = 2, 'both postings stored, owned by the caller';
  assert (select sum(amount_sen) from public.postings where transaction_id = v_id) = 0,
    'postings balance';
end
$$;

-- Patungan with every optional field, and the same account twice.
do $$
declare
  v_id uuid;
begin
  v_id := public.create_transaction(
    '2026-10-15 19:00+07', 'draft', 'email',
    '[
      {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -9000001},
      {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 3000001},
      {"account_id": "10000000-0000-4000-8000-0000000000a3", "amount_sen": 3000000},
      {"account_id": "10000000-0000-4000-8000-0000000000a3", "amount_sen": 3000000}
    ]',
    'Makan malam', 'catatan', array['patungan'], '0012345678901234567890', 'mandiri:pembayaran'
  );
  perform tests.run_deferred_checks();

  assert (select external_ref from public.transactions where id = v_id) = '0012345678901234567890',
    'external_ref is stored as text, leading zeros and all';
  assert (select count(*) from public.postings where transaction_id = v_id) = 4, 'four postings';
end
$$;

-- create_transaction: rejected input -------------------------------------------

-- Not an array.
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual',
    '{"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": 1}')
$q$, '22023', 'postings must be a JSON array');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', null)
$q$, '22023', 'postings must be a JSON array');

-- Fewer than two postings.
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual',
    '[{"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": 1}]')
$q$, '23514', '%at least 2 postings%');

-- Malformed items.
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": 1},
    {}
  ]')
$q$, '22023', 'posting 2: expected exactly the keys%');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": 1},
    "oops"
  ]')
$q$, '22023', 'posting 2: expected an object');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -1},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 1, "owner_id": "x"}
  ]')
$q$, '22023', 'posting 2: expected exactly the keys%');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": null, "amount_sen": -1},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 1}
  ]')
$q$, '22023', 'posting 1: account_id must be a uuid string');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "not-a-uuid", "amount_sen": -1},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 1}
  ]')
$q$, '22P02');

-- amount_sen: only whole numbers, as JSON numbers, never 0.
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": "-100"},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 100}
  ]')
$q$, '22023', 'posting 1: amount_sen must be a whole number of sen');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -100.5},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 100.5}
  ]')
$q$, '22023', 'posting 1: amount_sen must be a whole number of sen');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": null},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 100}
  ]')
$q$, '22023', 'posting 1: amount_sen must be a whole number of sen');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": 0},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 0}
  ]')
$q$, '23514', 'posting 1: amount_sen must not be 0');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -1e30},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 1e30}
  ]')
$q$, '22003');

-- Unbalanced.
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -2500000},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 2500001}
  ]')
$q$, '23514', 'postings sum to 1 sen; they must sum to 0');

-- Another owner's account and a non-existent one look the same.
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -100},
    {"account_id": "10000000-0000-4000-8000-0000000000b1", "amount_sen": 100}
  ]')
$q$, '23503', 'postings refer to an unknown account');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -100},
    {"account_id": "10000000-0000-4000-8000-00000000ffff", "amount_sen": 100}
  ]')
$q$, '23503', 'postings refer to an unknown account');

-- external_ref without source_key, and a duplicate reference.
select tests.assert_raises($q$
  select public.create_transaction(now(), 'draft', 'email', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -100},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 100}
  ]', p_external_ref => 'REF1')
$q$, '23514', '%transactions_external_ref_with_source_key%');
select tests.assert_raises($q$
  select public.create_transaction(now(), 'draft', 'email', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -100},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 100}
  ]', p_external_ref => '0012345678901234567890', p_source_key => 'mandiri:pembayaran')
$q$, '23505');

-- Logged-in role but no user id in the claims.
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform tests.assert_raises($q$
    select public.create_transaction(now(), 'confirmed', 'manual', '[
      {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -100},
      {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 100}
    ]')
  $q$, '42501', 'not authenticated');
end
$$;
select tests.login_as('00000000-0000-4000-8000-00000000000a');

-- update_transaction ---------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  v_id := public.create_transaction('2026-10-15 12:30+07', 'draft', 'manual', '[
    {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -2500000},
    {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 2500000}
  ]', 'Nasi goreng', 'lama', array['lama']);
  perform tests.run_deferred_checks();

  -- Rejected update leaves everything as it was.
  perform tests.assert_raises(format($q$
    select public.update_transaction(%L, now(), 'confirmed', '[
      {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -1},
      {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 2}
    ]', 'x', null, null)
  $q$, v_id), '23514');
  assert (select status from public.transactions where id = v_id) = 'draft', 'status unchanged';
  assert (select sum(abs(amount_sen)) from public.postings where transaction_id = v_id) = 5000000,
    'postings unchanged';

  -- Confirm, recategorise to a split with Budi, rewrite every field.
  perform public.update_transaction(
    v_id, '2026-10-15 13:00+07', 'confirmed', '[
      {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -2500000},
      {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 1250000},
      {"account_id": "10000000-0000-4000-8000-0000000000a3", "amount_sen": 1250000}
    ]', null, null, null);
  perform tests.run_deferred_checks();

  assert (select status from public.transactions where id = v_id) = 'confirmed', 'status updated';
  assert (select occurred_at from public.transactions where id = v_id) = '2026-10-15 13:00+07',
    'occurred_at updated';
  assert (select description from public.transactions where id = v_id) = '', 'null description stored as empty';
  assert (select notes from public.transactions where id = v_id) is null, 'notes cleared';

  perform public.update_transaction(
    v_id, '2026-10-15 13:00+07', 'confirmed', '[
      {"account_id": "10000000-0000-4000-8000-0000000000a1", "amount_sen": -2500000},
      {"account_id": "10000000-0000-4000-8000-0000000000a2", "amount_sen": 1250000},
      {"account_id": "10000000-0000-4000-8000-0000000000a3", "amount_sen": 1250000}
    ]', '', '', '{}');
  perform tests.run_deferred_checks();
  assert (select notes from public.transactions where id = v_id) is null, 'empty notes stored as null';
  assert (select tags from public.transactions where id = v_id) = '{}', 'null tags stored as empty';
  assert (select count(*) from public.postings where transaction_id = v_id) = 3, 'postings replaced';
  assert not exists (
    select 1 from public.postings where transaction_id = v_id and amount_sen = 2500000
  ), 'old postings are gone';

  -- B cannot update or delete A's transaction, and gets "not found".
  perform tests.login_as('00000000-0000-4000-8000-00000000000b');
  perform tests.assert_raises(format($q$
    select public.update_transaction(%L, now(), 'draft', '[
      {"account_id": "10000000-0000-4000-8000-0000000000b1", "amount_sen": -1},
      {"account_id": "10000000-0000-4000-8000-0000000000b1", "amount_sen": 1}
    ]', 'hacked', null, null)
  $q$, v_id), 'P0002');
  perform tests.assert_raises(format('select public.delete_transaction(%L)', v_id), 'P0002');

  perform tests.login_as('00000000-0000-4000-8000-00000000000a');
  assert (select description from public.transactions where id = v_id) = '', 'B did not change it';

  -- delete_transaction removes the transaction and its postings.
  perform public.delete_transaction(v_id);
  perform tests.run_deferred_checks();
  assert not exists (select 1 from public.transactions where id = v_id), 'transaction deleted';
  assert not exists (select 1 from public.postings where transaction_id = v_id), 'postings deleted';
  perform tests.assert_raises(format('select public.delete_transaction(%L)', v_id), 'P0002');
end
$$;

-- anon cannot call any of them ------------------------------------------------

select tests.login_as_anon();
select tests.assert_raises($q$
  select public.create_transaction(now(), 'confirmed', 'manual', '[]')
$q$, '42501');
select tests.assert_raises($q$
  select public.delete_transaction('20000000-0000-4000-8000-000000000001')
$q$, '42501');
select tests.logout();

do $$
begin
  assert has_function_privilege('authenticated',
    'public.create_transaction(timestamptz, public.transaction_status, public.transaction_source, jsonb, text, text, text[], text, text)',
    'EXECUTE'), 'authenticated can call create_transaction';
  assert has_function_privilege('authenticated',
    'public.update_transaction(uuid, timestamptz, public.transaction_status, jsonb, text, text, text[])',
    'EXECUTE'), 'authenticated can call update_transaction';
  assert has_function_privilege('authenticated', 'public.delete_transaction(uuid)', 'EXECUTE'),
    'authenticated can call delete_transaction';
end
$$;

rollback;
