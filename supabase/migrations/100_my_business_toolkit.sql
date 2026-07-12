-- 100_my_business_toolkit.sql
-- My Business Toolkit — industry-aware customer/booking/notes CRM for clients.
-- Three tables, two triggers, eleven RPCs. Client-owned data with staff read access.

-- ============================================================================
-- TABLES
-- ============================================================================

create table if not exists public.biz_customers (
  id                    uuid primary key default gen_random_uuid(),
  owner_client_id       uuid not null references public.clients(id) on delete cascade,

  full_name             text not null,
  phone                 text,
  email                 text,
  whatsapp              text,
  address               text,

  customer_type         text not null default 'individual'
    check (customer_type in ('individual','business','supplier')),
  company_name          text,
  source                text,
  tags                  text[] not null default '{}',

  notes                 text,
  is_favorite           boolean not null default false,
  birthday              date,
  anniversary           date,
  status                text not null default 'active'
    check (status in ('active','inactive','blacklisted')),

  -- Auto-computed stats (maintained by trigger on biz_bookings)
  total_bookings        integer not null default 0,
  total_spent           numeric(12,2) not null default 0,
  average_spend         numeric(12,2) not null default 0,
  last_visit_at         timestamptz,
  first_visit_at        timestamptz,
  visit_frequency_days  numeric(8,2),

  -- Email tracking
  welcome_email_sent    boolean not null default false,
  welcome_email_sent_at timestamptz,
  emails_sent_count     integer not null default 0,
  last_email_sent_at    timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists biz_customers_owner_idx     on public.biz_customers(owner_client_id);
create index if not exists biz_customers_status_idx    on public.biz_customers(owner_client_id, status);
create index if not exists biz_customers_favorite_idx  on public.biz_customers(owner_client_id, is_favorite) where is_favorite;
create index if not exists biz_customers_search_idx    on public.biz_customers using gin (to_tsvector('simple', coalesce(full_name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(email,'')));

create table if not exists public.biz_bookings (
  id                    uuid primary key default gen_random_uuid(),
  owner_client_id       uuid not null references public.clients(id) on delete cascade,
  customer_id           uuid references public.biz_customers(id) on delete set null,

  -- Denormalised at insert-time for historical accuracy if customer edited later
  customer_name         text,
  customer_phone        text,
  customer_email        text,

  booking_date          timestamptz not null,
  booking_end           timestamptz,
  duration_minutes      integer,
  all_day               boolean not null default false,

  status                text not null default 'confirmed'
    check (status in ('confirmed','pending','in_progress','completed','cancelled','no_show')),
  cancelled_reason      text,
  completed_at          timestamptz,

  amount                numeric(12,2) not null default 0,
  deposit_amount        numeric(12,2) not null default 0,
  deposit_paid          boolean not null default false,
  payment_method        text,
  payment_status        text not null default 'unpaid'
    check (payment_status in ('unpaid','deposit_paid','paid','refunded','partial')),

  custom_fields         jsonb not null default '{}'::jsonb,
  attachments           jsonb not null default '[]'::jsonb,

  assigned_to           text,
  notes                 text,

  -- Email tracking
  confirmation_sent     boolean not null default false,
  confirmation_sent_at  timestamptz,
  reminder_sent         boolean not null default false,
  reminder_sent_at      timestamptz,
  followup_sent         boolean not null default false,
  followup_sent_at      timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists biz_bookings_owner_idx    on public.biz_bookings(owner_client_id);
create index if not exists biz_bookings_customer_idx on public.biz_bookings(customer_id);
create index if not exists biz_bookings_date_idx     on public.biz_bookings(owner_client_id, booking_date);
create index if not exists biz_bookings_status_idx   on public.biz_bookings(owner_client_id, status);

create table if not exists public.biz_notes (
  id              uuid primary key default gen_random_uuid(),
  owner_client_id uuid not null references public.clients(id) on delete cascade,
  title           text,
  body            text,
  is_pinned       boolean not null default false,
  color           text not null default 'default'
    check (color in ('default','yellow','blue','green','red','purple')),
  category        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists biz_notes_owner_idx  on public.biz_notes(owner_client_id, is_pinned desc, updated_at desc);

-- updated_at bumpers
create or replace function public._biz_bump_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists biz_customers_bump on public.biz_customers;
create trigger biz_customers_bump before update on public.biz_customers
  for each row execute function public._biz_bump_updated_at();

drop trigger if exists biz_bookings_bump on public.biz_bookings;
create trigger biz_bookings_bump before update on public.biz_bookings
  for each row execute function public._biz_bump_updated_at();

drop trigger if exists biz_notes_bump on public.biz_notes;
create trigger biz_notes_bump before update on public.biz_notes
  for each row execute function public._biz_bump_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.biz_customers enable row level security;
alter table public.biz_bookings  enable row level security;
alter table public.biz_notes     enable row level security;

-- biz_customers
drop policy if exists biz_customers_read  on public.biz_customers;
drop policy if exists biz_customers_write on public.biz_customers;
create policy biz_customers_read on public.biz_customers for select using (
  exists (select 1 from public.clients c where c.id = biz_customers.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'field_agent') or public.has_role(auth.uid(),'cpc') or public.has_role(auth.uid(),'coordinator')
);
create policy biz_customers_write on public.biz_customers for all using (
  exists (select 1 from public.clients c where c.id = biz_customers.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (
  exists (select 1 from public.clients c where c.id = biz_customers.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);

-- biz_bookings
drop policy if exists biz_bookings_read  on public.biz_bookings;
drop policy if exists biz_bookings_write on public.biz_bookings;
create policy biz_bookings_read on public.biz_bookings for select using (
  exists (select 1 from public.clients c where c.id = biz_bookings.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'field_agent') or public.has_role(auth.uid(),'cpc') or public.has_role(auth.uid(),'coordinator')
);
create policy biz_bookings_write on public.biz_bookings for all using (
  exists (select 1 from public.clients c where c.id = biz_bookings.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (
  exists (select 1 from public.clients c where c.id = biz_bookings.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);

-- biz_notes
drop policy if exists biz_notes_read  on public.biz_notes;
drop policy if exists biz_notes_write on public.biz_notes;
create policy biz_notes_read on public.biz_notes for select using (
  exists (select 1 from public.clients c where c.id = biz_notes.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'field_agent') or public.has_role(auth.uid(),'cpc') or public.has_role(auth.uid(),'coordinator')
);
create policy biz_notes_write on public.biz_notes for all using (
  exists (select 1 from public.clients c where c.id = biz_notes.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (
  exists (select 1 from public.clients c where c.id = biz_notes.owner_client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);

-- ============================================================================
-- TRIGGER 1: Auto-recompute customer stats on booking change
-- ============================================================================

create or replace function public._biz_recompute_customer_stats(p_customer_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_total_bookings int;
  v_total_spent    numeric(12,2);
  v_first          timestamptz;
  v_last           timestamptz;
  v_freq           numeric(8,2);
begin
  if p_customer_id is null then return; end if;
  select
    count(*) filter (where status not in ('cancelled')),
    coalesce(sum(amount) filter (where status = 'completed'), 0),
    min(booking_date) filter (where status not in ('cancelled')),
    max(booking_date) filter (where status not in ('cancelled'))
  into v_total_bookings, v_total_spent, v_first, v_last
  from public.biz_bookings
  where customer_id = p_customer_id;

  if v_total_bookings > 1 and v_first is not null and v_last is not null then
    v_freq := extract(epoch from (v_last - v_first)) / 86400.0 / greatest(v_total_bookings - 1, 1);
  else
    v_freq := null;
  end if;

  update public.biz_customers set
    total_bookings       = v_total_bookings,
    total_spent          = v_total_spent,
    average_spend        = case when v_total_bookings > 0 then round(v_total_spent / v_total_bookings, 2) else 0 end,
    first_visit_at       = v_first,
    last_visit_at        = v_last,
    visit_frequency_days = v_freq
  where id = p_customer_id;
end $$;

create or replace function public._biz_bookings_stats_trigger() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    perform public._biz_recompute_customer_stats(old.customer_id);
    return old;
  end if;
  perform public._biz_recompute_customer_stats(new.customer_id);
  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    perform public._biz_recompute_customer_stats(old.customer_id);
  end if;
  return new;
end $$;

drop trigger if exists biz_bookings_stats_trg on public.biz_bookings;
create trigger biz_bookings_stats_trg
  after insert or update or delete on public.biz_bookings
  for each row execute function public._biz_bookings_stats_trigger();

-- ============================================================================
-- TRIGGER 2: Power-user milestone alerts (25, 50, 100, 250, 500 customers)
-- ============================================================================

create or replace function public._biz_customer_milestone_trigger() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_count       int;
  v_business    text;
  v_milestones  int[] := array[25, 50, 100, 250, 500];
  v_milestone   int;
  v_type        text;
  v_already     boolean;
begin
  select count(*) into v_count from public.biz_customers where owner_client_id = new.owner_client_id;

  if not (v_count = any(v_milestones)) then return new; end if;
  v_milestone := v_count;

  select business_name into v_business from public.clients where id = new.owner_client_id;
  v_type := 'biz_toolkit_milestone_' || v_milestone::text;

  -- Only fire once per client per milestone
  select exists(
    select 1 from public.staff_notifications
    where related_entity_type = 'client'
      and related_entity_id = new.owner_client_id
      and type = v_type
  ) into v_already;
  if v_already then return new; end if;

  perform public._notify_staff(
    new.owner_client_id,
    v_type,
    '🚀 ' || coalesce(v_business, 'A client') || ' hit ' || v_milestone::text || ' customers in their toolkit!',
    'Their My Business toolkit is growing — good upsell moment.',
    '/owner/clients/' || new.owner_client_id::text,
    'client',
    new.owner_client_id
  );

  return new;
exception when others then
  return new; -- best-effort, never block insert
end $$;

drop trigger if exists biz_customer_milestone_trg on public.biz_customers;
create trigger biz_customer_milestone_trg
  after insert on public.biz_customers
  for each row execute function public._biz_customer_milestone_trigger();

-- ============================================================================
-- HELPER: caller → client id resolver
-- ============================================================================

create or replace function public._biz_current_client() returns uuid
language plpgsql stable security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if auth.uid() is null then return null; end if;
  select id into v_id from public.clients where client_user_id = auth.uid();
  return v_id;
end $$;

-- ============================================================================
-- RPC 1: biz_add_customer — insert + duplicate check + welcome email
-- ============================================================================

create or replace function public.biz_add_customer(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id   uuid := public._biz_current_client();
  v_business    text;
  v_dup_id      uuid;
  v_new_id      uuid;
  v_email       text := nullif(trim(coalesce(p_payload->>'email','')), '');
  v_phone       text := nullif(trim(coalesce(p_payload->>'phone','')), '');
  v_name        text := nullif(trim(coalesce(p_payload->>'full_name','')), '');
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;

  select business_name into v_business from public.clients where id = v_client_id;

  -- Duplicate check on phone OR email (case-insensitive)
  select id into v_dup_id from public.biz_customers
  where owner_client_id = v_client_id
    and status <> 'inactive'
    and (
      (v_phone is not null and phone = v_phone)
      or (v_email is not null and lower(email) = lower(v_email))
    )
  limit 1;
  if v_dup_id is not null then
    return jsonb_build_object('ok', false, 'error', 'duplicate', 'existing_id', v_dup_id);
  end if;

  insert into public.biz_customers(
    owner_client_id, full_name, phone, email, whatsapp, address,
    customer_type, company_name, source, tags, notes, is_favorite,
    birthday, anniversary, status
  ) values (
    v_client_id, v_name, v_phone, v_email,
    nullif(trim(coalesce(p_payload->>'whatsapp','')),''),
    nullif(trim(coalesce(p_payload->>'address','')),''),
    coalesce(nullif(p_payload->>'customer_type',''), 'individual'),
    nullif(trim(coalesce(p_payload->>'company_name','')),''),
    nullif(trim(coalesce(p_payload->>'source','')),''),
    coalesce(
      (select array_agg(t) from jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb)) t),
      '{}'::text[]
    ),
    nullif(trim(coalesce(p_payload->>'notes','')),''),
    coalesce((p_payload->>'is_favorite')::boolean, false),
    nullif(p_payload->>'birthday','')::date,
    nullif(p_payload->>'anniversary','')::date,
    coalesce(nullif(p_payload->>'status',''),'active')
  )
  returning id into v_new_id;

  -- Best-effort welcome email
  if v_email is not null then
    begin
      perform net.http_post(
        url     := 'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object('Content-Type','application/json'),
        body    := jsonb_build_object(
          'template','biz_welcome',
          'to', v_email,
          'payload', jsonb_build_object(
            'businessName', coalesce(v_business, 'Our Business'),
            'customerName', v_name
          )
        ),
        timeout_milliseconds := 3000
      );
      update public.biz_customers set
        welcome_email_sent = true,
        welcome_email_sent_at = now(),
        emails_sent_count = emails_sent_count + 1,
        last_email_sent_at = now()
      where id = v_new_id;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'id', v_new_id, 'welcome_email_sent', v_email is not null);
end $function$;

revoke all on function public.biz_add_customer(jsonb) from public, anon;
grant execute on function public.biz_add_customer(jsonb) to authenticated;

-- ============================================================================
-- RPC 2: biz_get_customers — search/filter/sort/paginate
-- ============================================================================

create or replace function public.biz_get_customers(
  p_search text default null,
  p_status text default null,
  p_tag    text default null,
  p_sort   text default 'newest',
  p_limit  int  default 50,
  p_offset int  default 0
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_rows      jsonb;
  v_total     int;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;

  with base as (
    select * from public.biz_customers
    where owner_client_id = v_client_id
      and (p_status is null or p_status = 'all' or status = p_status
           or (p_status = 'favorites' and is_favorite))
      and (p_tag is null or p_tag = '' or p_tag = any(tags))
      and (p_search is null or p_search = '' or (
           lower(coalesce(full_name,'')) like '%' || lower(p_search) || '%'
        or lower(coalesce(email,''))     like '%' || lower(p_search) || '%'
        or coalesce(phone,'')            like '%' || p_search || '%'
      ))
  ),
  sorted as (
    select * from base order by
      is_favorite desc,
      case when p_sort = 'oldest'         then created_at    end asc  nulls last,
      case when p_sort = 'name'           then lower(full_name) end asc nulls last,
      case when p_sort = 'most_bookings'  then total_bookings end desc nulls last,
      case when p_sort = 'most_spent'     then total_spent   end desc nulls last,
      case when p_sort = 'last_visit'     then last_visit_at end desc nulls last,
      created_at desc
  )
  select
    coalesce(jsonb_agg(to_jsonb(s.*) order by s.is_favorite desc, s.created_at desc), '[]'::jsonb),
    (select count(*) from base)
  into v_rows, v_total
  from (select * from sorted limit greatest(p_limit, 1) offset greatest(p_offset, 0)) s;

  return jsonb_build_object('ok', true, 'customers', v_rows, 'total', v_total);
end $function$;

revoke all on function public.biz_get_customers(text,text,text,text,int,int) from public, anon;
grant execute on function public.biz_get_customers(text,text,text,text,int,int) to authenticated;

-- ============================================================================
-- RPC 3: biz_update_customer — partial update
-- ============================================================================

create or replace function public.biz_update_customer(p_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_owner     uuid;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;
  select owner_client_id into v_owner from public.biz_customers where id = p_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_owner <> v_client_id then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.biz_customers set
    full_name    = coalesce(nullif(p_payload->>'full_name',''),    full_name),
    phone        = case when p_payload ? 'phone'        then nullif(trim(p_payload->>'phone'),'')        else phone        end,
    email        = case when p_payload ? 'email'        then nullif(trim(p_payload->>'email'),'')        else email        end,
    whatsapp     = case when p_payload ? 'whatsapp'     then nullif(trim(p_payload->>'whatsapp'),'')     else whatsapp     end,
    address      = case when p_payload ? 'address'      then nullif(trim(p_payload->>'address'),'')      else address      end,
    customer_type= coalesce(nullif(p_payload->>'customer_type',''), customer_type),
    company_name = case when p_payload ? 'company_name' then nullif(trim(p_payload->>'company_name'),'') else company_name end,
    source       = case when p_payload ? 'source'       then nullif(trim(p_payload->>'source'),'')       else source       end,
    tags         = case when p_payload ? 'tags'         then coalesce(
                          (select array_agg(t) from jsonb_array_elements_text(p_payload->'tags') t),
                          '{}'::text[]
                        )                                                                                else tags         end,
    notes        = case when p_payload ? 'notes'        then nullif(trim(p_payload->>'notes'),'')        else notes        end,
    is_favorite  = coalesce((p_payload->>'is_favorite')::boolean, is_favorite),
    birthday     = case when p_payload ? 'birthday'     then nullif(p_payload->>'birthday','')::date     else birthday     end,
    anniversary  = case when p_payload ? 'anniversary'  then nullif(p_payload->>'anniversary','')::date  else anniversary  end,
    status       = coalesce(nullif(p_payload->>'status',''), status)
  where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end $function$;

revoke all on function public.biz_update_customer(uuid, jsonb) from public, anon;
grant execute on function public.biz_update_customer(uuid, jsonb) to authenticated;

-- ============================================================================
-- RPC 4: biz_delete_customer — soft or hard
-- ============================================================================

create or replace function public.biz_delete_customer(p_id uuid, p_hard boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_owner     uuid;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;
  select owner_client_id into v_owner from public.biz_customers where id = p_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_owner <> v_client_id then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_hard then
    delete from public.biz_bookings  where customer_id = p_id;
    delete from public.biz_customers where id = p_id;
  else
    update public.biz_customers set status = 'inactive' where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'hard', p_hard);
end $function$;

revoke all on function public.biz_delete_customer(uuid, boolean) from public, anon;
grant execute on function public.biz_delete_customer(uuid, boolean) to authenticated;

-- ============================================================================
-- RPC 5: biz_add_booking — insert + resolve customer + confirmation email
-- ============================================================================

create or replace function public.biz_add_booking(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id     uuid := public._biz_current_client();
  v_business      text;
  v_customer_id   uuid := nullif(p_payload->>'customer_id','')::uuid;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_new_id        uuid;
  v_amount        numeric(12,2) := coalesce((p_payload->>'amount')::numeric(12,2), 0);
  v_booking_date  timestamptz;
  v_send_email    boolean := coalesce((p_payload->>'send_confirmation_email')::boolean, true);
  v_custom        jsonb := coalesce(p_payload->'custom_fields','{}'::jsonb);
  v_service_label text;
  v_date_fmt      text;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;
  v_booking_date := nullif(p_payload->>'booking_date','')::timestamptz;
  if v_booking_date is null then return jsonb_build_object('ok', false, 'error', 'booking_date_required'); end if;

  select business_name into v_business from public.clients where id = v_client_id;

  if v_customer_id is not null then
    select full_name, email, phone into v_customer_name, v_customer_email, v_customer_phone
    from public.biz_customers where id = v_customer_id and owner_client_id = v_client_id;
    if v_customer_name is null then
      return jsonb_build_object('ok', false, 'error', 'customer_not_found');
    end if;
  else
    v_customer_name  := nullif(trim(coalesce(p_payload->>'customer_name','')),'');
    v_customer_email := nullif(trim(coalesce(p_payload->>'customer_email','')),'');
    v_customer_phone := nullif(trim(coalesce(p_payload->>'customer_phone','')),'');
  end if;

  insert into public.biz_bookings(
    owner_client_id, customer_id, customer_name, customer_phone, customer_email,
    booking_date, booking_end, duration_minutes, all_day,
    status, amount, deposit_amount, deposit_paid, payment_method, payment_status,
    custom_fields, attachments, assigned_to, notes
  ) values (
    v_client_id, v_customer_id, v_customer_name, v_customer_phone, v_customer_email,
    v_booking_date,
    nullif(p_payload->>'booking_end','')::timestamptz,
    nullif(p_payload->>'duration_minutes','')::int,
    coalesce((p_payload->>'all_day')::boolean, false),
    coalesce(nullif(p_payload->>'status',''), 'confirmed'),
    v_amount,
    coalesce((p_payload->>'deposit_amount')::numeric(12,2), 0),
    coalesce((p_payload->>'deposit_paid')::boolean, false),
    nullif(p_payload->>'payment_method',''),
    coalesce(nullif(p_payload->>'payment_status',''), 'unpaid'),
    v_custom,
    coalesce(p_payload->'attachments','[]'::jsonb),
    nullif(p_payload->>'assigned_to',''),
    nullif(p_payload->>'notes','')
  )
  returning id into v_new_id;

  if v_send_email and v_customer_email is not null then
    v_service_label := coalesce(
      v_custom->>'service_type',   v_custom->>'treatment',   v_custom->>'garment_type',
      v_custom->>'item_type',      v_custom->>'arrangement', v_custom->>'shoot_type',
      v_custom->>'event_type',     v_custom->>'job_type',    v_custom->>'service',
      v_custom->>'product',        v_custom->>'wash_type',   v_custom->>'class_type',
      v_custom->>'instrument',     v_custom->>'device',      v_custom->>'issue',
      'your booking'
    );
    v_date_fmt := to_char(v_booking_date at time zone 'Africa/Johannesburg', 'FMDay FMDD FMMon YYYY HH12:MI AM');

    begin
      perform net.http_post(
        url     := 'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object('Content-Type','application/json'),
        body    := jsonb_build_object(
          'template','biz_booking_confirmed',
          'to', v_customer_email,
          'payload', jsonb_build_object(
            'businessName', coalesce(v_business, 'Our Business'),
            'customerName', v_customer_name,
            'service',      v_service_label,
            'dateFormatted', v_date_fmt,
            'amountZar',    v_amount
          )
        ),
        timeout_milliseconds := 3000
      );
      update public.biz_bookings set
        confirmation_sent = true,
        confirmation_sent_at = now()
      where id = v_new_id;

      if v_customer_id is not null then
        update public.biz_customers set
          emails_sent_count = emails_sent_count + 1,
          last_email_sent_at = now()
        where id = v_customer_id;
      end if;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'id', v_new_id, 'confirmation_sent', v_send_email and v_customer_email is not null);
end $function$;

revoke all on function public.biz_add_booking(jsonb) from public, anon;
grant execute on function public.biz_add_booking(jsonb) to authenticated;

-- ============================================================================
-- RPC 6: biz_get_bookings — filtered listing
-- ============================================================================

create or replace function public.biz_get_bookings(
  p_status      text default null,
  p_from        timestamptz default null,
  p_to          timestamptz default null,
  p_customer_id uuid default null,
  p_limit       int  default 200
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_rows      jsonb;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;

  select coalesce(jsonb_agg(row_to_json(b) order by b.booking_date desc), '[]'::jsonb) into v_rows from (
    select * from public.biz_bookings
    where owner_client_id = v_client_id
      and (p_status      is null or p_status = 'all' or status = p_status)
      and (p_from        is null or booking_date >= p_from)
      and (p_to          is null or booking_date <= p_to)
      and (p_customer_id is null or customer_id = p_customer_id)
    order by booking_date desc
    limit greatest(p_limit, 1)
  ) b;

  return jsonb_build_object('ok', true, 'bookings', v_rows);
end $function$;

revoke all on function public.biz_get_bookings(text,timestamptz,timestamptz,uuid,int) from public, anon;
grant execute on function public.biz_get_bookings(text,timestamptz,timestamptz,uuid,int) to authenticated;

-- ============================================================================
-- RPC 7: biz_update_booking — partial update, auto-stamps completed_at
-- ============================================================================

create or replace function public.biz_update_booking(p_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_owner     uuid;
  v_new_status text;
  v_old_status text;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;
  select owner_client_id, status into v_owner, v_old_status from public.biz_bookings where id = p_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_owner <> v_client_id then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  v_new_status := coalesce(nullif(p_payload->>'status',''), v_old_status);

  update public.biz_bookings set
    status           = v_new_status,
    cancelled_reason = case when v_new_status = 'cancelled' then coalesce(nullif(p_payload->>'cancelled_reason',''), cancelled_reason) else cancelled_reason end,
    completed_at     = case when v_new_status = 'completed' and completed_at is null then now()
                            when v_new_status <> 'completed' then null else completed_at end,
    booking_date     = coalesce(nullif(p_payload->>'booking_date','')::timestamptz, booking_date),
    booking_end      = case when p_payload ? 'booking_end' then nullif(p_payload->>'booking_end','')::timestamptz else booking_end end,
    duration_minutes = case when p_payload ? 'duration_minutes' then nullif(p_payload->>'duration_minutes','')::int else duration_minutes end,
    amount           = coalesce((p_payload->>'amount')::numeric(12,2), amount),
    deposit_amount   = coalesce((p_payload->>'deposit_amount')::numeric(12,2), deposit_amount),
    deposit_paid     = coalesce((p_payload->>'deposit_paid')::boolean, deposit_paid),
    payment_method   = case when p_payload ? 'payment_method' then nullif(p_payload->>'payment_method','') else payment_method end,
    payment_status   = coalesce(nullif(p_payload->>'payment_status',''), payment_status),
    custom_fields    = case when p_payload ? 'custom_fields' then coalesce(p_payload->'custom_fields', custom_fields) else custom_fields end,
    attachments      = case when p_payload ? 'attachments'   then coalesce(p_payload->'attachments',   attachments)   else attachments   end,
    assigned_to      = case when p_payload ? 'assigned_to'   then nullif(p_payload->>'assigned_to','')                else assigned_to   end,
    notes            = case when p_payload ? 'notes'         then nullif(p_payload->>'notes','')                      else notes         end
  where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_new_status);
end $function$;

revoke all on function public.biz_update_booking(uuid, jsonb) from public, anon;
grant execute on function public.biz_update_booking(uuid, jsonb) to authenticated;

-- ============================================================================
-- RPC 8: biz_get_notes / biz_save_note / biz_delete_note
-- ============================================================================

create or replace function public.biz_get_notes() returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_rows      jsonb;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;
  select coalesce(jsonb_agg(row_to_json(n) order by n.is_pinned desc, n.updated_at desc), '[]'::jsonb) into v_rows
  from public.biz_notes n where owner_client_id = v_client_id;
  return jsonb_build_object('ok', true, 'notes', v_rows);
end $function$;

create or replace function public.biz_save_note(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_id        uuid := nullif(p_payload->>'id','')::uuid;
  v_owner     uuid;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;

  if v_id is null then
    insert into public.biz_notes(owner_client_id, title, body, is_pinned, color, category)
    values (
      v_client_id,
      nullif(trim(coalesce(p_payload->>'title','')),''),
      nullif(trim(coalesce(p_payload->>'body','')),''),
      coalesce((p_payload->>'is_pinned')::boolean, false),
      coalesce(nullif(p_payload->>'color',''), 'default'),
      nullif(trim(coalesce(p_payload->>'category','')),'')
    )
    returning id into v_id;
  else
    select owner_client_id into v_owner from public.biz_notes where id = v_id;
    if v_owner is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    if v_owner <> v_client_id then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    update public.biz_notes set
      title     = case when p_payload ? 'title'    then nullif(trim(p_payload->>'title'),'')    else title    end,
      body      = case when p_payload ? 'body'     then nullif(trim(p_payload->>'body'),'')     else body     end,
      is_pinned = coalesce((p_payload->>'is_pinned')::boolean, is_pinned),
      color     = coalesce(nullif(p_payload->>'color',''), color),
      category  = case when p_payload ? 'category' then nullif(trim(p_payload->>'category'),'') else category end
    where id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

create or replace function public.biz_delete_note(p_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_owner     uuid;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;
  select owner_client_id into v_owner from public.biz_notes where id = p_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_owner <> v_client_id then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  delete from public.biz_notes where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $function$;

revoke all on function public.biz_get_notes()   from public, anon;
revoke all on function public.biz_save_note(jsonb) from public, anon;
revoke all on function public.biz_delete_note(uuid) from public, anon;
grant execute on function public.biz_get_notes()   to authenticated;
grant execute on function public.biz_save_note(jsonb) to authenticated;
grant execute on function public.biz_delete_note(uuid) to authenticated;

-- ============================================================================
-- RPC 9: biz_get_dashboard — everything for BizDashboard page
-- ============================================================================

create or replace function public.biz_get_dashboard() returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_now       timestamptz := now();
  v_month0    timestamptz;
  v_month_prev0 timestamptz;
  v_month_prev1 timestamptz;
  v_total_customers int;
  v_new_this int;
  v_new_last int;
  v_bookings_this int;
  v_bookings_last int;
  v_revenue_this numeric(12,2);
  v_revenue_last numeric(12,2);
  v_today_bookings int;
  v_top_customer jsonb;
  v_next_booking jsonb;
  v_recent_bookings jsonb;
  v_welcome_sent int;
  v_confirmation_sent int;
  v_industry text;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;

  v_month0      := date_trunc('month', v_now);
  v_month_prev0 := v_month0 - interval '1 month';
  v_month_prev1 := v_month0;

  select industry into v_industry from public.clients where id = v_client_id;

  select count(*) into v_total_customers from public.biz_customers
  where owner_client_id = v_client_id and status <> 'inactive';

  select count(*) into v_new_this from public.biz_customers
  where owner_client_id = v_client_id and created_at >= v_month0;
  select count(*) into v_new_last from public.biz_customers
  where owner_client_id = v_client_id and created_at >= v_month_prev0 and created_at < v_month_prev1;

  select count(*), coalesce(sum(amount) filter (where status = 'completed'), 0)
  into v_bookings_this, v_revenue_this
  from public.biz_bookings
  where owner_client_id = v_client_id and booking_date >= v_month0;

  select count(*), coalesce(sum(amount) filter (where status = 'completed'), 0)
  into v_bookings_last, v_revenue_last
  from public.biz_bookings
  where owner_client_id = v_client_id
    and booking_date >= v_month_prev0 and booking_date < v_month_prev1;

  select count(*) into v_today_bookings from public.biz_bookings
  where owner_client_id = v_client_id
    and booking_date >= date_trunc('day', v_now)
    and booking_date <  date_trunc('day', v_now) + interval '1 day'
    and status not in ('cancelled');

  select to_jsonb(c) into v_top_customer from (
    select id, full_name, phone, email, total_bookings, total_spent, is_favorite
    from public.biz_customers
    where owner_client_id = v_client_id and status <> 'inactive'
    order by total_spent desc nulls last, total_bookings desc nulls last
    limit 1
  ) c;

  select to_jsonb(b) into v_next_booking from (
    select id, customer_name, customer_email, booking_date, amount, status, custom_fields
    from public.biz_bookings
    where owner_client_id = v_client_id
      and booking_date >= v_now
      and status not in ('cancelled','completed')
    order by booking_date asc
    limit 1
  ) b;

  select coalesce(jsonb_agg(row_to_json(b) order by b.booking_date desc), '[]'::jsonb) into v_recent_bookings from (
    select id, customer_name, booking_date, amount, status, custom_fields
    from public.biz_bookings
    where owner_client_id = v_client_id
    order by booking_date desc
    limit 5
  ) b;

  select count(*) into v_welcome_sent from public.biz_customers
  where owner_client_id = v_client_id and welcome_email_sent;
  select count(*) into v_confirmation_sent from public.biz_bookings
  where owner_client_id = v_client_id and confirmation_sent;

  return jsonb_build_object(
    'ok', true,
    'industry', v_industry,
    'stats', jsonb_build_object(
      'total_customers', v_total_customers,
      'new_this_month',  v_new_this,
      'new_last_month',  v_new_last,
      'bookings_this_month', v_bookings_this,
      'bookings_last_month', v_bookings_last,
      'revenue_this_month',  v_revenue_this,
      'revenue_last_month',  v_revenue_last,
      'today_bookings', v_today_bookings,
      'welcome_emails_sent', v_welcome_sent,
      'confirmations_sent', v_confirmation_sent
    ),
    'top_customer', v_top_customer,
    'next_booking', v_next_booking,
    'recent_bookings', v_recent_bookings
  );
end $function$;

revoke all on function public.biz_get_dashboard() from public, anon;
grant execute on function public.biz_get_dashboard() to authenticated;

-- ============================================================================
-- RPC 10: biz_export_customers — flat table for CSV (POPIA)
-- ============================================================================

create or replace function public.biz_export_customers() returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_client_id uuid := public._biz_current_client();
  v_rows      jsonb;
begin
  if v_client_id is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;
  select coalesce(jsonb_agg(row_to_json(c) order by c.created_at desc), '[]'::jsonb) into v_rows from (
    select
      full_name, phone, email, whatsapp, address, customer_type, company_name,
      source, array_to_string(tags, '|') as tags, status, is_favorite,
      birthday, anniversary,
      total_bookings, total_spent, average_spend,
      first_visit_at, last_visit_at, visit_frequency_days,
      created_at, updated_at
    from public.biz_customers
    where owner_client_id = v_client_id
    order by created_at desc
  ) c;
  return jsonb_build_object('ok', true, 'rows', v_rows);
end $function$;

revoke all on function public.biz_export_customers() from public, anon;
grant execute on function public.biz_export_customers() to authenticated;

-- ============================================================================
-- RPC 11: staff_get_client_toolkit_stats — staff-only, per-client toolkit stats
-- ============================================================================

create or replace function public.staff_get_client_toolkit_stats(p_client_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_month0 timestamptz := date_trunc('month', now());
  v_customers int;
  v_bookings_month int;
  v_revenue_month numeric(12,2);
  v_welcome int;
  v_confirmations int;
  v_last_activity timestamptz;
  v_top_customer jsonb;
  v_industry text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if not (public.has_role(v_uid,'owner') or public.has_role(v_uid,'admin')
       or public.has_role(v_uid,'field_agent') or public.has_role(v_uid,'cpc')
       or public.has_role(v_uid,'coordinator')) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select industry into v_industry from public.clients where id = p_client_id;

  select count(*) into v_customers from public.biz_customers
  where owner_client_id = p_client_id and status <> 'inactive';

  select count(*), coalesce(sum(amount) filter (where status = 'completed'), 0)
  into v_bookings_month, v_revenue_month
  from public.biz_bookings
  where owner_client_id = p_client_id and booking_date >= v_month0;

  select count(*) into v_welcome from public.biz_customers
  where owner_client_id = p_client_id and welcome_email_sent;

  select count(*) into v_confirmations from public.biz_bookings
  where owner_client_id = p_client_id and confirmation_sent;

  select greatest(
    coalesce((select max(created_at) from public.biz_customers where owner_client_id = p_client_id), 'epoch'::timestamptz),
    coalesce((select max(created_at) from public.biz_bookings  where owner_client_id = p_client_id), 'epoch'::timestamptz),
    coalesce((select max(updated_at) from public.biz_notes     where owner_client_id = p_client_id), 'epoch'::timestamptz)
  ) into v_last_activity;

  select to_jsonb(c) into v_top_customer from (
    select id, full_name, total_bookings, total_spent
    from public.biz_customers
    where owner_client_id = p_client_id and status <> 'inactive'
    order by total_spent desc nulls last
    limit 1
  ) c;

  return jsonb_build_object(
    'ok', true,
    'industry', v_industry,
    'customers', v_customers,
    'bookings_this_month', v_bookings_month,
    'revenue_this_month',  v_revenue_month,
    'welcome_emails_sent', v_welcome,
    'confirmations_sent',  v_confirmations,
    'last_activity_at',    case when v_last_activity = 'epoch'::timestamptz then null else v_last_activity end,
    'top_customer',        v_top_customer,
    'power_user',          v_customers >= 50
  );
end $function$;

revoke all on function public.staff_get_client_toolkit_stats(uuid) from public, anon;
grant execute on function public.staff_get_client_toolkit_stats(uuid) to authenticated;

-- ============================================================================
-- BONUS: staff aggregate for owner dashboard widget
-- ============================================================================

create or replace function public.staff_get_toolkit_aggregate() returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_clients_using int;
  v_total_customers int;
  v_bookings_month int;
  v_top jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;
  if not (public.has_role(v_uid,'owner') or public.has_role(v_uid,'admin')
       or public.has_role(v_uid,'coordinator')) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select count(distinct owner_client_id) into v_clients_using from public.biz_customers;
  select count(*) into v_total_customers from public.biz_customers where status <> 'inactive';
  select count(*) into v_bookings_month from public.biz_bookings
  where booking_date >= date_trunc('month', now());

  select to_jsonb(t) into v_top from (
    select c.id, c.business_name, count(bc.id) as customer_count
    from public.clients c
    join public.biz_customers bc on bc.owner_client_id = c.id and bc.status <> 'inactive'
    group by c.id, c.business_name
    order by customer_count desc
    limit 1
  ) t;

  return jsonb_build_object(
    'ok', true,
    'clients_using', v_clients_using,
    'total_customers', v_total_customers,
    'bookings_this_month', v_bookings_month,
    'top_user', v_top
  );
end $function$;

revoke all on function public.staff_get_toolkit_aggregate() from public, anon;
grant execute on function public.staff_get_toolkit_aggregate() to authenticated;
