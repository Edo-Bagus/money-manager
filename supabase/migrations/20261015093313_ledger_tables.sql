-- Phase 1 ledger tables (SPEC §5): accounts, transactions, postings,
-- balance_checks, day_closures. raw_emails, merchant_rules and
-- transactions.raw_email_id come with Phase 2.
--
-- Rules every table here follows (SPEC §4):
-- - owner_id uuid not null default auth.uid(), and RLS policies requiring
--   owner_id = auth.uid() for select/insert/update/delete. "Logged in" is not
--   enough: the publishable key is public.
-- - Every unique constraint includes owner_id.
-- - Rows that point at another table do so through a composite foreign key
--   (owner_id, x_id) -> x(owner_id, id). Foreign key checks ignore RLS, so a
--   plain x_id key would let one account attach rows to another account's
--   data (and probe which ids exist). The composite key makes "same owner" a
--   property of the schema.
-- - owner_id references auth.users ON DELETE RESTRICT: deleting the user in
--   the dashboard must not silently wipe the financial history.
-- - Money is bigint sen (_sen columns), never float or numeric.
-- - Dates (check_date, day_closures.date) are WIB calendar dates computed by
--   the app; nothing here derives a date from the server time zone.

-- Enums rather than text + check: `supabase gen types` turns them into
-- TypeScript unions. Adding a value later is easy (alter type ... add value);
-- removing one is not.
create type public.account_kind as enum ('asset', 'person', 'expense', 'income', 'equity');
create type public.asset_subtype as enum ('bank', 'ewallet', 'investment', 'cash');
create type public.check_policy as enum ('daily_if_active', 'monthly', 'never');
create type public.transaction_status as enum ('draft', 'confirmed');
create type public.transaction_source as enum ('email', 'manual', 'reconcile');
create type public.balance_resolution as enum ('ok', 'added_txn', 'fee_interest', 'carried_over');

-- accounts --------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  name text not null,
  kind public.account_kind not null,
  subtype public.asset_subtype,
  -- For automatic matching, e.g. {"last4": "3302"}, {"phone": "08xx"}.
  identifiers jsonb not null default '{}',
  is_own boolean not null default false,
  check_policy public.check_policy not null default 'never',
  -- Stable handle for the accounts the app must find by role (seeded by
  -- ensure_default_accounts, e.g. 'expense.biaya_bank_admin'). Survives a
  -- rename. Null for accounts the user creates.
  system_key text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),

  constraint accounts_name_not_blank check (btrim(name) <> ''),
  constraint accounts_subtype_iff_asset check ((kind = 'asset') = (subtype is not null)),
  constraint accounts_identifiers_is_object check (jsonb_typeof(identifiers) = 'object'),
  constraint accounts_owner_id_id_key unique (owner_id, id),
  constraint accounts_owner_id_kind_name_key unique (owner_id, kind, name),
  constraint accounts_owner_id_system_key_key unique (owner_id, system_key)
);

-- transactions ----------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  occurred_at timestamptz not null,
  description text not null default '',
  notes text,
  status public.transaction_status not null,
  source public.transaction_source not null,
  -- Bank reference numbers: always text (may be alphanumeric, start with 0,
  -- or exceed Number.MAX_SAFE_INTEGER). How source_key is built is decided in
  -- Phase 2 (SPEC §12); manual transactions leave both null.
  external_ref text,
  source_key text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),

  constraint transactions_external_ref_with_source_key
    check ((external_ref is null) = (source_key is null)),
  constraint transactions_owner_id_id_key unique (owner_id, id),
  -- NULLs are distinct here, so transactions without a reference never clash.
  constraint transactions_owner_id_source_key_external_ref_key
    unique (owner_id, source_key, external_ref)
);

create index transactions_owner_id_occurred_at_idx
  on public.transactions (owner_id, occurred_at);

-- postings --------------------------------------------------------------------
-- Positive = asset/expense grows, negative = income/source of funds. The sum
-- per transaction must be zero; that check is a deferred constraint trigger
-- (next migration).

create table public.postings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  transaction_id uuid not null,
  account_id uuid not null,
  amount_sen bigint not null,
  created_at timestamptz not null default now(),

  constraint postings_amount_sen_not_zero check (amount_sen <> 0),
  constraint postings_transaction_fkey foreign key (owner_id, transaction_id)
    references public.transactions (owner_id, id) on delete cascade,
  constraint postings_account_fkey foreign key (owner_id, account_id)
    references public.accounts (owner_id, id) on delete restrict
);

create index postings_owner_id_transaction_id_idx
  on public.postings (owner_id, transaction_id);
create index postings_owner_id_account_id_idx
  on public.postings (owner_id, account_id);

-- balance_checks --------------------------------------------------------------
-- One final check per account per WIB day; the app upserts.

create table public.balance_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  account_id uuid not null,
  check_date date not null,
  expected_sen bigint not null,
  actual_sen bigint not null,
  -- SPEC §8: selisih = saldo asli - saldo catatan.
  diff_sen bigint generated always as (actual_sen - expected_sen) stored,
  resolution public.balance_resolution not null,
  created_at timestamptz not null default now(),

  constraint balance_checks_ok_means_no_diff check (resolution <> 'ok' or actual_sen = expected_sen),
  constraint balance_checks_account_fkey foreign key (owner_id, account_id)
    references public.accounts (owner_id, id) on delete restrict,
  constraint balance_checks_owner_id_account_id_check_date_key
    unique (owner_id, account_id, check_date)
);

-- day_closures ----------------------------------------------------------------

create table public.day_closures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete restrict,
  date date not null,
  closed_at timestamptz not null default now(),

  constraint day_closures_owner_id_date_key unique (owner_id, date)
);

-- Row level security ----------------------------------------------------------
-- (select auth.uid()) instead of auth.uid(): evaluated once per statement
-- rather than once per row (Supabase's RLS performance advice).

alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.postings enable row level security;
alter table public.balance_checks enable row level security;
alter table public.day_closures enable row level security;

create policy accounts_select_own on public.accounts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy accounts_insert_own on public.accounts
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy accounts_update_own on public.accounts
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy accounts_delete_own on public.accounts
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy transactions_select_own on public.transactions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy transactions_insert_own on public.transactions
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy transactions_update_own on public.transactions
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy transactions_delete_own on public.transactions
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy postings_select_own on public.postings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy postings_insert_own on public.postings
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy postings_update_own on public.postings
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy postings_delete_own on public.postings
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy balance_checks_select_own on public.balance_checks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy balance_checks_insert_own on public.balance_checks
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy balance_checks_update_own on public.balance_checks
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy balance_checks_delete_own on public.balance_checks
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy day_closures_select_own on public.day_closures
  for select to authenticated using (owner_id = (select auth.uid()));
create policy day_closures_insert_own on public.day_closures
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy day_closures_update_own on public.day_closures
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy day_closures_delete_own on public.day_closures
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Grants ----------------------------------------------------------------------
-- The default-privileges migration already keeps anon out of new tables; say
-- it again here so it does not depend on which role ran the migration.
-- TRUNCATE ignores RLS and authenticated never needs REFERENCES or TRIGGER.

revoke all on table
  public.accounts, public.transactions, public.postings, public.balance_checks, public.day_closures
  from anon;
revoke truncate, references, trigger on table
  public.accounts, public.transactions, public.postings, public.balance_checks, public.day_closures
  from authenticated;
