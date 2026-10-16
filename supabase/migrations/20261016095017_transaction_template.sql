-- transactions.template (SPEC §5): the §6 template a transaction was made
-- with, so an edit form can reopen the same template. The postings alone
-- cannot tell: Pinjamkan, Bayar utang and Biaya reimburse all give
-- asset -, person +, and Dipinjami and Terima pelunasan both give
-- asset +, person -. Null for anything not made from a template: an email
-- draft before a template is picked, Biaya/bunga, saldo awal.
--
-- The values are the template kinds of lib/posting/templates.ts, in SPEC §6
-- order. TemplateKind is the generated type of this enum, so the TypeScript
-- side cannot drift from it without failing to compile.

create type public.transaction_template as enum (
  'pengeluaran',
  'pemasukan',
  'transfer',
  'pinjamkan',
  'dipinjami',
  'dibayari',
  'terima_pelunasan',
  'bayar_utang',
  'patungan',
  'ikhlaskan_piutang',
  'biaya_reimburse',
  'refund'
);

alter table public.transactions add column template public.transaction_template;

-- Both RPCs gain p_template, last, so positional calls keep their meaning.
-- CREATE OR REPLACE cannot add a parameter: it would create a second
-- overload, and PostgREST cannot choose between overloads that differ only
-- by an optional argument. So drop and recreate; the bodies are unchanged
-- apart from the new column.

drop function public.create_transaction(
  timestamptz, public.transaction_status, public.transaction_source, jsonb, text, text, text[], text, text
);
drop function public.update_transaction(
  uuid, timestamptz, public.transaction_status, jsonb, text, text, text[]
);

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
  p_source_key text default null,
  p_template public.transaction_template default null
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
    (occurred_at, description, notes, status, source, external_ref, source_key, tags, template)
  values
    (p_occurred_at, coalesce(p_description, ''), nullif(p_notes, ''), p_status, p_source,
     p_external_ref, p_source_key, coalesce(p_tags, '{}'), p_template)
  returning id into v_id;

  perform private.replace_postings(v_id, p_postings);
  return v_id;
end
$$;

-- Replaces the whole transaction: every field and all postings. Nothing has a
-- default, so leaving a field out is an error rather than silently clearing
-- it; p_template too (pass null for "no template"). source, external_ref and
-- source_key identify where a transaction came from and cannot be changed.
-- The generated TypeScript types cannot mark an argument nullable, and unlike
-- the text arguments an enum has no '' to stand for null, so a caller that
-- passes a null template needs a cast.
create function public.update_transaction(
  p_id uuid,
  p_occurred_at timestamptz,
  p_status public.transaction_status,
  p_postings jsonb,
  p_description text,
  p_notes text,
  p_tags text[],
  p_template public.transaction_template
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
         tags = coalesce(p_tags, '{}'),
         template = p_template
   where id = p_id;
  if not found then
    raise exception 'transaction % not found', p_id using errcode = 'no_data_found';
  end if;

  perform private.replace_postings(p_id, p_postings);
end
$$;

-- Grants: only authenticated may call these. Explicit, so they do not depend
-- on the default privileges of whoever ran the migration.
revoke all on function public.create_transaction(
  timestamptz, public.transaction_status, public.transaction_source, jsonb, text, text, text[], text, text,
  public.transaction_template
) from public, anon;
grant execute on function public.create_transaction(
  timestamptz, public.transaction_status, public.transaction_source, jsonb, text, text, text[], text, text,
  public.transaction_template
) to authenticated;

revoke all on function public.update_transaction(
  uuid, timestamptz, public.transaction_status, jsonb, text, text, text[], public.transaction_template
) from public, anon;
grant execute on function public.update_transaction(
  uuid, timestamptz, public.transaction_status, jsonb, text, text, text[], public.transaction_template
) to authenticated;
