-- ensure_default_accounts (SPEC §5 categories and equity accounts): creates
-- them for the caller only, and is safe to call on every login.

begin;

select tests.login_as('00000000-0000-4000-8000-00000000000a');

do $$
begin
  assert public.ensure_default_accounts() = 19, 'first call creates 19 accounts';
  assert public.ensure_default_accounts() = 0, 'second call creates nothing';

  assert (select count(*) from public.accounts where kind = 'expense') = 13, '13 expense categories';
  assert (select count(*) from public.accounts where kind = 'income') = 4, '4 income categories';
  assert (select count(*) from public.accounts where kind = 'equity') = 2, '2 equity accounts';
  assert (
    select count(*) from public.accounts
    where owner_id = '00000000-0000-4000-8000-00000000000a' and system_key is not null
  ) = 19, 'all owned by A, all with a system_key';

  -- The accounts templates and Tutup Hari will look up by key.
  assert (select kind from public.accounts where system_key = 'expense.biaya_bank_admin') = 'expense',
    'Biaya Bank & Admin';
  assert (select kind from public.accounts where system_key = 'expense.hadiah_donasi') = 'expense',
    'Hadiah & Donasi';
  assert (select kind from public.accounts where system_key = 'income.hasil_investasi') = 'income',
    'Hasil Investasi';
  assert (select kind from public.accounts where system_key = 'equity.saldo_awal') = 'equity',
    'Saldo Awal';
  assert (select kind from public.accounts where system_key = 'equity.penyesuaian_nilai_investasi') = 'equity',
    'Penyesuaian Nilai Investasi';
  assert (select count(*) from public.accounts where name = 'Lainnya') = 2,
    'Lainnya exists as expense and as income';
  assert not exists (select 1 from public.accounts where check_policy <> 'never' or is_own),
    'categories are never balance-checked and are not own accounts';

  -- A rename or an archive survives the next login.
  update public.accounts set name = 'Lain-lain', archived_at = now()
  where system_key = 'expense.lainnya';
  assert public.ensure_default_accounts() = 0, 'renamed account is not recreated';
  assert (select name from public.accounts where system_key = 'expense.lainnya') = 'Lain-lain',
    'rename kept';
end
$$;

-- B gets its own set; A's is unaffected.
select tests.login_as('00000000-0000-4000-8000-00000000000b');

do $$
begin
  -- B already made an account with a default name; the call still succeeds.
  insert into public.accounts (kind, name) values ('expense', 'Transportasi');
  assert public.ensure_default_accounts() = 18, 'B gets the 18 it did not have';
  assert (select count(*) from public.accounts) = 19, 'B sees only its own 19';
end
$$;

select tests.logout();

do $$
begin
  assert (select count(*) from public.accounts where owner_id = '00000000-0000-4000-8000-00000000000a') = 19,
    'A still has 19';
end
$$;

-- Without a user id, and as anon, it refuses.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform tests.assert_raises('select public.ensure_default_accounts()', '42501', 'not authenticated');
end
$$;
select tests.login_as_anon();
select tests.assert_raises('select public.ensure_default_accounts()', '42501');
select tests.logout();

rollback;
