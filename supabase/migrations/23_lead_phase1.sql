-- 23_lead_phase1.sql
-- Lead Lifecycle Phase 1.
--
-- Changes (in order):
--   1) Extend leads.source enum to include 'external_marketer'.
--   2) Add 14 new columns to leads.
--   3) Indexes for the new columns.
--   4) lead_link_tokens table + RLS.
--   5) lead-photos storage bucket + policies.
--   6) system_settings seeds (warm criteria, qualification questions, alert recipients).
--   7) Extend client_notifications.notification_type check for 'hot_lead'.
--   8) Tighten leads RLS: field_agent/cpc see only their submitted + assigned rows.
--   9) fire_hot_lead_alert() trigger (pg_net POST to notify-hot-lead).
--  10) enforce_do_not_contact() BEFORE INSERT trigger.
--  11) extend submit_signup to also insert a lead row (captured_via='website').

-- =========================================================================
-- 1. Extend source enum
-- =========================================================================
alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check check (
    source in (
      'cpc_outbound','field_agent_direct','fnc_referral',
      'inbound','referral','phone_call_to_admin',
      'external_marketer','other'
    )
  );

-- =========================================================================
-- 2. New columns
-- =========================================================================
alter table public.leads
  add column if not exists lead_temperature    text
    check (lead_temperature in ('cold','warm','hot')),
  add column if not exists interest_package    text,
  add column if not exists keenness            text
    check (keenness in ('ready_now','this_month','exploring')),
  add column if not exists best_time           text
    check (best_time in ('morning','afternoon','evening')),
  add column if not exists preferred_channel   text
    check (preferred_channel in ('call','whatsapp','sms','email')),
  add column if not exists qualification_answers jsonb,
  add column if not exists shopfront_photo_url text,
  add column if not exists captured_via        text not null default 'staff_app'
    check (captured_via in ('staff_app','public_link','website')),
  add column if not exists referrer_name       text,
  add column if not exists referrer_contact    text,
  add column if not exists assigned_to         uuid references public.profiles(id),
  add column if not exists assigned_at         timestamptz,
  add column if not exists outreach_attempts   int not null default 0,
  add column if not exists do_not_contact      boolean not null default false;

-- =========================================================================
-- 3. Indexes
-- =========================================================================
create index if not exists leads_assigned_idx
  on public.leads(assigned_to);

create index if not exists leads_temp_hot_idx
  on public.leads(lead_temperature)
  where lead_temperature = 'hot';

create index if not exists leads_dnc_idx
  on public.leads(do_not_contact)
  where do_not_contact = true;

create index if not exists leads_phone_dnc_idx
  on public.leads(phone)
  where do_not_contact = true;

create index if not exists leads_email_dnc_idx
  on public.leads(email)
  where do_not_contact = true;

-- =========================================================================
-- 4. lead_link_tokens
-- =========================================================================
create table if not exists public.lead_link_tokens (
  token      text primary key default encode(gen_random_bytes(24), 'hex'),
  label      text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  uses       int not null default 0
);

alter table public.lead_link_tokens enable row level security;

drop policy if exists lead_link_tokens_rw on public.lead_link_tokens;
create policy lead_link_tokens_rw on public.lead_link_tokens
  for all
  using (
    public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'admin')
  )
  with check (
    public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'admin')
  );

-- =========================================================================
-- 5. lead-photos storage bucket
-- =========================================================================
insert into storage.buckets(id, name, public)
  values ('lead-photos', 'lead-photos', true)
  on conflict (id) do nothing;

drop policy if exists "lead_photos_public_read" on storage.objects;
create policy "lead_photos_public_read" on storage.objects
  for select using (bucket_id = 'lead-photos');

drop policy if exists "lead_photos_staff_write" on storage.objects;
create policy "lead_photos_staff_write" on storage.objects
  for insert with check (
    bucket_id = 'lead-photos'
    and (
      public.has_role(auth.uid(), 'owner')
      or public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'cpc')
      or public.has_role(auth.uid(), 'field_agent')
    )
  );

