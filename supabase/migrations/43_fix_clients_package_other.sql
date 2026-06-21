-- 43_fix_clients_package_other.sql
-- clients.package CHECK constraint only allows standard package codes
-- (ignite, accelerate, dominate, street_pulse, township_pulse, none).
-- 'other' is a free-form custom package whose name is stored on deals.add_on_name.
-- Map v_pkg='other' → 'none' in the clients INSERT so the constraint is not violated.
-- The deal itself still records package='other' (deals.package has no such constraint).

-- Full close_sale replacement with the one-line fix marked below.
-- (All other logic is unchanged from migration 41.)

CREATE OR REPLACE FUNCTION public.close_sale(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_idem               uuid;
  v_existing_response  jsonb;
  v_caller             uuid := auth.uid();
  v_caller_role        public.app_role;
  v_caller_name        text;
  v_allowed_roles      jsonb;
  v_commission_role    text;
  v_is_owner_close     boolean;
  v_rates              jsonb;
  v_payroll            jsonb;
  v_pulse_cfg          jsonb;
  v_term_cfg           jsonb;
  v_other_cfg          jsonb;
  v_addon_buckets      jsonb;
  v_addon_map          jsonb;
  v_addon_bucket       text;
  v_addon_bucket_cfg   jsonb;
  v_deal_type          text;
  v_pkg                text;
  v_add_on_name        text;
  v_add_on_code        text;
  v_setup_fee          numeric(10,2);
  v_monthly_retainer   numeric(10,2);
  v_cpc_id             uuid;
  v_cpc_name           text;
  v_term_key           text;
  v_term_months        integer;
  v_rate_group_key     text;
  v_setup_pct          numeric(6,2);
  v_monthly_pct        numeric(6,2);
  v_pulse_flat         numeric(10,2);
  v_client_id          uuid;
  v_client_name        text;
  v_new_client         boolean := false;
  v_deal_id            uuid;
  v_contract_id        uuid;
  v_invoice_id         uuid;
  v_invoice_number     text;
  v_onboarding_id      uuid;
  v_admin_id           uuid;
  v_admin_name         text;
  v_template           public.fulfilment_templates;
  v_setup_titles       jsonb;
  v_recurring_titles   jsonb;
  v_title              text;
  v_commission_rows    integer := 0;
  v_deliverables       integer := 0;
  v_custom_deliv_count integer := 0;
  v_tasks_created      integer := 0;
  v_signing_token      text;
  v_payroll_month      text := to_char(now(), 'YYYY-MM');
  v_qualifying_date    date := current_date;
  v_result             jsonb;
  v_brief              text;
  v_brand_notes        text;
  v_discovery          jsonb;
  v_expected_start     date;
  v_custom_delivs      jsonb;
  v_custom_rec         jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  v_idem := nullif(payload->>'idempotency_key','')::uuid;
  if v_idem is not null then
    select close_sale_response into v_existing_response from public.deals where idempotency_key = v_idem limit 1;
    if v_existing_response is not null then
      return v_existing_response || jsonb_build_object('idempotent_replay', true);
    end if;
  end if;
  v_caller_role := public.current_user_role();
  if v_caller_role is null then raise exception 'Caller has no app role' using errcode='42501'; end if;
  select value into v_allowed_roles from public.system_settings where key='roles_allowed_to_close';
  if v_allowed_roles is null or not v_allowed_roles ? (v_caller_role::text) then
    raise exception 'Role % is not permitted to close sales', v_caller_role using errcode='42501';
  end if;
  select full_name into v_caller_name from public.profiles where id=v_caller;
  v_is_owner_close := (v_caller_role = 'owner');
  v_rate_group_key := case when v_is_owner_close then 'owner' else 'closer' end;
  if v_is_owner_close then v_commission_role := 'founder';
  elsif v_caller_role::text in ('field_agent','cpc','admin') then v_commission_role := v_caller_role::text;
  else v_commission_role := 'other'; end if;

  v_deal_type        := coalesce(payload->>'deal_type','core_package');
  v_pkg              := payload->>'package';
  v_add_on_name      := payload->>'add_on_name';
  v_add_on_code      := payload->>'add_on_code';
  v_setup_fee        := nullif(payload->>'setup_fee','')::numeric;
  v_monthly_retainer := nullif(payload->>'monthly_retainer','')::numeric;
  v_cpc_id           := nullif(payload->>'cpc_id','')::uuid;
  v_brief            := nullif(payload->>'brief','');
  v_brand_notes      := nullif(payload->>'brand_notes','');
  v_discovery        := payload->'discovery';
  v_expected_start   := nullif(payload->>'expected_start_date','')::date;
  v_custom_delivs    := payload->'custom_deliverables';

  if v_deal_type not in ('core_package','add_on') then raise exception 'Invalid deal_type %', v_deal_type using errcode='22023'; end if;
  if v_deal_type='core_package' and (v_pkg is null or v_pkg not in ('ignite','accelerate','dominate','street_pulse','township_pulse','other')) then
    raise exception 'Invalid package % for core_package deal', v_pkg using errcode='22023'; end if;
  if v_deal_type='add_on' and (v_add_on_name is null or trim(v_add_on_name)='') then
    raise exception 'add_on_name required for add_on deal' using errcode='22023'; end if;
  if coalesce(v_setup_fee,0)<0 or coalesce(v_monthly_retainer,0)<0 then
    raise exception 'Fees cannot be negative' using errcode='22023'; end if;
  if (payload->>'client_business_name') is null and (payload->>'client_id') is null then
    raise exception 'Either client_id or client_business_name required' using errcode='22023'; end if;

  if v_cpc_id is not null then
    select full_name into v_cpc_name from public.profiles where id=v_cpc_id;
    if v_cpc_name is null then raise exception 'cpc_id % not found', v_cpc_id using errcode='23503'; end if;
  end if;

  if (payload->>'client_id') is not null then
    v_client_id := (payload->>'client_id')::uuid;
    select business_name into v_client_name from public.clients where id=v_client_id;
    if v_client_name is null then raise exception 'client_id % not found', v_client_id using errcode='23503'; end if;
  else
    v_client_name := payload->>'client_business_name';
    insert into public.clients(business_name, contact_person, email, phone, address, industry,
      whatsapp_number, website, socials, gmaps_url, logo_url,
      status, source, package, monthly_retainer, setup_fee_amount, created_by)
    values (v_client_name, payload->>'client_contact_person', payload->>'client_email',
      payload->>'client_phone', payload->>'client_address', payload->>'client_industry',
      payload->>'client_whatsapp', payload->>'client_website',
      payload->'client_socials', payload->>'client_gmaps_url', payload->>'client_logo_url',
      'onboarding', coalesce(payload->>'source','other'),
      -- FIX: 'other' is a free-form custom package; clients.package only holds standard tier codes
      case when v_deal_type='core_package' and v_pkg != 'other' then v_pkg else 'none' end,
      v_monthly_retainer, v_setup_fee, v_caller)
    returning id into v_client_id;
    v_new_client := true;
  end if;

  select value into v_rates    from public.system_settings where key='commission_rates';
  select value into v_payroll  from public.system_settings where key='payroll_schedule';

  if v_deal_type='core_package' and v_pkg in ('ignite','accelerate','dominate') then
    v_term_key := coalesce(payload->>'contract_term_months','12');
    if v_term_key not in ('12','6') then raise exception 'contract_term_months must be 12 or 6 (got %)', v_term_key using errcode='22023'; end if;
    v_term_months := v_term_key::int;
    v_term_cfg := v_rates->'packages'->v_pkg->v_term_key;
    v_setup_pct   := nullif((v_term_cfg->v_rate_group_key->>'setup_pct'),'')::numeric;
    v_monthly_pct := nullif((v_term_cfg->v_rate_group_key->>'monthly_pct'),'')::numeric;
  elsif v_pkg in ('street_pulse','township_pulse') then
    v_pulse_cfg := v_rates->'pulse'->v_pkg;
    v_term_months := coalesce((v_pulse_cfg->>'term')::int,1);
    v_pulse_flat  := (v_pulse_cfg->>(case when v_is_owner_close then 'owner_flat' else 'closer_flat' end))::numeric;
  elsif v_pkg = 'other' then
    v_term_months := greatest(coalesce(nullif(payload->>'contract_term_months','')::int, 12), 1);
    v_other_cfg   := v_rates->'packages'->'other';
    v_setup_pct   := nullif((v_other_cfg->v_rate_group_key->>'setup_pct'),'')::numeric;
    v_monthly_pct := nullif((v_other_cfg->v_rate_group_key->>'monthly_pct'),'')::numeric;
  end if;

  insert into public.deals(client_id, client_name, deal_type, package, add_on_name, stage,
    setup_fee, monthly_retainer, probability, closer_id, closer_name, closer_role,
    source, cpc_id, cpc_name, closed_at, idempotency_key,
    brief, brand_notes, discovery, expected_start_date, notes)
  values (v_client_id, v_client_name, v_deal_type,
    case when v_deal_type='core_package' then v_pkg else 'none' end, v_add_on_name, 'closed_won',
    v_setup_fee, v_monthly_retainer, 100,
    v_caller, v_caller_name, v_caller_role, coalesce(payload->>'source','other'),
    v_cpc_id, v_cpc_name, now(), v_idem,
    v_brief, v_brand_notes, v_discovery, v_expected_start, payload->>'notes')
  returning id into v_deal_id;

  if v_deal_type='core_package' then
    if v_pkg in ('ignite','accelerate','dominate','other') then
      if v_setup_pct is not null and v_setup_pct>0 and v_setup_fee is not null and v_setup_fee>0 then
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'setup_commission', v_deal_id, v_client_id, v_client_name, v_pkg, v_setup_fee, v_setup_pct, round(v_setup_fee*v_setup_pct/100,2), 'sale_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows+1;
      end if;
      if v_monthly_pct is not null and v_monthly_pct>0 and v_monthly_retainer is not null and v_monthly_retainer>0 then
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'retainer_commission', v_deal_id, v_client_id, v_client_name, v_pkg, v_monthly_retainer*v_term_months, v_monthly_pct, round(v_monthly_retainer*v_term_months*v_monthly_pct/100,2), 'sale_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows+1;
      end if;
    elsif v_pkg in ('street_pulse','township_pulse') then
      insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
      values (v_caller, v_caller_name, v_commission_role, 'setup_commission', v_deal_id, v_client_id, v_client_name, v_pkg, v_pulse_flat, 'sale_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
      v_commission_rows := v_commission_rows+1;
    end if;
  else
    v_addon_buckets := v_rates->'addons'->'buckets';
    v_addon_map     := v_rates->'addons'->'map';
    if v_add_on_code is not null and v_addon_map ? v_add_on_code then v_addon_bucket := v_addon_map->>v_add_on_code;
    else v_addon_bucket := coalesce(payload->>'addon_bucket','A'); end if;
    v_addon_bucket_cfg := v_addon_buckets->v_addon_bucket;
    v_term_months := coalesce((payload->>'add_on_term_months')::int,12);
    if v_addon_bucket='A' then
      v_setup_pct := nullif(v_addon_bucket_cfg->>'once_off_pct','')::numeric;
      if v_setup_pct>0 and coalesce(v_setup_fee,0)>0 then
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'add_on_once_off', v_deal_id, v_client_id, v_client_name, v_add_on_name, v_setup_fee, v_setup_pct, round(v_setup_fee*v_setup_pct/100,2), 'add_on_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows+1;
      end if;
    elsif v_addon_bucket='B' then
      v_setup_pct   := nullif(v_addon_bucket_cfg->>'setup_pct','')::numeric;
      v_monthly_pct := nullif(v_addon_bucket_cfg->>'retainer_pct','')::numeric;
      if v_setup_pct>0 and coalesce(v_setup_fee,0)>0 then
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'add_on_once_off', v_deal_id, v_client_id, v_client_name, v_add_on_name, v_setup_fee, v_setup_pct, round(v_setup_fee*v_setup_pct/100,2), 'add_on_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows+1;
      end if;
      if v_monthly_pct>0 and coalesce(v_monthly_retainer,0)>0 then
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'add_on_retainer', v_deal_id, v_client_id, v_client_name, v_add_on_name, v_monthly_retainer*v_term_months, v_monthly_pct, round(v_monthly_retainer*v_term_months*v_monthly_pct/100,2), 'add_on_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows+1;
      end if;
    elsif v_addon_bucket='C' then
      v_monthly_pct := nullif(v_addon_bucket_cfg->>'annual_pct','')::numeric;
      if v_monthly_pct>0 and coalesce(v_monthly_retainer,0)>0 then
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'add_on_retainer', v_deal_id, v_client_id, v_client_name, v_add_on_name, v_monthly_retainer*12, v_monthly_pct, round(v_monthly_retainer*12*v_monthly_pct/100,2), 'add_on_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows+1;
      end if;
    elsif v_addon_bucket='D' then
      v_monthly_pct := nullif(v_addon_bucket_cfg->>'monthly_pct','')::numeric;
      if v_monthly_pct>0 and coalesce(v_monthly_retainer,0)>0 then
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'paid_ads_trickle', v_deal_id, v_client_id, v_client_name, v_add_on_name, v_monthly_retainer*v_term_months, v_monthly_pct, round(v_monthly_retainer*v_term_months*v_monthly_pct/100,2), 'add_on_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows+1;
      end if;
    end if;
  end if;

  if v_caller_role != 'admin' then
    insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, base_amount, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
    select ur.user_id, p.full_name, 'admin', 'admin_contract_load', v_deal_id, v_client_id, v_client_name, null,
      (v_rates->'admin'->>'per_contract_loaded')::numeric, 'sale_closed', v_qualifying_date,
      coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month
    from public.user_roles ur join public.profiles p on p.id=ur.user_id where ur.role='admin' limit 1;
    if found then v_commission_rows := v_commission_rows+1; end if;
  end if;

  if v_cpc_id is not null and v_cpc_id != v_caller then
    insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
    values (v_cpc_id, v_cpc_name, 'cpc', 'cpc_lead_fee', v_deal_id, v_client_id, v_client_name,
      (v_rates->'cpc_sourcing'->>'qualified_lead_fee')::numeric, 'sale_closed_by_other', v_qualifying_date,
      coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
    v_commission_rows := v_commission_rows+1;
    insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
    values (v_cpc_id, v_cpc_name, 'cpc', 'cpc_closure_bonus', v_deal_id, v_client_id, v_client_name,
      (v_rates->'cpc_sourcing'->>'closure_bonus')::numeric, 'sale_closed_by_other', v_qualifying_date,
      coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
    v_commission_rows := v_commission_rows+1;
  end if;

  update public.deals set commission_generated=true where id=v_deal_id;

  v_signing_token := encode(extensions.gen_random_bytes(24),'hex');
  if v_deal_type='core_package' then
    insert into public.contracts(client_id, client_name, deal_id, package, add_on_name, setup_fee, monthly_retainer, initial_term_months, contract_start_date, contract_end_date, status, signing_token, signing_token_expires_at, signing_status)
    values (v_client_id, v_client_name, v_deal_id, v_pkg, v_add_on_name, v_setup_fee, v_monthly_retainer,
      coalesce(v_term_months,12), current_date, current_date + (coalesce(v_term_months,12)||' months')::interval,
      'draft', v_signing_token, now()+interval '30 days', 'not_sent')
    returning id into v_contract_id;
  else
    insert into public.contracts(client_id, client_name, deal_id, package, add_on_name, setup_fee, monthly_retainer, initial_term_months, contract_start_date, contract_end_date, status, signing_token, signing_token_expires_at, signing_status)
    values (v_client_id, v_client_name, v_deal_id, 'add_on', v_add_on_name, v_setup_fee, v_monthly_retainer,
      coalesce(v_term_months,12), current_date, current_date+interval '1 month',
      'draft', v_signing_token, now()+interval '30 days', 'not_sent')
    returning id into v_contract_id;
  end if;

  if v_setup_fee is not null and v_setup_fee > 0 then
    v_invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoices_seq')::text, 6, '0');
    insert into public.invoices(
      invoice_number, client_id, client_name, invoice_type, description,
      amount, vat_applicable, vat_amount, total_amount,
      issue_date, due_date, status, deal_id
    ) values (
      v_invoice_number, v_client_id, v_client_name, 'setup_fee',
      'Setup fee — ' || coalesce(v_pkg, v_add_on_name),
      v_setup_fee, false, 0, v_setup_fee,
      current_date, current_date + 7, 'sent', v_deal_id
    ) returning id into v_invoice_id;
  end if;

  select ur.user_id, p.full_name into v_admin_id, v_admin_name
  from public.user_roles ur join public.profiles p on p.id=ur.user_id where ur.role='admin' limit 1;
  if v_admin_id is null then v_admin_id := v_caller; v_admin_name := v_caller_name; end if;

  insert into public.client_onboarding(deal_id, client_id, client_name, assigned_admin_id, assigned_admin_name, current_phase)
  values (v_deal_id, v_client_id, v_client_name, v_admin_id, v_admin_name, 'phase1_contract_signed')
  returning id into v_onboarding_id;

  insert into public.tasks(title, description, client_id, client_name, deal_id, onboarding_id, assigned_to, assigned_to_name, created_by, status, priority, due_date, auto_generated)
  values ('Kick off onboarding for '||v_client_name,
    'Send welcome pack, schedule onboarding call, ensure contract is signed.' ||
    case when v_brief is not null then E'\n\nClient brief:\n' || v_brief else '' end,
    v_client_id, v_client_name, v_deal_id, v_onboarding_id, v_admin_id, v_admin_name, v_caller, 'open', 'high', current_date+1, true);
  v_tasks_created := v_tasks_created+1;
  if v_setup_fee is not null and v_setup_fee>0 then
    insert into public.tasks(title, description, client_id, client_name, deal_id, onboarding_id, assigned_to, assigned_to_name, created_by, status, priority, due_date, auto_generated)
    values ('Follow up on setup fee for '||v_client_name, 'Confirm setup fee payment (R'||v_setup_fee||') and reflect on invoice.',
      v_client_id, v_client_name, v_deal_id, v_onboarding_id, v_admin_id, v_admin_name, v_caller, 'open', 'medium', current_date+3, true);
    v_tasks_created := v_tasks_created+1;
  end if;

  if v_deal_type='core_package' then
    select * into v_template from public.fulfilment_templates where code=v_pkg;
    if v_template.id is not null then
      v_setup_titles := v_template.setup_deliverables;
      v_recurring_titles := v_template.recurring_deliverables;
      for v_title in select jsonb_array_elements_text(coalesce(v_setup_titles, '[]'::jsonb)) loop
        insert into public.deliverables(client_id, client_name, deal_id, template_id, title, phase, product, owner_role, status, due_date, is_custom)
        values (v_client_id, v_client_name, v_deal_id, v_template.id, v_title, 'setup', v_pkg, v_template.internal_owner_role, 'not_started', current_date + coalesce(v_template.soft_sla_days, 5), false);
        v_deliverables := v_deliverables + 1;
      end loop;
      for v_title in select jsonb_array_elements_text(coalesce(v_recurring_titles, '[]'::jsonb)) loop
        insert into public.deliverables(client_id, client_name, deal_id, template_id, title, phase, product, owner_role, status, due_date, month_year, is_custom)
        values (v_client_id, v_client_name, v_deal_id, v_template.id, v_title, 'monthly_recurring', v_pkg, v_template.internal_owner_role, 'not_started',
          date_trunc('month', current_date)::date + interval '1 month',
          to_char(current_date + interval '1 month','YYYY-MM'), false);
        v_deliverables := v_deliverables + 1;
      end loop;
    else
      insert into public.client_activity_log(client_id, client_name, actor_id, actor_role, event_type, event_category, event_summary, event_metadata)
      values (v_client_id, v_client_name, v_caller, v_caller_role::text, 'deliverables_skipped', 'fulfilment',
        format('No FulfilmentTemplate found for package %s - deliverables skipped', v_pkg),
        jsonb_build_object('deal_id', v_deal_id, 'package', v_pkg));
    end if;
  end if;

  if v_custom_delivs is not null and jsonb_typeof(v_custom_delivs) = 'array' then
    for v_custom_rec in select jsonb_array_elements(v_custom_delivs) loop
      if coalesce(nullif(trim(v_custom_rec->>'title'),''), '') = '' then continue; end if;
      insert into public.deliverables(client_id, client_name, deal_id, title, phase, product, owner_role, status, due_date, notes, is_custom)
      values (v_client_id, v_client_name, v_deal_id, trim(v_custom_rec->>'title'), 'setup',
        case when v_deal_type='core_package' then v_pkg else 'add_on' end,
        'head_of_tech', 'not_started', current_date + 14, v_custom_rec->>'note', true);
      v_custom_deliv_count := v_custom_deliv_count + 1;
    end loop;
  end if;

  insert into public.client_activity_log(client_id, client_name, actor_id, actor_role, event_type, event_category, event_summary, event_metadata)
  values (v_client_id, v_client_name, v_caller, v_caller_role::text, 'sale_closed', 'sale',
    format('%s closed sale for %s (%s %s mo)', coalesce(v_caller_name,'A user'), v_client_name,
      coalesce(v_pkg, v_add_on_name), coalesce(v_term_months,1)),
    jsonb_build_object('deal_id', v_deal_id, 'contract_id', v_contract_id, 'invoice_id', v_invoice_id,
      'onboarding_id', v_onboarding_id,
      'setup_fee', v_setup_fee, 'monthly_retainer', v_monthly_retainer, 'term_months', v_term_months,
      'new_client', v_new_client, 'idempotency_key', v_idem, 'rate_group', v_rate_group_key,
      'addon_bucket', v_addon_bucket, 'custom_deliverables', v_custom_deliv_count,
      'has_brief', v_brief is not null, 'has_discovery', v_discovery is not null));

  v_result := jsonb_build_object(
    'success', true, 'client_id', v_client_id, 'deal_id', v_deal_id, 'contract_id', v_contract_id,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number,
    'onboarding_id', v_onboarding_id, 'commission_rows_written', v_commission_rows,
    'deliverables_created', v_deliverables, 'custom_deliverables_created', v_custom_deliv_count,
    'tasks_created', v_tasks_created, 'new_client_created', v_new_client,
    'signing_token', v_signing_token, 'term_months', v_term_months,
    'rate_group', v_rate_group_key, 'idempotent_replay', false);
  update public.deals set close_sale_response=v_result where id=v_deal_id;
  return v_result;
end $function$;
