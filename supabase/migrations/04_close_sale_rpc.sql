-- 04_close_sale_rpc.sql
-- close_sale(payload jsonb) — single transactional orchestrator for sales.
-- HANDOVER §5.3 + §10. SECURITY DEFINER so caller bypasses RLS for the
-- atomic multi-table write; we authz at the top of the function instead.

create or replace function public.close_sale(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller            uuid := auth.uid();
  v_caller_role       public.app_role;
  v_caller_name       text;
  v_allowed_roles     jsonb;
  v_rates             jsonb;
  v_payroll           jsonb;
  v_pkg_rates         jsonb;
  v_commission_role   text;        -- owner -> founder mapping
  v_client_id         uuid;
  v_client_name       text;
  v_new_client        boolean := false;
  v_deal_id           uuid;
  v_contract_id       uuid;
  v_onboarding_id     uuid;
  v_admin_id          uuid;
  v_admin_name        text;
  v_template          public.fulfilment_templates;
  v_setup_titles      jsonb;
  v_recurring_titles  jsonb;
  v_title             text;
  v_commission_rows   integer := 0;
  v_deliverables      integer := 0;
  v_tasks_created     integer := 0;
  v_pkg               text;
  v_deal_type         text;
  v_add_on_name       text;
  v_setup_fee         numeric(10,2);
  v_monthly_retainer  numeric(10,2);
  v_cpc_id            uuid;
  v_cpc_name          text;
  v_payroll_month     text := to_char(now(), 'YYYY-MM');
  v_qualifying_date   date := current_date;
  v_flat_amount       numeric(10,2);
  v_setup_pct         numeric(6,2);
  v_retainer_pct      numeric(6,2);
  v_term_months       integer;
  v_signing_token     text;
begin
  -- =====================================================================
  -- STEP 1: AUTHZ
  -- =====================================================================
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_caller_role := public.current_user_role();
  if v_caller_role is null then
    raise exception 'Caller has no app role' using errcode = '42501';
  end if;

  select value into v_allowed_roles from public.system_settings where key = 'roles_allowed_to_close';
  if v_allowed_roles is null
     or not v_allowed_roles ? (v_caller_role::text) then
    raise exception 'Role % is not permitted to close sales', v_caller_role using errcode = '42501';
  end if;

  select full_name into v_caller_name from public.profiles where id = v_caller;

  -- =====================================================================
  -- STEP 2: DESTRUCTURE PAYLOAD
  -- =====================================================================
  v_deal_type        := coalesce(payload->>'deal_type', 'core_package');
  v_pkg              := payload->>'package';
  v_add_on_name      := payload->>'add_on_name';
  v_setup_fee        := nullif(payload->>'setup_fee','')::numeric;
  v_monthly_retainer := nullif(payload->>'monthly_retainer','')::numeric;
  v_cpc_id           := nullif(payload->>'cpc_id','')::uuid;

  -- =====================================================================
  -- STEP 3: VALIDATE
  -- =====================================================================
  if v_deal_type not in ('core_package','add_on') then
    raise exception 'Invalid deal_type %', v_deal_type using errcode = '22023';
  end if;

  if v_deal_type = 'core_package' then
    if v_pkg is null or v_pkg not in ('ignite','accelerate','dominate','street_pulse','township_pulse') then
      raise exception 'Invalid package % for core_package deal', v_pkg using errcode = '22023';
    end if;
  end if;

  if v_deal_type = 'add_on' and (v_add_on_name is null or trim(v_add_on_name) = '') then
    raise exception 'add_on_name required for add_on deal' using errcode = '22023';
  end if;

  if coalesce(v_setup_fee, 0) < 0 or coalesce(v_monthly_retainer, 0) < 0 then
    raise exception 'Fees cannot be negative' using errcode = '22023';
  end if;

  if (payload->>'client_business_name') is null and (payload->>'client_id') is null then
    raise exception 'Either client_id or client_business_name required' using errcode = '22023';
  end if;

  -- =====================================================================
  -- STEP 4: CLOSER LOOKUP + OWNER->FOUNDER MAPPING (§5.4)
  -- =====================================================================
  if v_caller_role = 'owner' then
    v_commission_role := 'founder';
  elsif v_caller_role::text in ('field_agent','cpc','admin') then
    v_commission_role := v_caller_role::text;
  else
    v_commission_role := 'other';
  end if;

  -- =====================================================================
  -- STEP 5: CPC LOOKUP (optional, distinct from closer)
  -- =====================================================================
  if v_cpc_id is not null then
    select full_name into v_cpc_name from public.profiles where id = v_cpc_id;
    if v_cpc_name is null then
      raise exception 'cpc_id % not found in profiles', v_cpc_id using errcode = '23503';
    end if;
  end if;

  -- =====================================================================
  -- STEP 6: CLIENT LOOKUP OR CREATE
  -- =====================================================================
  if (payload->>'client_id') is not null then
    v_client_id := (payload->>'client_id')::uuid;
    select business_name into v_client_name from public.clients where id = v_client_id;
    if v_client_name is null then
      raise exception 'client_id % not found', v_client_id using errcode = '23503';
    end if;
  else
    v_client_name := payload->>'client_business_name';
    insert into public.clients(
      business_name, contact_person, email, phone, address, industry,
      status, source, package, monthly_retainer, setup_fee_amount,
      created_by
    ) values (
      v_client_name,
      payload->>'client_contact_person',
      payload->>'client_email',
      payload->>'client_phone',
      payload->>'client_address',
      payload->>'client_industry',
      'onboarding',
      coalesce(payload->>'source','other'),
      case when v_deal_type='core_package' then v_pkg else 'none' end,
      v_monthly_retainer,
      v_setup_fee,
      v_caller
    )
    returning id into v_client_id;
    v_new_client := true;
  end if;

  -- =====================================================================
  -- STEP 7: DEAL INSERT (stage = closed_won, probability = 100)
  -- =====================================================================
  insert into public.deals(
    client_id, client_name, deal_type, package, add_on_name,
    stage, setup_fee, monthly_retainer, probability,
    closer_id, closer_name, closer_role, source,
    cpc_id, cpc_name, closed_at
  ) values (
    v_client_id, v_client_name, v_deal_type,
    case when v_deal_type='core_package' then v_pkg else 'none' end,
    v_add_on_name,
    'closed_won', v_setup_fee, v_monthly_retainer, 100,
    v_caller, v_caller_name, v_caller_role,
    coalesce(payload->>'source','other'),
    v_cpc_id, v_cpc_name, now()
  )
  returning id into v_deal_id;

  -- =====================================================================
  -- STEP 8: COMMISSION INSERTS
  -- Load rates once.
  -- =====================================================================
  select value into v_rates    from public.system_settings where key = 'commission_rates';
  select value into v_payroll  from public.system_settings where key = 'payroll_schedule';

  if v_deal_type = 'core_package' then
    v_pkg_rates    := v_rates->v_pkg;
    v_flat_amount  := nullif(v_pkg_rates->>'flat_amount','')::numeric;
    v_setup_pct    := nullif(v_pkg_rates->>'setup_pct','')::numeric;
    v_retainer_pct := nullif(v_pkg_rates->>'retainer_pct','')::numeric;

    if v_flat_amount is not null then
      -- Street / Township Pulse: flat closer commission
      insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
      values (v_caller, v_caller_name, v_commission_role, 'setup_commission', v_deal_id, v_client_id, v_client_name, v_pkg, v_flat_amount, 'sale_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
      v_commission_rows := v_commission_rows + 1;
    else
      -- Percentage-based packages
      if v_setup_pct is not null and v_setup_fee is not null and v_setup_fee > 0 then
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'setup_commission', v_deal_id, v_client_id, v_client_name, v_pkg, v_setup_fee, v_setup_pct, round(v_setup_fee * v_setup_pct / 100, 2), 'sale_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows + 1;
      end if;

      if v_retainer_pct is not null and v_monthly_retainer is not null and v_monthly_retainer > 0 then
        select coalesce(term_months, 12) into v_term_months from public.fulfilment_templates where code = v_pkg;
        v_term_months := coalesce(v_term_months, 12);
        insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, rate_percent, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
        values (v_caller, v_caller_name, v_commission_role, 'retainer_commission', v_deal_id, v_client_id, v_client_name, v_pkg, v_monthly_retainer * v_term_months, v_retainer_pct, round(v_monthly_retainer * v_term_months * v_retainer_pct / 100, 2), 'sale_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
        v_commission_rows := v_commission_rows + 1;
      end if;
    end if;
  else
    -- add_on deal
    insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, package_or_addon, base_amount, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
    values (v_caller, v_caller_name, v_commission_role, 'add_on_once_off', v_deal_id, v_client_id, v_client_name, v_add_on_name, v_setup_fee, coalesce(v_setup_fee,0), 'add_on_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
    v_commission_rows := v_commission_rows + 1;
  end if;

  -- ADMIN contract-load fee (R25) — caller is NOT admin
  if v_caller_role != 'admin' then
    -- Pick first admin user with role; nullable.
    insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, base_amount, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
    select ur.user_id, p.full_name, 'admin', 'admin_contract_load', v_deal_id, v_client_id, v_client_name, null, (v_rates->>'admin_contract_load')::numeric, 'sale_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month
    from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.role = 'admin' limit 1;
    if found then v_commission_rows := v_commission_rows + 1; end if;
  end if;

  -- CPC bonus when distinct CPC sourced the deal
  if v_cpc_id is not null and v_cpc_id != v_caller then
    insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
    values (v_cpc_id, v_cpc_name, 'cpc', 'cpc_closure_bonus', v_deal_id, v_client_id, v_client_name, (v_rates->>'cpc_separate_closer_bonus')::numeric, 'sale_closed_by_other', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
    v_commission_rows := v_commission_rows + 1;
  end if;

  -- CPC closer bonus when caller IS cpc
  if v_caller_role = 'cpc' then
    insert into public.commissions(staff_id, staff_name, staff_role, commission_type, deal_id, client_id, client_name, commission_amount, qualifying_event, qualifying_event_date, status, payroll_month)
    values (v_caller, v_caller_name, 'cpc', 'cpc_closure_bonus', v_deal_id, v_client_id, v_client_name, (v_rates->>'cpc_closure_bonus')::numeric, 'sale_closed', v_qualifying_date, coalesce(v_payroll->>'commission_default_status','pending'), v_payroll_month);
    v_commission_rows := v_commission_rows + 1;
  end if;

  update public.deals set commission_generated = true where id = v_deal_id;

  -- =====================================================================
  -- STEP 9: CONTRACT DRAFT
  -- =====================================================================
  v_signing_token := encode(gen_random_bytes(24), 'hex');
  insert into public.contracts(
    client_id, client_name, deal_id, package, add_on_name,
    setup_fee, monthly_retainer, initial_term_months,
    contract_start_date, contract_end_date, status,
    signing_token, signing_token_expires_at, signing_status
  )
  select
    v_client_id, v_client_name, v_deal_id,
    case when v_deal_type='core_package' then v_pkg else 'add_on' end,
    v_add_on_name,
    v_setup_fee, v_monthly_retainer,
    coalesce(ft.term_months, 12),
    current_date,
    current_date + (coalesce(ft.term_months, 12) || ' months')::interval,
    'draft', v_signing_token, now() + interval '30 days', 'not_sent'
  from (select term_months from public.fulfilment_templates where code = v_pkg) ft
  returning id into v_contract_id;

  if v_contract_id is null then
    -- Add-on case: no fulfilment template lookup
    insert into public.contracts(
      client_id, client_name, deal_id, package, add_on_name,
      setup_fee, monthly_retainer, initial_term_months,
      contract_start_date, contract_end_date, status,
      signing_token, signing_token_expires_at, signing_status
    ) values (
      v_client_id, v_client_name, v_deal_id,
      case when v_deal_type='core_package' then v_pkg else 'add_on' end,
      v_add_on_name,
      v_setup_fee, v_monthly_retainer, 1,
      current_date, current_date + interval '1 month',
      'draft', v_signing_token, now() + interval '30 days', 'not_sent'
    )
    returning id into v_contract_id;
  end if;

  -- =====================================================================
  -- STEP 10: CLIENT ONBOARDING
  -- =====================================================================
  select ur.user_id, p.full_name into v_admin_id, v_admin_name
  from public.user_roles ur join public.profiles p on p.id = ur.user_id
  where ur.role = 'admin' limit 1;

  if v_admin_id is null then
    v_admin_id := v_caller;
    v_admin_name := v_caller_name;
  end if;

  insert into public.client_onboarding(
    deal_id, client_id, client_name,
    assigned_admin_id, assigned_admin_name, current_phase
  ) values (
    v_deal_id, v_client_id, v_client_name,
    v_admin_id, v_admin_name, 'phase1_contract_signed'
  ) returning id into v_onboarding_id;

  -- =====================================================================
  -- STEP 11: AUTO-TASKS
  -- =====================================================================
  insert into public.tasks(title, description, client_id, client_name, deal_id, onboarding_id, assigned_to, assigned_to_name, created_by, status, priority, due_date, auto_generated)
  values ('Kick off onboarding for ' || v_client_name,
          'Send welcome pack, schedule onboarding call, ensure contract is signed.',
          v_client_id, v_client_name, v_deal_id, v_onboarding_id,
          v_admin_id, v_admin_name, v_caller,
          'open', 'high', current_date + 1, true);
  v_tasks_created := v_tasks_created + 1;

  if v_setup_fee is not null and v_setup_fee > 0 then
    insert into public.tasks(title, description, client_id, client_name, deal_id, onboarding_id, assigned_to, assigned_to_name, created_by, status, priority, due_date, auto_generated)
    values ('Follow up on setup fee for ' || v_client_name,
            'Confirm setup fee payment (R' || v_setup_fee || ') and reflect on invoice.',
            v_client_id, v_client_name, v_deal_id, v_onboarding_id,
            v_admin_id, v_admin_name, v_caller,
            'open', 'medium', current_date + 3, true);
    v_tasks_created := v_tasks_created + 1;
  end if;

  -- =====================================================================
  -- STEP 12: DELIVERABLES from FulfilmentTemplate
  -- =====================================================================
  if v_deal_type = 'core_package' then
    select * into v_template from public.fulfilment_templates where code = v_pkg;
    if v_template.id is not null then
      v_setup_titles     := v_template.setup_deliverables;
      v_recurring_titles := v_template.recurring_deliverables;

      for v_title in select jsonb_array_elements_text(coalesce(v_setup_titles, '[]'::jsonb))
      loop
        insert into public.deliverables(client_id, client_name, deal_id, template_id, title, phase, product, owner_role, status, due_date)
        values (v_client_id, v_client_name, v_deal_id, v_template.id, v_title, 'setup', v_pkg,
                v_template.internal_owner_role, 'not_started',
                current_date + coalesce(v_template.soft_sla_days, 5));
        v_deliverables := v_deliverables + 1;
      end loop;

      for v_title in select jsonb_array_elements_text(coalesce(v_recurring_titles, '[]'::jsonb))
      loop
        insert into public.deliverables(client_id, client_name, deal_id, template_id, title, phase, product, owner_role, status, due_date, month_year)
        values (v_client_id, v_client_name, v_deal_id, v_template.id, v_title, 'monthly_recurring', v_pkg,
                v_template.internal_owner_role, 'not_started',
                date_trunc('month', current_date)::date + interval '1 month',
                to_char(current_date + interval '1 month','YYYY-MM'));
        v_deliverables := v_deliverables + 1;
      end loop;
    end if;
  end if;

  -- =====================================================================
  -- STEP 13: CLIENT ACTIVITY LOG
  -- =====================================================================
  insert into public.client_activity_log(
    client_id, client_name, actor_id, actor_role, event_type, event_category,
    event_summary, event_metadata
  ) values (
    v_client_id, v_client_name, v_caller, v_caller_role::text,
    'sale_closed', 'sale',
    format('%s closed sale for %s (%s)', coalesce(v_caller_name,'A user'), v_client_name, coalesce(v_pkg, v_add_on_name)),
    jsonb_build_object(
      'deal_id', v_deal_id,
      'contract_id', v_contract_id,
      'onboarding_id', v_onboarding_id,
      'setup_fee', v_setup_fee,
      'monthly_retainer', v_monthly_retainer,
      'new_client', v_new_client
    )
  );

  -- =====================================================================
  -- RETURN
  -- =====================================================================
  return jsonb_build_object(
    'success',                  true,
    'client_id',                v_client_id,
    'deal_id',                  v_deal_id,
    'contract_id',              v_contract_id,
    'onboarding_id',            v_onboarding_id,
    'commission_rows_written',  v_commission_rows,
    'deliverables_created',     v_deliverables,
    'tasks_created',            v_tasks_created,
    'new_client_created',       v_new_client,
    'signing_token',            v_signing_token
  );
end $$;

grant execute on function public.close_sale(jsonb) to authenticated;
