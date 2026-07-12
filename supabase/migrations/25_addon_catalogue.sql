-- Migration 25 — Add-On Catalogue Manager
--
-- 1. Seed system_settings.addon_catalogue with the 20 known add-on codes
--    (sourced from commission_rates.addons.map). Prices are placeholders
--    for the owner to fill in via the UI.
-- 2. system_settings_backups table for daily snapshots (kept 90 days).
-- 3. read_addon_catalogue(include_inactive bool) — read RPC.
-- 4. catalogue_upsert_addon(payload jsonb) — add or edit an add-on.
-- 5. catalogue_deactivate_addon(p_code text)
-- 6. catalogue_reactivate_addon(p_code text)
-- 7. catalogue_delete_addon(p_code text) — hard delete if no deal refs.
-- 8. catalogue_backup_now() — snapshot current catalogue; cron-ready.

-- =========================================================================
-- 1. Seed addon_catalogue (insert once, skip if already present)
-- =========================================================================
insert into public.system_settings (key, value)
values ('addon_catalogue', jsonb_build_array(
  jsonb_build_object('code','ai_chatbot',              'name','AI Chatbot',                'emoji','🤖','bucket','B','setup_zar',6500,  'monthly_zar',350,  'headline','24/7 AI customer service','description','Deploy a trained chatbot on your website.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','crm_training',            'name','CRM Training',              'emoji','🎓','bucket','A','setup_zar',3500,  'monthly_zar',0,    'headline','Staff CRM onboarding','description','One-day hands-on CRM training session for your team.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','business_plan',           'name','Business Plan',             'emoji','📋','bucket','A','setup_zar',4500,  'monthly_zar',0,    'headline','Professional business plan','description','Investor-ready business plan document.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','print_signage',           'name','Print & Signage',           'emoji','🖨️','bucket','E','setup_zar',2500,  'monthly_zar',0,    'headline','Branded print materials','description','Banners, flyers, business cards, signage.','active',true,'term_months',null,'price_label','','commission_note','Referral only — no direct commission.','fee_model',''),
  jsonb_build_object('code','sms_marketing',           'name','SMS Marketing',             'emoji','📱','bucket','B','setup_zar',1500,  'monthly_zar',800,  'headline','Bulk SMS campaigns','description','Monthly branded SMS campaigns to your contact list.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','staff_training',          'name','Staff Training',            'emoji','👥','bucket','A','setup_zar',3500,  'monthly_zar',0,    'headline','Marketing skills workshop','description','In-person marketing skills training for client staff.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','ecommerce_setup',         'name','eCommerce Setup',           'emoji','🛒','bucket','A','setup_zar',8500,  'monthly_zar',0,    'headline','Online store build','description','Full WooCommerce or Shopify store setup.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','marketing_audit',         'name','Marketing Audit',           'emoji','🔍','bucket','A','setup_zar',2500,  'monthly_zar',0,    'headline','Full marketing audit','description','Comprehensive audit of current digital presence.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','email_newsletter',        'name','Email Newsletter',          'emoji','✉️','bucket','C','setup_zar',1200,  'monthly_zar',950,  'headline','Monthly email newsletter','description','Branded email newsletter sent to subscriber list monthly.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','short_form_video',        'name','Short-Form Video',          'emoji','🎬','bucket','C','setup_zar',0,     'monthly_zar',2800, 'headline','Social video content','description','Monthly short-form videos for Instagram / TikTok / YouTube Shorts.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','hosting_reselling',       'name','Hosting Reselling',         'emoji','🌐','bucket','E','setup_zar',0,     'monthly_zar',350,  'headline','Managed web hosting','description','Domain + hosting managed on behalf of client.','active',true,'term_months',null,'price_label','','commission_note','Partner margin only — no staff commission.','fee_model',''),
  jsonb_build_object('code','ai_content_writing',      'name','AI Content Writing',        'emoji','✍️','bucket','C','setup_zar',0,     'monthly_zar',1500, 'headline','Monthly AI-assisted content','description','Blog posts, captions, and copy produced monthly.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','competitor_analysis',     'name','Competitor Analysis',       'emoji','📊','bucket','A','setup_zar',2000,  'monthly_zar',0,    'headline','Competitive landscape report','description','Full competitor benchmarking report.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','paid_ads_management',     'name','Paid Ads Management',       'emoji','💰','bucket','D','setup_zar',1500,  'monthly_zar',1200, 'headline','Google / Meta ads management','description','Monthly management of paid advertising campaigns.','active',true,'term_months',null,'price_label','','commission_note','','fee_model','management_fee_on_spend'),
  jsonb_build_object('code','website_design_only',     'name','Website Design Only',       'emoji','🖥️','bucket','A','setup_zar',5500,  'monthly_zar',0,    'headline','Standalone website build','description','Custom website design and development, no retainer.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','website_maintenance',     'name','Website Maintenance',       'emoji','🔧','bucket','C','setup_zar',0,     'monthly_zar',750,  'headline','Monthly site upkeep','description','Updates, backups, security patches, and performance checks.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','whatsapp_automation',     'name','WhatsApp Automation',       'emoji','💬','bucket','B','setup_zar',4500,  'monthly_zar',650,  'headline','Automated WhatsApp flows','description','Business-API WhatsApp automation for sales and support.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','reputation_management',   'name','Reputation Management',     'emoji','⭐','bucket','C','setup_zar',0,     'monthly_zar',1800, 'headline','Online review management','description','Monitor, respond to, and grow Google / Hellopeter reviews.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','google_business_profile', 'name','Google Business Profile',   'emoji','📍','bucket','A','setup_zar',1800,  'monthly_zar',0,    'headline','GBP setup & optimisation','description','Full Google Business Profile setup or audit and optimisation.','active',true,'term_months',null,'price_label','','commission_note','','fee_model',''),
  jsonb_build_object('code','business_plan_website_bundle','name','Business Plan + Website Bundle','emoji','📦','bucket','A','setup_zar',8500,'monthly_zar',0,'headline','Plan + site combo','description','Business plan document plus a starter website, bundled.','active',true,'term_months',null,'price_label','','commission_note','','fee_model','')
))
on conflict (key) do nothing;