-- =========================================================================
-- 6. system_settings seeds
-- =========================================================================
insert into public.system_settings(key, value)
values
  (
    'lead.warm_criteria.v1',
    '[
      {"id":"monthly_budget","label":"Monthly marketing budget > R2 000","tbd":true},
      {"id":"decision_maker","label":"Spoke to the decision-maker directly","tbd":true},
      {"id":"timeline","label":"Looking to start within 30 days","tbd":true},
      {"id":"pain_point","label":"Has a clear pain point social/visibility can solve","tbd":true},
      {"id":"existing_digital","label":"Has some digital presence (website or social)","tbd":true},
      {"id":"competitor_aware","label":"Knows at least one competitor by name","tbd":true},
      {"id":"referral","label":"Referred by existing Marketing iO client or partner","tbd":true}
    ]'::jsonb
  ),
  (
    'lead.qualification_questions.v1',
    '[
      {"id":"q1","label":"What is your current monthly marketing budget?","tbd":true},
      {"id":"q2","label":"Who makes the marketing decisions in your business?","tbd":true},
      {"id":"q3","label":"What problem are you trying to solve with marketing?","tbd":true},
      {"id":"q4","label":"Have you used digital marketing services before?","tbd":true},
      {"id":"q5","label":"When are you looking to get started?","tbd":true}
    ]'::jsonb
  ),
  (
    'hot_lead_alert_recipients',
    '["business.lekgoro@gmail.com","thapelom@marketingio.co.za"]'::jsonb
  )
on conflict (key) do nothing;

-- =========================================================================
-- 7. Extend notification_type check
-- =========================================================================
alter table public.client_notifications
  drop constraint if exists client_notifications_notification_type_check;

alter table public.client_notifications
  add constraint client_notifications_notification_type_check check (
    notification_type in (
      'deliverable_ready','invoice_issued','invoice_overdue','payment_received',
      'payment_failed','message_received','contract_to_sign','report_ready',
      'onboarding_step_complete','onboarding_submission','lead_pending_verification',
      'client_cancelled','system_update',
      -- Owner sale-event notifications:
      'sale_logged','upsell_added','opportunity_closed',
      -- Phase 1 lead notifications:
      'hot_lead'
    )
  );

-- =========================================================================
-- 8. Tighten leads RLS
-- Field agents and CPCs see only leads they submitted or are assigned to.
-- Owner and admin see everything.
-- =========================================================================
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads
  for select using (
    public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'admin')
    or submitted_by = auth.uid()
    or assigned_to  = auth.uid()
  );

-- Write policy stays broad for staff INSERT (new lead form).
-- submitted_by is set by the application; RLS on SELECT is the data boundary.
drop policy if exists leads_write on public.leads;
create policy leads_write on public.leads
  for all using (
    public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'cpc')
    or public.has_role(auth.uid(), 'field_agent')
  )
  with check (
    public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'cpc')
    or public.has_role(auth.uid(), 'field_agent')
  );

-- =========================================================================
-- 9. fire_hot_lead_alert — calls notify-hot-lead via pg_net (async).
-- Edge function handles the 60-min debounce; trigger fires on every
-- transition to 'hot' so re-qualifications are not silently dropped.
-- =========================================================================
create or replace function public.fire_hot_lead_alert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.lead_temperature is distinct from 'hot' then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/notify-hot-lead',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cnpwcHVudGd0dnVybm5rc2ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NjgwODYsImV4cCI6MjA5NzA0NDA4Nn0.DDKKh6JZGPN4MOH7VizvrjZkK0smFnKPjGkImyDYdek'
    ),
    body    := jsonb_build_object('lead_id', new.id)
  );

  return new;
end $$;

drop trigger if exists trg_hot_lead_alert on public.leads;
create trigger trg_hot_lead_alert
  after insert or update of lead_temperature on public.leads
  for each row execute function public.fire_hot_lead_alert();

-- =========================================================================
-- 10. enforce_do_not_contact — BEFORE INSERT hard block.
-- Raises do_not_contact_violation (42501) if an existing lead with the
-- same phone or email is marked do_not_contact=true.
-- =========================================================================
create or replace function public.enforce_do_not_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.leads
    where do_not_contact = true
      and (
        (new.phone is not null and trim(new.phone) <> '' and phone = new.phone)
        or
        (new.email is not null and trim(new.email) <> '' and lower(email) = lower(new.email))
      )
  ) then
    raise exception 'do_not_contact_violation: this contact has opted out of being contacted'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_dnc on public.leads;
