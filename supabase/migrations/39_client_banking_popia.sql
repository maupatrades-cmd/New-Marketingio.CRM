-- 39_client_banking_popia.sql
-- POPIA-compliant client banking capture.
-- Encrypted with pgp_sym_encrypt (pgcrypto) + Vault key.
-- No direct SELECT allowed — all access through SECURITY DEFINER RPCs.

-- ─── 1. Vault key ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'banking_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'banking_key',
      'pgp_sym_encrypt key for client banking account numbers (POPIA — do not expose)'
    );
  end if;
end $$;

-- ─── 2. AVS feature flag in system_settings ─────────────────────────────────
insert into public.system_settings (key, value, description)
values
  ('avs_enabled',        'false'::jsonb,
   'Enable live bank AVS check at capture. Requires avs_provider_config to be populated.'),
  ('avs_provider_config', '{}'::jsonb,
   'AVS provider config: {"url":"","api_key":"","provider":"netcash|peach|other"}')
on conflict (key) do nothing;

-- ─── 3. Enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type public.account_holder_type as enum ('client_own','owner_personal','third_party');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.banking_verification_status as enum ('unverified','verified','mismatch');
exception when duplicate_object then null; end $$;

-- ─── 4. client_banking table ─────────────────────────────────────────────────
create table if not exists public.client_banking (
  id                              uuid primary key default gen_random_uuid(),
  deal_id                         uuid not null references public.deals(id) on delete cascade,
  client_id                       uuid references public.clients(id) on delete set null,

  bank_name                       text not null,
  account_holder_name             text not null,
  account_holder_id               text,
  account_holder_type             public.account_holder_type not null default 'client_own',

  third_party_consent             boolean not null default false,
  third_party_consent_at          timestamptz,
  third_party_consent_captured_by uuid references auth.users(id),

  account_number_enc              bytea not null,
  account_type                    text not null default 'cheque'
                                    check (account_type in ('cheque','savings','current','transmission')),
  branch_code                     text,

  verification_status             public.banking_verification_status not null default 'unverified',
  avs_checked_at                  timestamptz,
  avs_response                    jsonb,

  captured_by                     uuid not null references auth.users(id),
  captured_at                     timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint client_banking_deal_unique unique (deal_id)
);

-- ─── 5. RLS — deny all direct access ─────────────────────────────────────────
alter table public.client_banking enable row level security;

