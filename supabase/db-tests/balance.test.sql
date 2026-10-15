-- SPEC §5: postings of a transaction sum to zero, with at least two of them,
-- checked at COMMIT (deferred constraint triggers). Everything runs as user A
-- through role authenticated, which also proves the triggers fire for a role
-- that cannot execute the private trigger functions.
--
-- tests.run_deferred_checks() does what COMMIT would: it runs the pending
-- deferred checks. A failing case is wrapped in tests.assert_raises, so its
-- rows are rolled back and do not leak into the next case.

begin;

select tests.login_as('00000000-0000-4000-8000-00000000000a');

insert into public.accounts (id, name, kind, subtype) values
  ('10000000-0000-4000-8000-0000000000a1', 'Mandiri', 'asset', 'bank');
insert into public.accounts (id, name, kind) values
  ('10000000-0000-4000-8000-0000000000a2', 'Makan & Minum', 'expense'),
  ('10000000-0000-4000-8000-0000000000a3', 'Budi', 'person');

-- Balanced: the transaction row first, postings in later statements; nothing
-- is checked until the deferred checks run.
insert into public.transactions (id, occurred_at, status, source)
values ('20000000-0000-4000-8000-000000000001', '2026-10-15 12:00+07', 'confirmed', 'manual');
insert into public.postings (transaction_id, account_id, amount_sen)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a1', -5000000);
insert into public.postings (transaction_id, account_id, amount_sen)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a2', 5000000);
select tests.run_deferred_checks();

-- Three-way split (Patungan): Mandiri -90.000, own share +30.000, Budi +60.000.
insert into public.transactions (id, occurred_at, status, source)
values ('20000000-0000-4000-8000-000000000002', '2026-10-15 19:00+07', 'confirmed', 'manual');
insert into public.postings (transaction_id, account_id, amount_sen) values
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-0000000000a1', -9000000),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-0000000000a2', 3000000),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-0000000000a3', 6000000);
select tests.run_deferred_checks();

-- Unbalanced.
select tests.assert_raises($$
  insert into public.transactions (id, occurred_at, status, source)
  values ('20000000-0000-4000-8000-0000000000f1', now(), 'confirmed', 'manual');
  insert into public.postings (transaction_id, account_id, amount_sen) values
    ('20000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-0000000000a1', -5000000),
    ('20000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-0000000000a2', 4999999);
  select tests.run_deferred_checks();
$$, '23514', '%sum to -1 sen%');

-- Drafts are held to the same rule.
select tests.assert_raises($$
  insert into public.transactions (id, occurred_at, status, source)
  values ('20000000-0000-4000-8000-0000000000f2', now(), 'draft', 'email');
  insert into public.postings (transaction_id, account_id, amount_sen) values
    ('20000000-0000-4000-8000-0000000000f2', '10000000-0000-4000-8000-0000000000a1', -5000000);
  select tests.run_deferred_checks();
$$, '23514', '%at least 2%');

-- No postings at all.
select tests.assert_raises($$
  insert into public.transactions (occurred_at, status, source)
  values (now(), 'confirmed', 'manual');
  select tests.run_deferred_checks();
$$, '23514', '%has 0 posting(s)%');

-- A zero posting is rejected immediately (check constraint).
select tests.assert_raises($$
  insert into public.postings (transaction_id, account_id, amount_sen)
  values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000a1', 0);
$$, '23514', '%postings_amount_sen_not_zero%');

-- Deleting one posting of a balanced transaction.
select tests.assert_raises($$
  delete from public.postings
  where transaction_id = '20000000-0000-4000-8000-000000000001' and amount_sen > 0;
  select tests.run_deferred_checks();
$$, '23514');

-- Changing one amount.
select tests.assert_raises($$
  update public.postings set amount_sen = -4000000
  where transaction_id = '20000000-0000-4000-8000-000000000001' and amount_sen < 0;
  select tests.run_deferred_checks();
$$, '23514');

-- Moving a posting to another transaction unbalances both.
select tests.assert_raises($$
  update public.postings set transaction_id = '20000000-0000-4000-8000-000000000002'
  where transaction_id = '20000000-0000-4000-8000-000000000001' and amount_sen > 0;
  select tests.run_deferred_checks();
$$, '23514');

-- Same, but the source transaction is then deleted, so only the check on the
-- receiving transaction can catch it.
select tests.assert_raises($$
  update public.postings set transaction_id = '20000000-0000-4000-8000-000000000002'
  where transaction_id = '20000000-0000-4000-8000-000000000001' and amount_sen > 0;
  delete from public.transactions where id = '20000000-0000-4000-8000-000000000001';
  select tests.run_deferred_checks();
$$, '23514', '%20000000-0000-4000-8000-000000000002%');

-- Changing both sides in separate statements is fine: only the end state counts.
update public.postings set amount_sen = -4000000
where transaction_id = '20000000-0000-4000-8000-000000000001' and amount_sen < 0;
update public.postings set amount_sen = 4000000
where transaction_id = '20000000-0000-4000-8000-000000000001' and amount_sen > 0;
select tests.run_deferred_checks();

-- Deleting the whole transaction takes its postings along and passes.
delete from public.transactions where id = '20000000-0000-4000-8000-000000000002';
select tests.run_deferred_checks();

do $$
begin
  assert (select count(*) from public.postings) = 2, 'only the first transaction''s postings remain';
  assert (select sum(amount_sen) from public.postings) = 0, 'and they still balance';
end
$$;

select tests.logout();

-- The constraint triggers really are deferred and fire on every change.
do $$
begin
  assert (
    select count(*) from pg_trigger
    where tgname in ('postings_keep_transaction_balanced', 'transactions_start_balanced')
      and tgconstraint <> 0 and tgdeferrable and tginitdeferred
  ) = 2, 'both balance triggers are DEFERRABLE INITIALLY DEFERRED constraint triggers';
end
$$;

rollback;