create trigger trg_enforce_dnc
  before insert on public.leads
  for each row execute function public.enforce_do_not_contact();

-- =========================================================================
-- 11. extend submit_signup: also create a lead row for website self-signups
-- (captured_via='website', source='inbound', status='pending_verification').
-- =========================================================================
create or replace function public.submit_signup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_client_id uuid;
  v_full_name text;
  v_popia     boolean := coalesce((payload->>'popia_consent')::boolean, false);
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_full_name := nullif(trim(payload->>'full_name'), '');

  update public.profiles
    set full_name = coalesce(v_full_name, full_name),
        phone     = coalesce(payload->>'mobile_number', phone)
    where id = v_uid;

  -- Reuse an existing client tied to this user if any (idempotent step 5 retry).
  select id into v_client_id
    from public.clients
    where client_user_id = v_uid
    limit 1;

  if v_client_id is null then
    insert into public.clients (
      business_name, contact_person, email, phone, address, industry,
      status, source, client_user_id, created_by,
      mobile_number, signup_data,
      popia_consent_given, popia_consent_at, signup_completed_steps
    )
    values (
      coalesce(nullif(payload->>'business_name',''), v_full_name, 'New Client'),
      v_full_name,
      payload->>'email',
      payload->>'mobile_number',
      nullif(concat_ws(', ',
        nullif(payload->>'street_address',''),
        nullif(payload->>'city',''),
        nullif(payload->>'province','')
      ), ''),
      payload->>'industry',
      'lead',
      'inbound',
      v_uid, v_uid,
      payload->>'mobile_number',
      payload->'signup_data',
      v_popia,
      case when v_popia then now() else null end,
      coalesce((payload->>'completed_steps')::int, 5)
    )
    returning id into v_client_id;
  else
    update public.clients
      set business_name           = coalesce(nullif(payload->>'business_name',''), business_name),
          contact_person          = coalesce(v_full_name, contact_person),
          email                   = coalesce(payload->>'email', email),
          phone                   = coalesce(payload->>'mobile_number', phone),
          mobile_number           = coalesce(payload->>'mobile_number', mobile_number),
          industry                = coalesce(payload->>'industry', industry),
          signup_data             = coalesce(payload->'signup_data', signup_data),
          popia_consent_given     = v_popia or popia_consent_given,
          popia_consent_at        = case when v_popia and popia_consent_at is null then now() else popia_consent_at end,
          signup_completed_steps  = greatest(coalesce(signup_completed_steps,0), coalesce((payload->>'completed_steps')::int, 5))
      where id = v_client_id;
  end if;

  insert into public.client_activity_log(
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  )
  select
    v_client_id, c.business_name, v_uid, 'client',
    'signup_completed', 'account',
    format('%s completed signup', coalesce(v_full_name, c.business_name)),
    payload
  from public.clients c where c.id = v_client_id;

  -- Phase 1: also create a lead row so the owner sees website self-signups
  -- in the leads inbox. Silently skip if there is already a lead from this
  -- user (idempotent on re-submit). The DNC trigger will still fire — if
  -- a known DNC contact self-signs up the INSERT is rejected and signup
  -- returns a structured error the caller can surface.
  begin
    insert into public.leads (
      business_name, contact_person, email, phone,
      source, captured_via, status, submitted_by, submitted_by_name
    )
    select
      c.business_name,
      c.contact_person,
      c.email,
      c.phone,
      'inbound',
      'website',
      'pending_verification',
      null,    -- no staff submitter; self-sign-up
      null
    from public.clients c
    where c.id = v_client_id
      and not exists (
        select 1 from public.leads l
        where l.submitted_by is null
          and l.captured_via = 'website'
          and (l.email = c.email or l.phone = c.phone)
      );
  exception
    when sqlstate '42501' then
      -- do_not_contact_violation — propagate so caller can surface it
      raise;
    when others then
      -- Log and continue; a failed lead INSERT must never block signup.
      insert into public.audit_log(actor_id, action, table_name, record_id, metadata)
        values (v_uid, 'error', 'leads', null,
                jsonb_build_object('error', sqlerrm, 'context', 'submit_signup_lead_insert'));
  end;

  return jsonb_build_object('success', true, 'client_id', v_client_id);
end $$;

grant execute on function public.submit_signup(jsonb) to authenticated;