-- ─── 6. RPC: capture_banking ─────────────────────────────────────────────────
create or replace function public.capture_banking(
  p_deal_id             uuid,
  p_bank_name           text,
  p_account_holder_name text,
  p_account_holder_id   text,
  p_account_holder_type text,
  p_account_number      text,
  p_account_type        text     default 'cheque',
  p_branch_code         text     default null,
  p_third_party_consent boolean  default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_caller_role  public.app_role;
  v_deal         record;
  v_banking_key  text;
  v_enc          bytea;
  v_record_id    uuid;
  v_holder_type  public.account_holder_type;
  v_verif_status public.banking_verification_status := 'unverified';
  v_avs_enabled  boolean;
begin
  raise log '[capture_banking] START caller=% deal=%', v_caller, p_deal_id;

  if v_caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_caller_role := public.current_user_role();
  if v_caller_role is null
     or v_caller_role::text not in ('owner','admin','field_agent','cpc') then
    raise exception 'forbidden: role % cannot capture banking', v_caller_role
      using errcode = '42501';
  end if;

  select id, client_id, client_name into v_deal
    from public.deals where id = p_deal_id;
  if not found then
    raise exception 'deal_not_found: %', p_deal_id using errcode = '23503';
  end if;

  begin
    v_holder_type := p_account_holder_type::public.account_holder_type;
  exception when invalid_text_representation then
    raise exception 'invalid account_holder_type: %. Must be client_own, owner_personal, or third_party',
      p_account_holder_type using errcode = '22023';
  end;

  if v_holder_type != 'client_own' and not coalesce(p_third_party_consent, false) then
    raise exception 'third_party_consent required when account_holder_type is not client_own'
      using errcode = '23514';
  end if;

  if trim(coalesce(p_bank_name,'')) = '' then
    raise exception 'bank_name required' using errcode = '23514';
  end if;
  if trim(coalesce(p_account_holder_name,'')) = '' then
    raise exception 'account_holder_name required' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_account_number,''))) < 6 then
    raise exception 'account_number missing or too short' using errcode = '23514';
  end if;

  raise log '[capture_banking] validation passed — fetching vault key';

  select decrypted_secret into v_banking_key
    from vault.decrypted_secrets where name = 'banking_key';
  if v_banking_key is null then
    raise exception 'banking_key not found in vault — contact system admin'
      using errcode = '42704';
  end if;

  v_enc := pgp_sym_encrypt(trim(p_account_number), v_banking_key);
  raise log '[capture_banking] account number encrypted';

  select coalesce((value)::boolean, false) into v_avs_enabled
    from public.system_settings where key = 'avs_enabled';
  v_verif_status := 'unverified';

  insert into public.client_banking (
    deal_id, client_id,
    bank_name, account_holder_name, account_holder_id, account_holder_type,
    third_party_consent, third_party_consent_at, third_party_consent_captured_by,
    account_number_enc, account_type, branch_code,
    verification_status, captured_by, captured_at, updated_at
  ) values (
    p_deal_id, v_deal.client_id,
    p_bank_name, p_account_holder_name, p_account_holder_id, v_holder_type,
    coalesce(p_third_party_consent, false),
    case when coalesce(p_third_party_consent, false) then now() else null end,
    case when coalesce(p_third_party_consent, false) then v_caller else null end,
    v_enc,
    coalesce(nullif(trim(p_account_type),''), 'cheque'),
    nullif(trim(coalesce(p_branch_code,'')), ''),
    v_verif_status, v_caller, now(), now()
  )
  on conflict (deal_id) do update set
    bank_name                       = excluded.bank_name,
    account_holder_name             = excluded.account_holder_name,
    account_holder_id               = excluded.account_holder_id,
    account_holder_type             = excluded.account_holder_type,
    third_party_consent             = excluded.third_party_consent,
    third_party_consent_at          = excluded.third_party_consent_at,
    third_party_consent_captured_by = excluded.third_party_consent_captured_by,
    account_number_enc              = excluded.account_number_enc,
    account_type                    = excluded.account_type,
    branch_code                     = excluded.branch_code,
    verification_status             = excluded.verification_status,
    captured_by                     = excluded.captured_by,
    captured_at                     = excluded.captured_at,
    updated_at                      = now()
  returning id into v_record_id;

  insert into public.client_activity_log (
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  ) values (
    v_deal.client_id, v_deal.client_name,
    v_caller, v_caller_role::text,
    'banking_captured', 'finance',
    format('Banking details captured for deal %s (holder_type: %s)',
      p_deal_id, p_account_holder_type),
    jsonb_build_object(
      'deal_id',           p_deal_id,
      'bank_name',         p_bank_name,
      'account_holder_type', p_account_holder_type,
      'verification_status', v_verif_status,
      'banking_record_id', v_record_id
    )
  );

  raise log '[capture_banking] DONE record=% verif=%', v_record_id, v_verif_status;

  return jsonb_build_object(
    'ok',                 true,
    'banking_record_id',  v_record_id,
    'verification_status', v_verif_status
  );
end $$;

grant execute on function public.capture_banking(uuid,text,text,text,text,text,text,text,boolean)
  to authenticated;

