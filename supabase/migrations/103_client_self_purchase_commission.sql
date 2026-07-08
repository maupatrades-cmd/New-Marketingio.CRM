-- 103_client_self_purchase_commission.sql
-- Directive 21 Part 4 — client_self_purchase now accrues a pending
-- commission for the client's assigned consultant. Renumbered from 101_*
-- on 8 Jul 2026 so it lands strictly after 102_directive_21_schema_and_rpcs.
-- Body pulled from the live database via pg_get_functiondef so the
-- migration ships as the source of truth (previously a comment-only stub).
--
-- Flow
--   1. Resolve consultant: clients.assigned_field_agent first, else the
--      closer_id on the newest closed_won deal for the client.
--   2. If someone is resolved AND setup_fee > 0:
--        - Look up full_name (profiles) and role (user_roles).
--        - Map user_roles.role → commissions.staff_role:
--            owner → founder,  head_of_tech → admin,  others as-is,
--            unknown → 'other'   (so the CHECK constraint accepts it).
--        - Insert commission: type = 'setup_commission' for core packages,
--          'add_on_once_off' for add-ons; base_amount = setup_fee,
--          rate_percent = 10.0, amount = 10 %; status = 'pending'
--          (owner approval still required); qualifying_event =
--          'self_checkout_purchase'.
--        - Fire _notify_staff to the closer (staff mirror also reaches
--          the owner) so it lands in bell + tasks.
--   3. No consultant OR zero setup fee → skip commission silently.
--
-- Everything else in the RPC (deal insert, invoice insert, coordinator
-- task, notify-owner-sale via pg_net) is unchanged from migration 92.

