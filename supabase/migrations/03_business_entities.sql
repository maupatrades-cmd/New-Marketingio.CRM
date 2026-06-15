-- 03_business_entities.sql
-- 13 business tables + RLS + audit triggers.
-- Field names preserve Base44 snake_case (HANDOVER §5.5).

-- =========================================================================
-- CLIENTS
-- =========================================================================
create table if not exists public.clients (
  id                              uuid primary key default gen_random_uuid(),
  business_name                   text not null,
  contact_person                  text,
  email                           text,
  phone                           text,
  address                         text,
  industry                        text,
  id_reg_number                   text,
  status                          text not null default 'lead'
    check (status in ('lead','prospect','onboarding','active','suspended','cancelled','churned')),
  source                          text
    check (source in ('cpc_outbound','field_agent_direct','fnc_referral','inbound','referral','checkout','other')),
  package                         text default 'none'
    check (package in ('ignite','accelerate','dominate','street_pulse','township_pulse','none')),
  monthly_retainer                numeric(10,2),
  setup_fee_amount                numeric(10,2),
  setup_fee_paid                  boolean not null default false,
  debit_order_date                text check (debit_order_date in ('1st','15th')),
  debit_mandate_signed            boolean not null default false,
  contract_start_date             date,
  contract_end_date               date,
  go_live_date                    date,
  go_live_acknowledged            boolean not null default false,
  brand_assets_received           boolean not null default false,
  onboarding_form_returned        boolean not null default false,
  assigned_field_agent            uuid references auth.users(id),
  assigned_cpc                    uuid references auth.users(id),
  client_user_id                  uuid references auth.users(id),
  notes                           text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      uuid references auth.users(id)
);

create index if not exists clients_status_idx on public.clients(status);
create index if not exists clients_user_idx on public.clients(client_user_id);
create index if not exists clients_email_idx on public.clients(email);

