-- Default accounts (SPEC §5): the expense and income categories and the two
-- equity accounts. A migration runs without a logged-in user, so it cannot
-- fill owner_id; instead the app calls this function as the user right after
-- login. It is idempotent, so calling it on every login is fine.
--
-- Rows are matched on system_key, not on name: renaming "Lainnya" must not
-- make it come back, and "Lainnya" exists as both expense and income. ON
-- CONFLICT DO NOTHING without a target also skips a row whose (kind, name) the
-- user already took, rather than failing the whole call.
--
-- Returns how many accounts it created (0 once they exist).
create function public.ensure_default_accounts()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_created integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  insert into public.accounts (kind, name, system_key)
  values
    ('expense', 'Makan & Minum', 'expense.makan_minum'),
    ('expense', 'Belanja Harian', 'expense.belanja_harian'),
    ('expense', 'Transportasi', 'expense.transportasi'),
    ('expense', 'Tagihan & Utilitas', 'expense.tagihan_utilitas'),
    ('expense', 'Belanja Pribadi', 'expense.belanja_pribadi'),
    ('expense', 'Hiburan & Hobi', 'expense.hiburan_hobi'),
    ('expense', 'Langganan Digital', 'expense.langganan_digital'),
    ('expense', 'Kesehatan', 'expense.kesehatan'),
    ('expense', 'Pendidikan & Pengembangan Diri', 'expense.pendidikan'),
    ('expense', 'Perjalanan', 'expense.perjalanan'),
    ('expense', 'Hadiah & Donasi', 'expense.hadiah_donasi'),
    ('expense', 'Biaya Bank & Admin', 'expense.biaya_bank_admin'),
    ('expense', 'Lainnya', 'expense.lainnya'),
    ('income', 'Uang Saku/Kiriman', 'income.uang_saku'),
    ('income', 'Gaji/Honor', 'income.gaji_honor'),
    ('income', 'Hasil Investasi', 'income.hasil_investasi'),
    ('income', 'Lainnya', 'income.lainnya'),
    ('equity', 'Saldo Awal', 'equity.saldo_awal'),
    ('equity', 'Penyesuaian Nilai Investasi', 'equity.penyesuaian_nilai_investasi')
  on conflict do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end
$$;

revoke all on function public.ensure_default_accounts() from public, anon;
grant execute on function public.ensure_default_accounts() to authenticated;
