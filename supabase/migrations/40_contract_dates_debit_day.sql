-- 40_contract_dates_debit_day.sql
-- Add contract_start_date, contract_end_date, first_invoice_date, debit_day to deals.
-- Amendment queue for debit_day changes (field agent requests → finance/admin approves).

-- ─── 1. New columns on deals ──────────────────────────────────────────────────
alter table public.deals
  add column if not exists contract_start_date  date,
  add column if not exists contract_end_date    date,
  add column if not exists first_invoice_date   date,
  add column if not exists debit_day            smallint check (debit_day in (1, 15));

-- ─── 2. deal_debit_amendments table ─────────────────────────────────────────
create table if not exists public.deal_debit_amendments (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals(id) on delete cascade,

  requested_by  uuid not null references auth.users(id),
  requested_at  timestamptz not null default now(),
  old_debit_day smallint not null check (old_debit_day in (1,15)),
  new_debit_day smallint not null check (new_debit_day in (1,15)),

  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,
  reject_reason text,

  notes         text,
  created_at    timestamptz not null default now()
);

alter table public.deal_debit_amendments enable row level security;

create policy "requester sees own amendments"
  on public.deal_debit_amendments for select
  using (requested_by = auth.uid());

create policy "admin/owner see all amendments"
  on public.deal_debit_amendments for select
  using (public.current_user_role()::text in ('owner','admin'));