CREATE OR REPLACE FUNCTION public.client_self_purchase(p_product_code text, p_product_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid; v_client_name text; v_has_package boolean; v_coord_id uuid;
  v_catalog jsonb; v_product jsonb;
  v_setup_zar numeric; v_monthly_zar numeric; v_is_core_pkg boolean;
  v_deal_type text; v_deal_package text; v_deal_addon text;
  v_stage text; v_is_upsell boolean;
  v_deal_id uuid; v_existing_inv record; v_invoice_id uuid; v_invoice_number text;
  v_notify_url text; v_notify_body jsonb;
  -- Commission fields (new in this migration)
  v_closer_id uuid; v_closer_name text; v_closer_role_app text;
  v_closer_role_commission text;
  v_commission_type text; v_commission_rate numeric := 10.0;
  v_commission_amount numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select id, business_name into v_client_id, v_client_name from clients where client_user_id = v_uid;
  if v_client_id is null then raise exception 'not_a_client'; end if;
  select exists (select 1 from deals where client_id = v_client_id and stage = 'closed_won' and created_at > now() - interval '18 months') into v_has_package;

  select value into v_catalog from system_settings where key = 'package_catalog';
  select p into v_product from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb)) p where p ->> 'code' = p_product_code limit 1;
  v_is_core_pkg := v_product is not null;

  if v_is_core_pkg then
    v_setup_zar := coalesce((v_product ->> 'setup_zar')::numeric, 0);
    v_monthly_zar := coalesce((v_product ->> 'monthly_zar')::numeric, 0);
    v_deal_type := 'core_package'; v_deal_package := v_product ->> 'code'; v_deal_addon := null;
  else
    v_setup_zar := 0; v_monthly_zar := 0;
    v_deal_type := 'add_on'; v_deal_package := 'none';
    v_deal_addon := coalesce(nullif(p_product_name, ''), p_product_code);
  end if;

  if v_has_package then v_stage := 'proposal'; v_is_upsell := true;
  else v_stage := 'new_lead'; v_is_upsell := false; end if;

  -- 5-min idempotency guard
  select i.id as invoice_id, i.invoice_number, i.deal_id into v_existing_inv
  from invoices i join deals d on d.id = i.deal_id
  where i.client_id = v_client_id and i.status in ('draft','sent','issued')
    and i.invoice_type = 'setup_fee'
    and d.source = 'client_portal_checkout'
    and (d.package = v_deal_package or (d.deal_type = 'add_on' and d.add_on_name is not distinct from v_deal_addon))
    and i.created_at > now() - interval '5 minutes'
  order by i.created_at desc limit 1;
  if v_existing_inv.invoice_id is not null then
    return jsonb_build_object('ok', true, 'deal_id', v_existing_inv.deal_id,
      'invoice_id', v_existing_inv.invoice_id, 'invoice_number', v_existing_inv.invoice_number,
      'invoice_url_path', '/client/invoices/' || v_existing_inv.invoice_id::text, 'idempotent', true);
  end if;

  insert into deals (client_id, client_name, deal_type, package, add_on_name, stage,
    setup_fee, monthly_retainer, source, is_upsell, notes, brief)
  values (v_client_id, v_client_name, v_deal_type, v_deal_package, v_deal_addon, v_stage,
    v_setup_zar, v_monthly_zar, 'client_portal_checkout', v_is_upsell,
    nullif(trim(coalesce(p_notes, '')), ''),
    'Self-serve purchase from client portal · ' || coalesce(p_product_name, p_product_code))
  returning id into v_deal_id;

  v_invoice_number := next_invoice_number();
  insert into invoices (invoice_number, client_id, client_name, deal_id, invoice_type,
    description, amount, vat_applicable, vat_amount, total_amount, issue_date, due_date, status)
  values (v_invoice_number, v_client_id, v_client_name, v_deal_id, 'setup_fee',
    'Setup fee — ' || coalesce(p_product_name, p_product_code),
    v_setup_zar, false, 0, v_setup_zar, current_date, current_date + 7, 'sent')
  returning id into v_invoice_id;

  -- Coordinator task
  select user_id into v_coord_id from user_roles where is_coordinator = true limit 1;
  insert into tasks (title, description, assigned_to, created_by, priority, status,
    client_id, client_name, deal_id, source_action, source_entity_type, source_entity_id)
  values ('Self-serve purchase — ' || coalesce(p_product_name, p_product_code) || ' · ' || v_client_name,
    'Client checked out on /client/checkout and invoice ' || v_invoice_number || ' has been issued for R' || v_setup_zar::text || '.'
      || E'\n\nProduct: ' || coalesce(p_product_name, p_product_code)
      || E'\nDeal: ' || v_deal_id::text
      || E'\nInvoice: /owner/invoices?focus=' || v_invoice_id::text
      || case when v_is_upsell then E'\nType: UPSELL — client already onboarded.' else E'\nType: FIRST purchase — needs onboarding after payment.' end
      || case when nullif(trim(coalesce(p_notes, '')), '') is not null then E'\n\nClient notes: ' || p_notes else '' end,
    coalesce(v_coord_id, v_uid), v_uid, 'high', 'pending',
    v_client_id, v_client_name, v_deal_id, 'client_self_purchase', 'deal', v_deal_id);

  -- ── COMMISSION ACCRUAL (new — Directive 21 Part 4) ────────────────────
  -- Resolve the client's assigned consultant: field agent first, then
  -- the closer on the most recent closed_won deal. Only accrue when we
  -- have someone AND the setup fee is > 0.
  select coalesce(
    cl.assigned_field_agent,
    (select closer_id from deals where client_id = v_client_id and stage = 'closed_won' order by created_at desc limit 1)
  ) into v_closer_id
  from clients cl where cl.id = v_client_id;

  if v_closer_id is not null and v_setup_zar > 0 then
    select p.full_name into v_closer_name from profiles p where p.id = v_closer_id;
    -- Resolve staff role (commissions.staff_role only accepts a subset
    -- of app_role — map owner/head_of_tech to founder/admin, keep the
    -- rest as-is, fall back to 'other').
    select ur.role::text into v_closer_role_app from user_roles ur where ur.user_id = v_closer_id limit 1;
    v_closer_role_commission := case v_closer_role_app
      when 'field_agent' then 'field_agent'
      when 'cpc' then 'cpc'
      when 'admin' then 'admin'
      when 'owner' then 'founder'
      when 'head_of_tech' then 'admin'
      else 'other' end;
    v_commission_type := case when v_is_core_pkg then 'setup_commission' else 'add_on_once_off' end;
    v_commission_amount := round(v_setup_zar * v_commission_rate / 100.0, 2);

    insert into commissions (
      staff_id, staff_name, staff_role, commission_type, deal_id,
      client_id, client_name, package_or_addon,
      base_amount, rate_percent, commission_amount,
      qualifying_event, qualifying_event_date, status, notes
    ) values (
      v_closer_id, coalesce(v_closer_name, 'Consultant'), v_closer_role_commission, v_commission_type, v_deal_id,
      v_client_id, v_client_name, coalesce(p_product_name, p_product_code),
      v_setup_zar, v_commission_rate, v_commission_amount,
      'self_checkout_purchase', now(), 'pending',
      'Auto-accrued from client self-checkout on /client/checkout. Requires owner approval before payout.'
    );

    perform _notify_staff(
      v_client_id,
      'commission_pending_approval',
      '💰 Self-checkout commission — ' || v_client_name,
      coalesce(v_closer_name, 'Consultant') || ' earns R' || v_commission_amount::text ||
        ' (' || v_commission_rate::text || '% of R' || v_setup_zar::text || ') from ' || v_client_name ||
        '''s self-checkout. Awaiting approval.',
      '/owner/money/commissions?focus_deal=' || v_deal_id::text,
      'commission', v_deal_id,
      -- Send directly to the closer AND the owner (staff mirror inside
      -- _notify_staff handles the owner side).
      v_closer_id
    );
  end if;

  -- Fan out owner sale alert
  begin
    v_notify_url := 'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/notify-owner-sale';
    v_notify_body := jsonb_build_object('deal_id', v_deal_id,
      'event_type', case when v_is_upsell then 'upsell_added' else 'sale_logged' end);
    perform net.http_post(url := v_notify_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := v_notify_body, timeout_milliseconds := 3000);
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'deal_id', v_deal_id, 'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number, 'invoice_url_path', '/client/invoices/' || v_invoice_id::text,
    'is_upsell', v_is_upsell,
    'commission_accrued', v_closer_id is not null and v_setup_zar > 0);
end;
$function$;

revoke all on function public.client_self_purchase(text, text, text) from public, anon;
grant execute on function public.client_self_purchase(text, text, text) to authenticated;