-- =========================================================================
-- LEADS
-- =========================================================================
create table if not exists public.leads (
  id                       uuid primary key default gen_random_uuid(),
  business_name            text,
  contact_person           text,
  phone                    text,
  email                    text,
  address                  text,
  industry                 text,
  source                   text not null default 'cpc_outbound'
    check (source in ('cpc_outbound','field_agent_direct','fnc_referral','inbound','referral','phone_call_to_admin','other')),
  submitted_by             uuid references auth.users(id),
  submitted_by_name        text,
  urgency                  text not null default 'normal' check (urgency in ('normal','urgent')),
  status                   text not null default 'pending_verification'
    check (status in ('pending_verification','verified','rejected','converted','duplicate','needs_clarification')),
  verified_by              uuid references auth.users(id),
  verified_date            date,
  rejection_reason         text,
  converted_to_deal_id     uuid,
  cpc_r87_paid             boolean not null default false,
  warm_lead_criteria       jsonb,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_submitted_by_idx on public.leads(submitted_by);

-- =========================================================================
-- DEALS
-- =========================================================================
create table if not exists public.deals (
  id                            uuid primary key default gen_random_uuid(),
  client_id                     uuid references public.clients(id) on delete set null,
  client_name                   text,
  deal_type                     text not null default 'core_package' check (deal_type in ('core_package','add_on')),
  package                       text default 'none'
    check (package in ('ignite','accelerate','dominate','street_pulse','township_pulse','none')),
  add_on_name                   text,
  stage                         text not null default 'new_lead'
    check (stage in ('new_lead','discovery_visit','proposal_sent','negotiation','closed_won','closed_lost','onboarding')),
  setup_fee                     numeric(10,2),
  monthly_retainer              numeric(10,2),
  probability                   smallint check (probability between 0 and 100),
  closer_id                     uuid references auth.users(id),
  closer_name                   text,
  closer_role                   public.app_role,
  source                        text
    check (source in ('cpc_outbound','field_agent_direct','fnc_referral','inbound','referral','other')),
  cpc_id                        uuid references auth.users(id),
  cpc_name                      text,
  setup_fee_cleared             boolean not null default false,
  setup_fee_cleared_date        date,
  first_debit_cleared           boolean not null default false,
  first_debit_cleared_date      date,
  client_onboarded              boolean not null default false,
  client_onboarded_date         date,
  commission_generated          boolean not null default false,
  lost_reason                   text,
  notes                         text,
  closed_at                     timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index if not exists deals_client_idx on public.deals(client_id);
create index if not exists deals_stage_idx on public.deals(stage);
create index if not exists deals_closer_idx on public.deals(closer_id);
create index if not exists deals_cpc_idx on public.deals(cpc_id);

-- FK from leads to deals (deferred until deals exists)
alter table public.leads
  drop constraint if exists leads_converted_to_deal_id_fkey;
alter table public.leads
  add constraint leads_converted_to_deal_id_fkey
  foreign key (converted_to_deal_id) references public.deals(id) on delete set null;

-- =========================================================================
-- INVOICES
-- =========================================================================
create table if not exists public.invoices (
  id                       uuid primary key default gen_random_uuid(),
  invoice_number           text unique,
  client_id                uuid references public.clients(id) on delete set null,
  client_name              text,
  invoice_type             text not null default 'monthly_retainer'
    check (invoice_type in ('setup_fee','monthly_retainer','add_on_setup','add_on_monthly','once_off','per_sms','cancellation_fee','acceleration_amount')),
  description              text,
  amount                   numeric(10,2) not null,
  vat_applicable           boolean not null default false,
  vat_amount               numeric(10,2) not null default 0,
  total_amount             numeric(10,2) not null,
  issue_date               date,
  due_date                 date,
  -- Carry-over rule: enum matches schema. Default 'draft'; transition 'sent' on issuance.
  status                   text not null default 'draft'
    check (status in ('draft','sent','paid','overdue','failed','cancelled','partial')),
  payment_method           text check (payment_method in ('debit_order','eft','yoco','payfast','cash','other')),
  payment_date             date,
  debit_run_date           date,
  failed_debit_count       smallint not null default 0,
  last_failed_date         date,
  deal_id                  uuid references public.deals(id) on delete set null,
  notes                    text,
  cancellation_reason      text,
  cancelled_by_id          uuid references auth.users(id),
  cancelled_by_name        text,
  cancelled_at             timestamptz,
  assigned_cpc_id          uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists invoices_client_idx on public.invoices(client_id);
create index if not exists invoices_status_idx on public.invoices(status);
create index if not exists invoices_deal_idx on public.invoices(deal_id);

-- =========================================================================
-- COMMISSIONS
-- Carry-over rule §5.4: staff_role enum has NO 'owner'; map owner->founder
-- =========================================================================
create table if not exists public.commissions (
  id                       uuid primary key default gen_random_uuid(),
  staff_id                 uuid not null references auth.users(id),
  staff_name               text,
  staff_role               text not null check (staff_role in ('field_agent','cpc','admin','founder','other')),
  commission_type          text not null check (commission_type in (
    'setup_commission','retainer_commission','cpc_lead_fee','cpc_closure_bonus',
    'fnc_referral','paid_ads_trickle','admin_contract_load','add_on_once_off','add_on_retainer'
  )),
  deal_id                  uuid references public.deals(id) on delete set null,
  client_id                uuid references public.clients(id) on delete set null,
  client_name              text,
  package_or_addon         text,
  base_amount              numeric(10,2),
  rate_percent             numeric(6,2),
  commission_amount        numeric(10,2) not null,
  qualifying_event         text,
  qualifying_event_date    date,
  status                   text not null default 'pending'
    check (status in ('pending','approved','paid','withheld','clawback')),
  payroll_month            text,
  paid_date                date,
  milestone_batch          integer,
  is_backdated             boolean not null default false,
  clawback_reason          text,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists commissions_staff_idx on public.commissions(staff_id);
create index if not exists commissions_deal_idx on public.commissions(deal_id);
create index if not exists commissions_status_idx on public.commissions(status);
create index if not exists commissions_payroll_month_idx on public.commissions(payroll_month);

-- =========================================================================
-- TASKS
-- =========================================================================
create table if not exists public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  description         text,
  client_id           uuid references public.clients(id) on delete set null,
  client_name         text,
  deal_id             uuid references public.deals(id) on delete set null,
  onboarding_id       uuid,
  assigned_to         uuid references auth.users(id),
  assigned_to_name    text,
  created_by          uuid references auth.users(id),
  status              text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  priority            text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_date            date,
  follow_up_date      date,
  completed_at        timestamptz,
  auto_generated      boolean not null default false,
  notes               text,
  comments            jsonb default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists tasks_assigned_idx on public.tasks(assigned_to);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_due_idx on public.tasks(due_date);

-- =========================================================================
-- MONTHLY REPORTS
-- =========================================================================
create table if not exists public.monthly_reports (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references public.clients(id) on delete cascade,
  client_name              text,
  report_month             text not null,
  package                  text,
  report_type              text not null default 'social_performance' check (report_type in (
    'social_performance','website_health','reputation','paid_ads','email_newsletter',
    'video_performance','sms_campaign','deployment_photo','combined'
  )),
  status                   text not null default 'pending' check (status in ('pending','drafted','delivered','acknowledged')),
  due_date                 date,
  delivered_date           date,
  delivered_via            text default 'whatsapp' check (delivered_via in ('whatsapp','email','in_person')),
  report_url               text,
  social_posts_published   integer,
  engagement_summary       text,
  top_performing_content   text,
  recommendations          text,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists monthly_reports_client_idx on public.monthly_reports(client_id);
create index if not exists monthly_reports_month_idx on public.monthly_reports(report_month);

-- =========================================================================
-- PLAYBOOKS
-- =========================================================================
create table if not exists public.playbooks (
  id                     uuid primary key default gen_random_uuid(),
  code                   text unique not null,
  title                  text not null,
  category               text not null check (category in (
    'cold_outreach','discovery','objection_handler','closing','follow_up','upsell','escalation','daily_routine'
  )),
  visible_to_roles       text[] not null,
  content_type           text not null check (content_type in ('script','framework','checklist','template')),
  short_description      text,
  full_content           text,
  related_objection      text,
  usage_notes            text,
  is_favorite_eligible   boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- =========================================================================
-- CONTRACTS
-- =========================================================================
create table if not exists public.contracts (
  id                              uuid primary key default gen_random_uuid(),
  client_id                       uuid references public.clients(id) on delete set null,
  client_name                     text,
  deal_id                         uuid references public.deals(id) on delete set null,
  package                         text check (package in ('ignite','accelerate','dominate','street_pulse','township_pulse','add_on')),
  add_on_name                     text,
  setup_fee                       numeric(10,2),
  monthly_retainer                numeric(10,2),
  initial_term_months             integer,
  debit_order_date                text check (debit_order_date in ('1st','15th')),
  contract_start_date             date,
  contract_end_date               date,
  auto_renews                     boolean not null default true,
  last_renewal_reminder_at        timestamptz,
  last_signature_email_sent_at    timestamptz,
  status                          text not null default 'draft'
    check (status in ('draft','sent','signed','active','cancelled','expired')),
  signed_date                     date,
  signed_by_client                boolean not null default false,
  signed_by_mio                   boolean not null default false,
  popia_signed                    boolean not null default false,
  cancellation_notice_date        date,
  cancellation_effective_date     date,
  cancellation_fee_applied        numeric(10,2),
  loaded_by_admin                 uuid references auth.users(id),
  loaded_date                     date,
  document_url                    text,
  signing_token                   text unique,
  signing_token_expires_at        timestamptz,
  signing_status                  text default 'not_sent'
    check (signing_status in ('not_sent','sent','signed','expired','cancelled')),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index if not exists contracts_client_idx on public.contracts(client_id);
create index if not exists contracts_deal_idx on public.contracts(deal_id);
create index if not exists contracts_status_idx on public.contracts(status);
create index if not exists contracts_signing_token_idx on public.contracts(signing_token);

-- =========================================================================
-- FULFILMENT TEMPLATES — seed 5 core packages
-- =========================================================================
create table if not exists public.fulfilment_templates (
  id                       uuid primary key default gen_random_uuid(),
  code                     text unique not null,
  name                     text not null,
  bucket                   text not null check (bucket in (
    'bucket_a_once_off','bucket_b_setup_recurring','bucket_c_pure_recurring','bucket_d_paid_ads','bucket_e_passive'
  )),
  pricing_setup_zar        numeric(10,2) not null default 0,
  pricing_recurring_zar    numeric(10,2) not null default 0,
  term_months              integer not null default 0,
  soft_sla_days            integer,
  hard_sla_days            integer,
  internal_owner_role      text not null check (internal_owner_role in ('head_of_tech','admin','founder','freelancer','driver','field_agent')),
  setup_deliverables       jsonb default '[]'::jsonb,
  recurring_deliverables   jsonb default '[]'::jsonb,
  client_obligations       text,
  scope_exclusions         text,
  tools_used               text,
  sign_off_criteria        text,
  exit_fee_zar             numeric(10,2) not null default 0,
  exit_fee_window_months   integer not null default 0,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

insert into public.fulfilment_templates(code, name, bucket, pricing_setup_zar, pricing_recurring_zar, term_months, soft_sla_days, hard_sla_days, internal_owner_role, setup_deliverables, recurring_deliverables, client_obligations, sign_off_criteria, exit_fee_zar, exit_fee_window_months)
values
('ignite', 'Ignite', 'bucket_b_setup_recurring', 3980, 490, 12, 5, 10, 'head_of_tech',
  jsonb_build_array('Brand kit setup','Social profile audit','Content calendar (month 1)','Welcome graphics pack'),
  jsonb_build_array('8 social posts','1 reputation summary','Monthly performance report'),
  'Brand assets (logo, colours, fonts), social account access, target audience brief.',
  'Sign-off when client approves first 4 social posts.',
  2000, 6),
('accelerate', 'Accelerate', 'bucket_b_setup_recurring', 6500, 890, 12, 5, 10, 'head_of_tech',
  jsonb_build_array('Full brand kit','Website audit','Social setup (3 channels)','Content calendar (3 months)','Welcome video'),
  jsonb_build_array('12 social posts','2 short videos','Website health check','Monthly performance report'),
  'Brand assets, website credentials, target audience brief, content angles.',
  'Sign-off on calendar + welcome video.',
  4000, 6),
('dominate', 'Dominate', 'bucket_b_setup_recurring', 9800, 1490, 12, 5, 10, 'head_of_tech',
  jsonb_build_array('Full brand kit + style guide','SEO audit','Website audit','Social setup (5 channels)','Content calendar (3 months)','Hero video'),
  jsonb_build_array('20 social posts','4 short videos','SEO maintenance','Paid ads management','Monthly strategic report'),
  'All brand and digital assets, ad budget, ICP brief, competitor list.',
  'Sign-off on strategy doc + hero video.',
  6000, 6),
('street_pulse', 'Street Pulse', 'bucket_c_pure_recurring', 700, 4000, 3, 3, 7, 'driver',
  jsonb_build_array('Street route plan','Driver brief','Signage delivery'),
  jsonb_build_array('Weekly route execution','Photo proof of placement','End-of-week summary'),
  'Approved street zones, target customer description.',
  'Weekly photo proof + GPS log delivered.',
  0, 0),
('township_pulse', 'Township Pulse', 'bucket_a_once_off', 2200, 0, 1, 5, 14, 'driver',
  jsonb_build_array('Township canvass plan','Driver brief','Material delivery'),
  jsonb_build_array(),
  'Approved township zones, materials, target description.',
  'Photo proof + delivery log.',
  0, 0)
on conflict (code) do nothing;

-- =========================================================================
-- DELIVERABLES
-- =========================================================================
create table if not exists public.deliverables (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id) on delete cascade,
  client_name         text,
  deal_id             uuid references public.deals(id) on delete set null,
  template_id         uuid references public.fulfilment_templates(id) on delete set null,
  title               text not null,
  phase               text check (phase in ('setup','monthly_recurring','once_off')),
  product             text,
  assigned_to         uuid references auth.users(id),
  assigned_to_name    text,
  owner_role          text check (owner_role in ('head_of_tech','admin','founder','freelancer','field_agent')),
  status              text not null default 'not_started' check (status in (
    'not_started','in_progress','awaiting_client','client_reviewing','approved','deemed_approved','completed','blocked'
  )),
  due_date            date,
  submitted_date      date,
  review_deadline     date,
  approved_date       date,
  month_year          text,
  notes               text,
  file_urls           text[] default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists deliverables_client_idx on public.deliverables(client_id);
create index if not exists deliverables_assigned_idx on public.deliverables(assigned_to);
create index if not exists deliverables_status_idx on public.deliverables(status);

-- =========================================================================
-- CLIENT ONBOARDING (6 phases)
-- =========================================================================
create table if not exists public.client_onboarding (
  id                                          uuid primary key default gen_random_uuid(),
  deal_id                                     uuid references public.deals(id) on delete set null,
  client_id                                   uuid not null references public.clients(id) on delete cascade,
  client_name                                 text,
  assigned_admin_id                           uuid references auth.users(id),
  assigned_admin_name                         text,
  current_phase                               text not null default 'phase1_contract_signed' check (current_phase in (
    'phase1_contract_signed','phase2_welcome_invoicing','phase3_pre_onboarding',
    'phase4_onboarding_call','phase5_asset_collection','phase6_delivery_start'
  )),
  overall_status                              text not null default 'in_progress' check (overall_status in ('in_progress','blocked','completed')),
  trigger_setup_fee_paid                      boolean not null default false,
  trigger_setup_fee_paid_date                 date,
  trigger_onboarding_form_returned            boolean not null default false,
  trigger_onboarding_form_returned_date       date,
  trigger_debit_mandate_signed                boolean not null default false,
  trigger_debit_mandate_signed_date           date,
  trigger_brand_assets_received               boolean not null default false,
  trigger_brand_assets_received_date          date,
  phase_checklists                            jsonb default '{}'::jsonb,
  completed_at                                timestamptz,
  notes                                       text,
  created_at                                  timestamptz not null default now(),
  updated_at                                  timestamptz not null default now()
);

create index if not exists onboarding_client_idx on public.client_onboarding(client_id);
create index if not exists onboarding_admin_idx on public.client_onboarding(assigned_admin_id);

-- FK from tasks.onboarding_id
alter table public.tasks
  drop constraint if exists tasks_onboarding_id_fkey;
alter table public.tasks
  add constraint tasks_onboarding_id_fkey
  foreign key (onboarding_id) references public.client_onboarding(id) on delete set null;

-- =========================================================================
-- CLIENT ACTIVITY LOG
-- =========================================================================
create table if not exists public.client_activity_log (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.clients(id) on delete cascade,
  client_name     text,
  actor_id        uuid references auth.users(id),
  actor_role      text check (actor_role in ('client','admin','owner','cpc','field_agent','head_of_tech','driver','system')),
  event_type      text not null,
  event_category  text check (event_category in ('auth','profile','payment','invoice','document','communication','support','account','lead','sale','fulfilment')),
  event_summary   text,
  event_metadata  jsonb,
  event_label     text,
  from_value      text,
  to_value        text,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists activity_client_idx on public.client_activity_log(client_id, created_at desc);
create index if not exists activity_actor_idx on public.client_activity_log(actor_id, created_at desc);
create index if not exists activity_category_idx on public.client_activity_log(event_category);

-- =========================================================================
-- CLIENT NOTIFICATIONS
-- =========================================================================
create table if not exists public.client_notifications (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid references public.clients(id) on delete cascade,
  recipient_user_id        uuid references auth.users(id),
  notification_type        text not null check (notification_type in (
    'deliverable_ready','invoice_issued','invoice_overdue','payment_received','payment_failed',
    'message_received','contract_to_sign','report_ready','onboarding_step_complete',
    'onboarding_submission','lead_pending_verification','client_cancelled','system_update'
  )),
  title                    text not null,
  body                     text not null,
  related_entity_type      text,
  related_entity_id        uuid,
  action_url               text,
  is_read                  boolean not null default false,
  read_at                  timestamptz,
  created_at               timestamptz not null default now()
);

create index if not exists notif_recipient_idx on public.client_notifications(recipient_user_id, is_read);
create index if not exists notif_client_idx on public.client_notifications(client_id);

-- =========================================================================
-- updated_at triggers + audit triggers for all 13 business tables
-- =========================================================================
do $$
declare
  t text;
  business_tables text[] := array[
    'clients','leads','deals','invoices','commissions','tasks',
    'monthly_reports','playbooks','contracts','fulfilment_templates',
    'deliverables','client_onboarding','client_notifications'
  ];
begin
  foreach t in array business_tables loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- =========================================================================
-- RLS — enable on all 14 business tables
-- =========================================================================
alter table public.clients              enable row level security;
alter table public.leads                enable row level security;
alter table public.deals                enable row level security;
alter table public.invoices             enable row level security;
alter table public.commissions          enable row level security;
alter table public.tasks                enable row level security;
alter table public.monthly_reports      enable row level security;
alter table public.playbooks            enable row level security;
alter table public.contracts            enable row level security;
alter table public.fulfilment_templates enable row level security;
alter table public.deliverables         enable row level security;
alter table public.client_onboarding    enable row level security;
alter table public.client_activity_log  enable row level security;
alter table public.client_notifications enable row level security;

-- CLIENTS
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select using (
  client_user_id = auth.uid()
  or assigned_field_agent = auth.uid()
  or assigned_cpc = auth.uid()
  or public.has_role(auth.uid(),'owner')
  or public.has_role(auth.uid(),'admin')
);
drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all using (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);

-- LEADS — staff + admin/owner
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select using (
  submitted_by = auth.uid()
  or public.has_role(auth.uid(),'owner')
  or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'cpc')
  or public.has_role(auth.uid(),'field_agent')
);
drop policy if exists leads_write on public.leads;
create policy leads_write on public.leads for all using (
  public.has_role(auth.uid(),'owner')
  or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'cpc')
  or public.has_role(auth.uid(),'field_agent')
) with check (
  public.has_role(auth.uid(),'owner')
  or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'cpc')
  or public.has_role(auth.uid(),'field_agent')
);

-- DEALS
drop policy if exists deals_read on public.deals;
create policy deals_read on public.deals for select using (
  closer_id = auth.uid() or cpc_id = auth.uid()
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists deals_write on public.deals;
create policy deals_write on public.deals for all using (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);

-- INVOICES
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices for select using (
  exists (select 1 from public.clients c where c.id = invoices.client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices for all using (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);

-- COMMISSIONS
drop policy if exists commissions_read on public.commissions;
create policy commissions_read on public.commissions for select using (
  staff_id = auth.uid()
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists commissions_write on public.commissions;
create policy commissions_write on public.commissions for all using (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);

-- TASKS
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select using (
  assigned_to = auth.uid() or created_by = auth.uid()
  or exists (select 1 from public.clients c where c.id = tasks.client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks for all using (
  assigned_to = auth.uid() or created_by = auth.uid()
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (true);

-- MONTHLY REPORTS
drop policy if exists monthly_reports_read on public.monthly_reports;
create policy monthly_reports_read on public.monthly_reports for select using (
  exists (select 1 from public.clients c where c.id = monthly_reports.client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'head_of_tech')
);
drop policy if exists monthly_reports_write on public.monthly_reports;
create policy monthly_reports_write on public.monthly_reports for all using (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'head_of_tech')
) with check (true);

-- PLAYBOOKS — read for all authed, write owner-only
drop policy if exists playbooks_read on public.playbooks;
create policy playbooks_read on public.playbooks for select using (auth.uid() is not null);
drop policy if exists playbooks_write on public.playbooks;
create policy playbooks_write on public.playbooks for all using (public.has_role(auth.uid(),'owner'))
  with check (public.has_role(auth.uid(),'owner'));

-- CONTRACTS
drop policy if exists contracts_read on public.contracts;
create policy contracts_read on public.contracts for select using (
  exists (select 1 from public.clients c where c.id = contracts.client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists contracts_write on public.contracts;
create policy contracts_write on public.contracts for all using (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);

-- FULFILMENT TEMPLATES — read all authed, write owner
drop policy if exists fulfilment_read on public.fulfilment_templates;
create policy fulfilment_read on public.fulfilment_templates for select using (auth.uid() is not null);
drop policy if exists fulfilment_write on public.fulfilment_templates;
create policy fulfilment_write on public.fulfilment_templates for all using (public.has_role(auth.uid(),'owner'))
  with check (public.has_role(auth.uid(),'owner'));

-- DELIVERABLES
drop policy if exists deliverables_read on public.deliverables;
create policy deliverables_read on public.deliverables for select using (
  assigned_to = auth.uid()
  or exists (select 1 from public.clients c where c.id = deliverables.client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'head_of_tech')
);
drop policy if exists deliverables_write on public.deliverables;
create policy deliverables_write on public.deliverables for all using (
  assigned_to = auth.uid()
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'head_of_tech')
) with check (true);

-- CLIENT ONBOARDING
drop policy if exists onboarding_read on public.client_onboarding;
create policy onboarding_read on public.client_onboarding for select using (
  assigned_admin_id = auth.uid()
  or exists (select 1 from public.clients c where c.id = client_onboarding.client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists onboarding_write on public.client_onboarding;
create policy onboarding_write on public.client_onboarding for all using (
  assigned_admin_id = auth.uid() or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
) with check (true);

-- ACTIVITY LOG — read scoped, writes via SECURITY DEFINER RPCs only
drop policy if exists activity_read on public.client_activity_log;
create policy activity_read on public.client_activity_log for select using (
  actor_id = auth.uid()
  or exists (select 1 from public.clients c where c.id = client_activity_log.client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists activity_write on public.client_activity_log;
create policy activity_write on public.client_activity_log for insert with check (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'head_of_tech')
);

-- NOTIFICATIONS
drop policy if exists notif_read on public.client_notifications;
create policy notif_read on public.client_notifications for select using (
  recipient_user_id = auth.uid()
  or exists (select 1 from public.clients c where c.id = client_notifications.client_id and c.client_user_id = auth.uid())
  or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists notif_update on public.client_notifications;
create policy notif_update on public.client_notifications for update using (
  recipient_user_id = auth.uid() or public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
);
drop policy if exists notif_owner_write on public.client_notifications;
create policy notif_owner_write on public.client_notifications for insert with check (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'head_of_tech')
);