-- ─── 3. RPC: request_debit_day_change ────────────────────────────────────────
create or replace function public.request_debit_day_change(
  p_deal_id       uuid,
  p_new_debit_day smallint,
  p_notes         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller      uuid := auth.uid();
  v_caller_role public.app_role;
  v_deal        record;
  v_amendment_id uuid;
begin
  raise log '[request_debit_day_change] START caller=% deal=% new_day=%',
    v_caller, p_deal_id, p_new_debit_day;

  if v_caller is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  v_caller_role := public.current_user_role();
  if v_caller_role is null then raise exception 'no app role' using errcode = '42501'; end if;

  if p_new_debit_day not in (1, 15) then
    raise exception 'debit_day must be 1 or 15 (got %)', p_new_debit_day using errcode = '22023';
  end if;

  select id, debit_day, client_id, client_name into v_deal
    from public.deals where id = p_deal_id;
  if not found then
    raise exception 'deal_not_found: %', p_deal_id using errcode = '23503';
  end if;

  if v_deal.debit_day is null then
    raise exception 'deal has no debit_day set — set it first via stamp_deal_contract_dates'
      using errcode = '23514';
  end if;

  if v_deal.debit_day = p_new_debit_day then
    raise exception 'new_debit_day is the same as current (%)', p_new_debit_day
      using errcode = '23514';
  end if;

  update public.deal_debit_amendments
     set status = 'rejected', reject_reason = 'superseded by new request',
         decided_at = now()
   where deal_id = p_deal_id and status = 'pending';

  insert into public.deal_debit_amendments (
    deal_id, requested_by, old_debit_day, new_debit_day, notes
  ) values (
    p_deal_id, v_caller, v_deal.debit_day, p_new_debit_day, p_notes
  )
  returning id into v_amendment_id;

  insert into public.client_activity_log (
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  ) values (
    v_deal.client_id, v_deal.client_name,
    v_caller, v_caller_role::text,
    'debit_day_change_requested', 'finance',
    format('Debit day change requested: %s → %s for deal %s',
      v_deal.debit_day, p_new_debit_day, p_deal_id),
    jsonb_build_object(
      'deal_id',       p_deal_id,
      'old_debit_day', v_deal.debit_day,
      'new_debit_day', p_new_debit_day,
      'amendment_id',  v_amendment_id
    )
  );

  raise log '[request_debit_day_change] DONE amendment=%', v_amendment_id;

  return jsonb_build_object(
    'ok',           true,
    'amendment_id', v_amendment_id,
    'status',       'pending'
  );
end $$;

grant execute on function public.request_debit_day_change(uuid, smallint, text) to authenticated;

-- ─── 4. RPC: approve_debit_day_change ────────────────────────────────────────
create or replace function public.approve_debit_day_change(p_amendment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller      uuid := auth.uid();
  v_caller_role public.app_role;
  v_amendment   public.deal_debit_amendments;
begin
  raise log '[approve_debit_day_change] START caller=% amendment=%', v_caller, p_amendment_id;

  if v_caller is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  v_caller_role := public.current_user_role();
  if v_caller_role is null or v_caller_role::text not in ('owner','admin') then
    raise exception 'forbidden: only owner/admin can approve debit day changes'
      using errcode = '42501';
  end if;

  select * into v_amendment from public.deal_debit_amendments where id = p_amendment_id;
  if not found then
    raise exception 'amendment_not_found: %', p_amendment_id using errcode = '23503';
  end if;

  if v_amendment.status != 'pending' then
    raise exception 'amendment % is already % — cannot approve',
      p_amendment_id, v_amendment.status using errcode = '23514';
  end if;

  update public.deals
     set debit_day  = v_amendment.new_debit_day,
         updated_at = now()
   where id = v_amendment.deal_id;

  update public.deal_debit_amendments
     set status     = 'approved',
         decided_by = v_caller,
         decided_at = now()
   where id = p_amendment_id;

  insert into public.client_activity_log (
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  )
  select
    d.client_id, d.client_name,
    v_caller, v_caller_role::text,
    'debit_day_change_approved', 'finance',
    format('Debit day change approved: %s → %s for deal %s',
      v_amendment.old_debit_day, v_amendment.new_debit_day, v_amendment.deal_id),
    jsonb_build_object(
      'deal_id',       v_amendment.deal_id,
      'old_debit_day', v_amendment.old_debit_day,
      'new_debit_day', v_amendment.new_debit_day,
      'amendment_id',  p_amendment_id
    )
  from public.deals d where d.id = v_amendment.deal_id;

  raise log '[approve_debit_day_change] DONE deal=% new_day=%',
    v_amendment.deal_id, v_amendment.new_debit_day;

  return jsonb_build_object(
    'ok',            true,
    'amendment_id',  p_amendment_id,
    'new_debit_day', v_amendment.new_debit_day
  );
end $$;

grant execute on function public.approve_debit_day_change(uuid) to authenticated;

-- ─── 5. RPC: reject_debit_day_change ─────────────────────────────────────────
create or replace function public.reject_debit_day_change(
  p_amendment_id uuid,
  p_reason       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller      uuid := auth.uid();
  v_caller_role public.app_role;
  v_amendment   public.deal_debit_amendments;
begin
  raise log '[reject_debit_day_change] START caller=% amendment=%', v_caller, p_amendment_id;

  if v_caller is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  v_caller_role := public.current_user_role();
  if v_caller_role is null or v_caller_role::text not in ('owner','admin') then
    raise exception 'forbidden: only owner/admin can reject debit day changes'
      using errcode = '42501';
  end if;

  select * into v_amendment from public.deal_debit_amendments where id = p_amendment_id;
  if not found then
    raise exception 'amendment_not_found: %', p_amendment_id using errcode = '23503';
  end if;

  if v_amendment.status != 'pending' then
    raise exception 'amendment % is already % — cannot reject',
      p_amendment_id, v_amendment.status using errcode = '23514';
  end if;

  update public.deal_debit_amendments
     set status        = 'rejected',
         decided_by    = v_caller,
         decided_at    = now(),
         reject_reason = coalesce(p_reason, 'No reason provided')
   where id = p_amendment_id;

  insert into public.client_activity_log (
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  )
  select
    d.client_id, d.client_name,
    v_caller, v_caller_role::text,
    'debit_day_change_rejected', 'finance',
    format('Debit day change rejected for deal %s (%s → %s): %s',
      v_amendment.deal_id, v_amendment.old_debit_day,
      v_amendment.new_debit_day, coalesce(p_reason,'no reason')),
    jsonb_build_object(
      'deal_id',       v_amendment.deal_id,
      'old_debit_day', v_amendment.old_debit_day,
      'new_debit_day', v_amendment.new_debit_day,
      'amendment_id',  p_amendment_id,
      'reason',        p_reason
    )
  from public.deals d where d.id = v_amendment.deal_id;

  raise log '[reject_debit_day_change] DONE';

  return jsonb_build_object('ok', true, 'amendment_id', p_amendment_id, 'status', 'rejected');
end $$;

grant execute on function public.reject_debit_day_change(uuid, text) to authenticated;

-- ─── 6. RPC: stamp_deal_contract_dates ───────────────────────────────────────
-- Called from the UI after close_sale returns deal_id.
-- Stamps contract dates + debit_day on deals + contracts table.
create or replace function public.stamp_deal_contract_dates(
  p_deal_id            uuid,
  p_contract_start     date,
  p_debit_day          smallint,
  p_contract_end       date   default null,
  p_first_invoice_date date   default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller      uuid := auth.uid();
  v_caller_role public.app_role;
  v_deal        record;
  v_term_months integer;
  v_end_date    date;
  v_first_inv   date;
  v_next_day    date;
begin
  raise log '[stamp_deal_contract_dates] START caller=% deal=%', v_caller, p_deal_id;

  if v_caller is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  v_caller_role := public.current_user_role();
  if v_caller_role is null
     or v_caller_role::text not in ('owner','admin','field_agent','cpc') then
    raise exception 'forbidden: role % cannot stamp contract dates', v_caller_role
      using errcode = '42501';
  end if;

  if p_debit_day is not null and p_debit_day not in (1, 15) then
    raise exception 'debit_day must be 1 or 15 (got %)', p_debit_day using errcode = '22023';
  end if;

  select d.id, d.client_id, d.client_name, d.package, c.initial_term_months
    into v_deal
    from public.deals d
    left join public.contracts c on c.deal_id = d.id
   where d.id = p_deal_id
   limit 1;

  if not found then
    raise exception 'deal_not_found: %', p_deal_id using errcode = '23503';
  end if;

  v_term_months := coalesce(v_deal.initial_term_months, 12);
  v_end_date := coalesce(
    p_contract_end,
    p_contract_start + (v_term_months || ' months')::interval
  );

  if p_first_invoice_date is not null then
    v_first_inv := p_first_invoice_date;
  elsif p_debit_day is not null and p_contract_start is not null then
    v_next_day := date_trunc('month', p_contract_start)::date + (p_debit_day - 1);
    if v_next_day < p_contract_start then
      v_next_day := v_next_day + interval '1 month';
    end if;
    v_first_inv := v_next_day;
  end if;

  update public.deals
     set contract_start_date = p_contract_start,
         contract_end_date   = v_end_date,
         first_invoice_date  = v_first_inv,
         debit_day           = p_debit_day,
         updated_at          = now()
   where id = p_deal_id;

  update public.contracts
     set contract_start_date = p_contract_start,
         contract_end_date   = v_end_date,
         updated_at          = now()
   where deal_id = p_deal_id;

  insert into public.client_activity_log (
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  ) values (
    v_deal.client_id, v_deal.client_name,
    v_caller, v_caller_role::text,
    'contract_dates_stamped', 'contract',
    format('Contract dates set: start=%s end=%s debit_day=%s',
      p_contract_start, v_end_date, p_debit_day),
    jsonb_build_object(
      'deal_id',             p_deal_id,
      'contract_start_date', p_contract_start,
      'contract_end_date',   v_end_date,
      'first_invoice_date',  v_first_inv,
      'debit_day',           p_debit_day
    )
  );

  raise log '[stamp_deal_contract_dates] DONE start=% end=% debit=%',
    p_contract_start, v_end_date, p_debit_day;

  return jsonb_build_object(
    'ok',                  true,
    'contract_start_date', p_contract_start,
    'contract_end_date',   v_end_date,
    'first_invoice_date',  v_first_inv,
    'debit_day',           p_debit_day
  );
end $$;

grant execute on function public.stamp_deal_contract_dates(uuid, date, smallint, date, date)
  to authenticated;
