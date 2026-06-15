-- 02_system_settings.sql
-- Single key/value table. Carry-over rule (HANDOVER §5.1): no constants
-- in code. Commission rates, package catalog, brand, signatories, payroll
-- schedule all live here so owner can edit via SQL UPDATE (or future UI)
-- without a deploy.

create table if not exists public.system_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.system_settings enable row level security;

drop policy if exists system_settings_read on public.system_settings;
create policy system_settings_read on public.system_settings
  for select using (auth.uid() is not null);

drop policy if exists system_settings_owner_write on public.system_settings;
create policy system_settings_owner_write on public.system_settings
  for all using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

drop trigger if exists system_settings_touch on public.system_settings;
create trigger system_settings_touch before update on public.system_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists system_settings_audit on public.system_settings;
create trigger system_settings_audit after insert or update or delete on public.system_settings
  for each row execute function public.audit_trigger();

-- =========================================================================
-- SEED — 9 keys covering all carry-over constants from Base44.
-- =========================================================================
insert into public.system_settings(key, value, description) values
('commission_rates', jsonb_build_object(
   'ignite',         jsonb_build_object('setup_pct', 7,   'retainer_pct', 7,   'flat_amount', null),
   'accelerate',     jsonb_build_object('setup_pct', 7,   'retainer_pct', 7,   'flat_amount', null),
   'dominate',       jsonb_build_object('setup_pct', 7,   'retainer_pct', 7.5, 'flat_amount', null),
   'street_pulse',   jsonb_build_object('setup_pct', null,'retainer_pct', null,'flat_amount', 444),
   'township_pulse', jsonb_build_object('setup_pct', null,'retainer_pct', null,'flat_amount', 130),
   'cpc_lead_fee',          87,
   'cpc_closure_bonus',     250,
   'admin_contract_load',   25,
   'cpc_separate_closer_bonus', 250
 ), 'Commission rates by package + CPC + admin loads. ZAR.'),

('package_catalog', jsonb_build_array(
   jsonb_build_object('code','ignite',         'name','Ignite',         'setup_zar',3980,'monthly_zar',490, 'term_months',12),
   jsonb_build_object('code','accelerate',     'name','Accelerate',     'setup_zar',6500,'monthly_zar',890, 'term_months',12),
   jsonb_build_object('code','dominate',       'name','Dominate',       'setup_zar',9800,'monthly_zar',1490,'term_months',12),
   jsonb_build_object('code','street_pulse',   'name','Street Pulse',   'setup_zar',700, 'monthly_zar',4000,'term_months',3),
   jsonb_build_object('code','township_pulse', 'name','Township Pulse', 'setup_zar',2200,'monthly_zar',0,   'term_months',1)
 ), 'Core package catalog. Pricing in ZAR.'),

('brand_assets', jsonb_build_object(
   'company_name',     'Marketing iO',
   'domain',           'marketingio.co.za',
   'logo_url',         null,
   'mascot_url',       null,
   'email_aesthetic',  'synthwave',
   'primary_color',    '#00ffff',
   'accent_color',     '#ff00aa',
   'support_email',    'support@marketingio.co.za'
 ), 'Brand and visual identity references.'),

('legal_signatories', jsonb_build_object(
   'director_name',   'Thapelo Maupa',
   'director_title',  'Director',
   'witness_name',    'Riana du Plessis',
   'witness_title',   'Co-Founder / CFO',
   'company_legal',   'Marketing iO (Pty) Ltd',
   'msa_version',     'V3.0'
 ), 'Signatories for contract MSA generation.'),

('payroll_schedule', jsonb_build_object(
   'pay_day_of_month',         25,
   'cutoff_day_of_month',      20,
   'milestone_batch_size',     5,
   'clawback_window_days',     30,
   'commission_default_status','pending'
 ), 'Payroll cadence and milestone-gating rules.'),

('roles_allowed_to_close', jsonb_build_array('owner','admin','cpc','field_agent'),
   'Roles permitted to close a sale (call close_sale RPC).'),

('owner_to_founder_mapping', jsonb_build_object(
   'app_role_in',  'owner',
   'commission_staff_role_out', 'founder'
 ), 'Carry-over rule §5.4: commission.staff_role enum has no "owner"; map to "founder".'),

('payfast_config', jsonb_build_object(
   'merchant_id',  null,
   'merchant_key', null,
   'passphrase',   null,
   'sandbox',      true,
   'return_url',   '/payment/success',
   'cancel_url',   '/payment/cancelled',
   'notify_url',   '/api/payfast/itn'
 ), 'PayFast configuration. Real secrets live in Supabase Edge Function env vars.'),

('feature_flags', jsonb_build_object(
   'ai_mascot_chat',     false,
   'lead_scorer',        false,
   'proposal_drafter',   false,
   'mobile_field_app',   false,
   'whatsapp_360dialog', false,
   'sms_africastalking', false,
   'stripe_intl',        false,
   'ozow_eft',           false,
   'stitch_open_banking',false
 ), 'Feature flags for future slices (AI, mobile, integrations, payments).')
on conflict (key) do nothing;