-- =========================================================================
-- 2. system_settings_backups
-- =========================================================================
create table if not exists public.system_settings_backups (
  id         bigint generated always as identity primary key,
  key        text not null,
  value      jsonb not null,
  backed_up_at timestamptz not null default now()
);

alter table public.system_settings_backups enable row level security;

drop policy if exists backups_owner_read on public.system_settings_backups;
create policy backups_owner_read on public.system_settings_backups
  for select
  using (
    public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'admin')
  );

-- =========================================================================
-- 3. read_addon_catalogue(include_inactive)
-- =========================================================================
drop function if exists public.read_addon_catalogue(boolean);

create or replace function public.read_addon_catalogue(include_inactive boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogue jsonb;
begin
  select value into v_catalogue
  from public.system_settings
  where key = 'addon_catalogue';

  if v_catalogue is null then
    return '[]'::jsonb;
  end if;

  if not include_inactive then
    select jsonb_agg(el order by el->>'code')
    into v_catalogue
    from jsonb_array_elements(v_catalogue) el
    where (el->>'active')::boolean is not false;
  end if;

  return coalesce(v_catalogue, '[]'::jsonb);
end;
$$;

grant execute on function public.read_addon_catalogue(boolean) to authenticated;
grant execute on function public.read_addon_catalogue(boolean) to anon;

-- =========================================================================
-- 4. catalogue_upsert_addon(payload jsonb)
--    Insert or update an add-on by code. Code is permanent (never changed).
-- =========================================================================
drop function if exists public.catalogue_upsert_addon(jsonb);

create or replace function public.catalogue_upsert_addon(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code       text;
  v_catalogue  jsonb;
  v_existing   jsonb;
  v_new        jsonb;
  v_idx        int;
  v_actor      uuid;
begin
  -- Auth
  v_actor := auth.uid();
  if not (public.has_role(v_actor, 'owner') or public.has_role(v_actor, 'admin')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- Required fields
  v_code := lower(trim(payload->>'code'));
  if v_code is null or v_code = '' then
    raise exception 'code_required';
  end if;
  if v_code !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'code_invalid_format: must be lowercase_snake_case';
  end if;
  if (payload->>'bucket') not in ('A','B','C','D','E') then
    raise exception 'bucket_invalid: must be A B C D or E';
  end if;
  if (payload->>'setup_zar')::numeric < 0 or (payload->>'monthly_zar')::numeric < 0 then
    raise exception 'prices_must_be_non_negative';
  end if;
  if trim(payload->>'name') = '' or payload->>'name' is null then
    raise exception 'name_required';
  end if;

  -- Load catalogue
  select value into v_catalogue
  from public.system_settings
  where key = 'addon_catalogue';
  v_catalogue := coalesce(v_catalogue, '[]'::jsonb);

  -- Find existing element
  select el into v_existing
  from jsonb_array_elements(v_catalogue) el
  where el->>'code' = v_code
  limit 1;

  v_new := jsonb_build_object(
    'code',             v_code,
    'name',             trim(payload->>'name'),
    'emoji',            coalesce(payload->>'emoji', '📦'),
    'bucket',           payload->>'bucket',
    'setup_zar',        (payload->>'setup_zar')::int,
    'monthly_zar',      (payload->>'monthly_zar')::int,
    'headline',         coalesce(trim(payload->>'headline'), ''),
    'description',      coalesce(trim(payload->>'description'), ''),
    'active',           coalesce((payload->>'active')::boolean, true),
    'term_months',      case when payload->>'term_months' is not null
                             then (payload->>'term_months')::int
                             else null end,
    'price_label',      coalesce(trim(payload->>'price_label'), ''),
    'commission_note',  coalesce(trim(payload->>'commission_note'), ''),
    'fee_model',        coalesce(trim(payload->>'fee_model'), '')
  );

  if v_existing is null then
    -- Append
    v_catalogue := v_catalogue || v_new;
    insert into public.audit_log (actor_id, action, table_name, record_id, metadata)
    values (v_actor, 'addon_added', 'system_settings', null,
            jsonb_build_object('code', v_code, 'new_value', v_new));
  else
    -- Replace in-place
    select jsonb_agg(case when el->>'code' = v_code then v_new else el end)
    into v_catalogue
    from jsonb_array_elements(v_catalogue) el;
    insert into public.audit_log (actor_id, action, table_name, record_id, metadata)
    values (v_actor, 'addon_edited', 'system_settings', null,
            jsonb_build_object('code', v_code, 'old_value', v_existing, 'new_value', v_new));
  end if;

  update public.system_settings
  set value = v_catalogue, updated_at = now()
  where key = 'addon_catalogue';

  return jsonb_build_object('success', true, 'addon', v_new);
end;
$$;

grant execute on function public.catalogue_upsert_addon(jsonb) to authenticated;

-- =========================================================================
-- 5. catalogue_deactivate_addon(p_code text)
-- =========================================================================
drop function if exists public.catalogue_deactivate_addon(text);

create or replace function public.catalogue_deactivate_addon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid;
  v_catalogue jsonb;
  v_addon     jsonb;
  v_updated   jsonb;
begin
  v_actor := auth.uid();
  if not (public.has_role(v_actor, 'owner') or public.has_role(v_actor, 'admin')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select value into v_catalogue from public.system_settings where key = 'addon_catalogue';
  v_catalogue := coalesce(v_catalogue, '[]'::jsonb);

  select el into v_addon from jsonb_array_elements(v_catalogue) el
  where el->>'code' = lower(trim(p_code)) limit 1;

  if v_addon is null then
    raise exception 'addon_not_found';
  end if;

  v_updated := v_addon || jsonb_build_object('active', false);

  select jsonb_agg(case when el->>'code' = lower(trim(p_code)) then v_updated else el end)
  into v_catalogue
  from jsonb_array_elements(v_catalogue) el;

  update public.system_settings set value = v_catalogue, updated_at = now()
  where key = 'addon_catalogue';

  insert into public.audit_log (actor_id, action, table_name, record_id, metadata)
  values (v_actor, 'addon_deactivated', 'system_settings', null,
          jsonb_build_object('code', p_code, 'old_value', v_addon, 'new_value', v_updated));

  return jsonb_build_object('success', true, 'addon', v_updated);
end;
$$;

grant execute on function public.catalogue_deactivate_addon(text) to authenticated;

-- =========================================================================
-- 6. catalogue_reactivate_addon(p_code text)
-- =========================================================================
drop function if exists public.catalogue_reactivate_addon(text);

create or replace function public.catalogue_reactivate_addon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid;
  v_catalogue jsonb;
  v_addon     jsonb;
  v_updated   jsonb;
begin
  v_actor := auth.uid();
  if not (public.has_role(v_actor, 'owner') or public.has_role(v_actor, 'admin')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select value into v_catalogue from public.system_settings where key = 'addon_catalogue';
  v_catalogue := coalesce(v_catalogue, '[]'::jsonb);

  select el into v_addon from jsonb_array_elements(v_catalogue) el
  where el->>'code' = lower(trim(p_code)) limit 1;

  if v_addon is null then
    raise exception 'addon_not_found';
  end if;

  v_updated := v_addon || jsonb_build_object('active', true);

  select jsonb_agg(case when el->>'code' = lower(trim(p_code)) then v_updated else el end)
  into v_catalogue
  from jsonb_array_elements(v_catalogue) el;

  update public.system_settings set value = v_catalogue, updated_at = now()
  where key = 'addon_catalogue';

  insert into public.audit_log (actor_id, action, table_name, record_id, metadata)
  values (v_actor, 'addon_reactivated', 'system_settings', null,
          jsonb_build_object('code', p_code, 'old_value', v_addon, 'new_value', v_updated));

  return jsonb_build_object('success', true, 'addon', v_updated);
end;
$$;

grant execute on function public.catalogue_reactivate_addon(text) to authenticated;

-- =========================================================================
-- 7. catalogue_delete_addon(p_code text)
--    Hard delete — refused if any deals.products[].code = p_code.
-- =========================================================================
drop function if exists public.catalogue_delete_addon(text);

create or replace function public.catalogue_delete_addon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid;
  v_catalogue jsonb;
  v_addon     jsonb;
  v_deal_ref  int;
begin
  v_actor := auth.uid();
  if not (public.has_role(v_actor, 'owner') or public.has_role(v_actor, 'admin')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select value into v_catalogue from public.system_settings where key = 'addon_catalogue';
  v_catalogue := coalesce(v_catalogue, '[]'::jsonb);

  select el into v_addon from jsonb_array_elements(v_catalogue) el
  where el->>'code' = lower(trim(p_code)) limit 1;

  if v_addon is null then
    raise exception 'addon_not_found';
  end if;

  -- Refuse if referenced by any deal
  select count(*) into v_deal_ref
  from public.deals
  where add_on_code = lower(trim(p_code));

  if v_deal_ref > 0 then
    raise exception 'addon_has_deal_references: deactivate instead (% deal(s) reference this code)', v_deal_ref;
  end if;

  select jsonb_agg(el)
  into v_catalogue
  from jsonb_array_elements(v_catalogue) el
  where el->>'code' != lower(trim(p_code));

  v_catalogue := coalesce(v_catalogue, '[]'::jsonb);

  update public.system_settings set value = v_catalogue, updated_at = now()
  where key = 'addon_catalogue';

  insert into public.audit_log (actor_id, action, table_name, record_id, metadata)
  values (v_actor, 'addon_deleted', 'system_settings', null,
          jsonb_build_object('code', p_code, 'deleted_value', v_addon));

  return jsonb_build_object('success', true, 'deleted_code', p_code);
end;
$$;

grant execute on function public.catalogue_delete_addon(text) to authenticated;

-- =========================================================================
-- 8. catalogue_backup_now() — call from pg_cron or manually
-- =========================================================================
drop function if exists public.catalogue_backup_now();

create or replace function public.catalogue_backup_now()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.system_settings_backups (key, value, backed_up_at)
  select key, value, now()
  from public.system_settings
  where key = 'addon_catalogue';

  -- Prune backups older than 90 days
  delete from public.system_settings_backups
  where backed_up_at < now() - interval '90 days';
end;
$$;

grant execute on function public.catalogue_backup_now() to authenticated;