-- ─── 7. RPC: get_banking_last_four ───────────────────────────────────────────
create or replace function public.get_banking_last_four(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller      uuid := auth.uid();
  v_caller_role public.app_role;
  v_rec         public.client_banking;
  v_banking_key text;
  v_decrypted   text;
begin
  raise log '[get_banking_last_four] START caller=% deal=%', v_caller, p_deal_id;

  if v_caller is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  v_caller_role := public.current_user_role();
  if v_caller_role is null then raise exception 'no app role' using errcode = '42501'; end if;

  select * into v_rec from public.client_banking where deal_id = p_deal_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_banking_record');
  end if;

  select decrypted_secret into v_banking_key
    from vault.decrypted_secrets where name = 'banking_key';
  if v_banking_key is null then
    raise exception 'banking_key not found in vault' using errcode = '42704';
  end if;

  v_decrypted := pgp_sym_decrypt(v_rec.account_number_enc, v_banking_key);

  insert into public.client_activity_log (
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  ) values (
    v_rec.client_id,
    (select client_name from public.deals where id = p_deal_id),
    v_caller, v_caller_role::text,
    'banking_last_four_viewed', 'finance',
    format('Last 4 digits of banking account viewed for deal %s by role %s',
      p_deal_id, v_caller_role),
    jsonb_build_object('deal_id', p_deal_id, 'banking_record_id', v_rec.id)
  );

  raise log '[get_banking_last_four] DONE';

  return jsonb_build_object(
    'ok',                 true,
    'last_four',          right(v_decrypted, 4),
    'bank_name',          v_rec.bank_name,
    'account_holder_name', v_rec.account_holder_name,
    'account_type',       v_rec.account_type,
    'verification_status', v_rec.verification_status
  );
end $$;

grant execute on function public.get_banking_last_four(uuid) to authenticated;

-- ─── 8. RPC: reveal_banking (owner/admin only, requires MFA aal2) ────────────
create or replace function public.reveal_banking(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller      uuid := auth.uid();
  v_caller_role public.app_role;
  v_rec         public.client_banking;
  v_banking_key text;
  v_decrypted   text;
begin
  raise log '[reveal_banking] START caller=% deal=%', v_caller, p_deal_id;

  if v_caller is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  v_caller_role := public.current_user_role();
  if v_caller_role is null or v_caller_role::text not in ('owner','admin') then
    raise exception 'forbidden: only owner/admin can reveal full banking details'
      using errcode = '42501';
  end if;

  if coalesce(auth.jwt() ->> 'aal', 'aal1') != 'aal2' then
    raise exception 'mfa_required: complete MFA verification before revealing banking details'
      using errcode = '42501';
  end if;

  select * into v_rec from public.client_banking where deal_id = p_deal_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_banking_record');
  end if;

  select decrypted_secret into v_banking_key
    from vault.decrypted_secrets where name = 'banking_key';
  if v_banking_key is null then
    raise exception 'banking_key not found in vault' using errcode = '42704';
  end if;

  v_decrypted := pgp_sym_decrypt(v_rec.account_number_enc, v_banking_key);

  insert into public.client_activity_log (
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  ) values (
    v_rec.client_id,
    (select client_name from public.deals where id = p_deal_id),
    v_caller, v_caller_role::text,
    'banking_revealed', 'finance',
    format('Full banking account number revealed for deal %s by %s (%s)',
      p_deal_id, v_caller, v_caller_role),
    jsonb_build_object(
      'deal_id',           p_deal_id,
      'banking_record_id', v_rec.id,
      'revealed_at',       now()
    )
  );

  raise log '[reveal_banking] DONE role=%', v_caller_role;

  return jsonb_build_object(
    'ok',                 true,
    'account_number',     v_decrypted,
    'bank_name',          v_rec.bank_name,
    'account_holder_name', v_rec.account_holder_name,
    'account_holder_id',  v_rec.account_holder_id,
    'account_holder_type', v_rec.account_holder_type,
    'account_type',       v_rec.account_type,
    'branch_code',        v_rec.branch_code,
    'third_party_consent', v_rec.third_party_consent,
    'verification_status', v_rec.verification_status,
    'captured_at',        v_rec.captured_at
  );
end $$;

grant execute on function public.reveal_banking(uuid) to authenticated;
