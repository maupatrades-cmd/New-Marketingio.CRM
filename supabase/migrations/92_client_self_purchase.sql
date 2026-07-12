-- Migration 92: Client self-serve purchase from the portal checkout.
--
-- A client tapping "Complete purchase" on /client/checkout/:code used to
-- only insert a task the coordinator had to hand-fulfil. This RPC closes
-- that gap end-to-end: it stamps a real deal, issues a real setup-fee
-- invoice, drops a HIGH-priority task for the coordinator, and fires
-- notify-owner-sale so the owner gets email + in-app the second it lands.
--
-- Shape
--   client_self_purchase(product_code, product_name, notes)
--     → jsonb { ok, deal_id, invoice_id, invoice_number, invoice_url_path }
--
-- Guarantees
--   * SECURITY DEFINER, scoped to auth.uid() → clients.client_user_id.
--     A random authenticated user cannot buy on behalf of a different
--     client because we resolve v_client_id from auth, never from input.
--   * Idempotent within a 5-minute window: repeated clicks return the
--     existing draft invoice instead of stacking duplicates.
--   * Deal starts at stage='proposal' with is_upsell=true when the
--     client already has an active package — that keeps the closed_won
--     post-sale orchestrator OFF for upsells (the client is already
--     provisioned) while still letting the owner move it to closed_won
--     manually if that's the right pipeline flow.
--   * notify-owner-sale is called via pg_net so a slow / failing HTTP
--     hop never blocks the RPC returning to the client.

create or replace function public.client_self_purchase(
  p_product_code text,
  p_product_name text default null,
  p_notes        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid          uuid := auth.uid();
  v_client_id    uuid;
  v_client_name  text;
  v_has_package  boolean;
  v_coord_id     uuid;

  v_catalog        jsonb;
  v_product        jsonb;
  v_setup_zar      numeric;
  v_monthly_zar    numeric;
  v_is_core_pkg    boolean;
  v_deal_type      text;
  v_deal_package   text;
  v_deal_addon     text;
  v_stage          text;
  v_is_upsell      boolean;

  v_deal_id        uuid;
  v_existing_inv   record;
  v_invoice_id     uuid;
  v_invoice_number text;

  v_notify_url     text;
  v_notify_body    jsonb;
begin
  -- 1. Resolve the caller as a client -----------------------------------------
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id, business_name into v_client_id, v_client_name
  from clients where client_user_id = v_uid;
  if v_client_id is null then
    raise exception 'not_a_client';
  end if;

  -- Does this client already have a live package? Cheap heuristic: any
  -- closed_won deal in the last 18 months = they're a paying customer,
  -- so we treat further purchases as upsells.
  select exists (
    select 1 from deals
    where client_id = v_client_id
      and stage = 'closed_won'
      and created_at > now() - interval '18 months'
  ) into v_has_package;

  -- 2. Resolve the product from the package catalog ---------------------------
  -- Core packages live in system_settings.package_catalog. Add-ons are not
  -- there — they arrive via p_product_name and go on the deal as
  -- deal_type='add_on' with add_on_name.
  select value into v_catalog from system_settings where key = 'package_catalog';

  select p into v_product
  from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb)) p
  where p ->> 'code' = p_product_code
  limit 1;

  v_is_core_pkg := v_product is not null;

  if v_is_core_pkg then
    v_setup_zar   := coalesce((v_product ->> 'setup_zar')::numeric, 0);
    v_monthly_zar := coalesce((v_product ->> 'monthly_zar')::numeric, 0);
    v_deal_type   := 'core_package';
    v_deal_package:= v_product ->> 'code';
    v_deal_addon  := null;
  else
    -- Add-on / non-catalog item. The client passes p_product_name and
    -- we take zero-price as the safe default — the owner adjusts on the
    -- invoice before payment if this is a paid add-on. Rare path: most
    -- adds route through core catalog. This branch prevents the RPC
    -- from crashing on unknown codes.
    v_setup_zar   := 0;
    v_monthly_zar := 0;
    v_deal_type   := 'add_on';
    v_deal_package:= 'none';
    v_deal_addon  := coalesce(nullif(p_product_name, ''), p_product_code);
  end if;

  -- Upsells start at 'proposal' (paid but not committed) and skip the
  -- closed_won post-sale orchestrator. First-time customers start at
  -- 'new_lead' so the pipeline visualises them alongside sales-team leads.
  if v_has_package then
    v_stage     := 'proposal';
    v_is_upsell := true;
  else
    v_stage     := 'new_lead';
    v_is_upsell := false;
  end if;

  -- 3. Idempotency check ------------------------------------------------------
  -- If the client double-taps Complete Purchase inside 5 minutes, return
  -- the invoice we already issued instead of stacking another draft.
  select i.id as invoice_id, i.invoice_number, i.deal_id
    into v_existing_inv
  from invoices i
  join deals d on d.id = i.deal_id
  where i.client_id = v_client_id
    and i.status in ('draft','sent','issued')
    and i.invoice_type = 'setup_fee'
    and d.source = 'client_portal_checkout'
    and (d.package = v_deal_package or (d.deal_type = 'add_on' and d.add_on_name is not distinct from v_deal_addon))
    and i.created_at > now() - interval '5 minutes'
  order by i.created_at desc
  limit 1;

  if v_existing_inv.invoice_id is not null then
    return jsonb_build_object(
      'ok', true,
      'deal_id', v_existing_inv.deal_id,
      'invoice_id', v_existing_inv.invoice_id,
      'invoice_number', v_existing_inv.invoice_number,
      'invoice_url_path', '/client/invoices/' || v_existing_inv.invoice_id::text,
      'idempotent', true
    );
  end if;

  -- 4. Create the deal --------------------------------------------------------
  insert into deals (
    client_id, client_name, deal_type, package, add_on_name, stage,
    setup_fee, monthly_retainer, source, is_upsell, notes, brief
  ) values (
    v_client_id, v_client_name, v_deal_type, v_deal_package, v_deal_addon, v_stage,
    v_setup_zar, v_monthly_zar, 'client_portal_checkout', v_is_upsell,
    nullif(trim(coalesce(p_notes, '')), ''),
    'Self-serve purchase from client portal · '
      || coalesce(p_product_name, p_product_code)
  )
  returning id into v_deal_id;

  -- 5. Issue the setup-fee invoice --------------------------------------------
  v_invoice_number := next_invoice_number();

  insert into invoices (
    invoice_number, client_id, client_name, deal_id,
    invoice_type, description, amount, vat_applicable, vat_amount, total_amount,
    issue_date, due_date, status
  ) values (
    v_invoice_number, v_client_id, v_client_name, v_deal_id,
    'setup_fee',
    'Setup fee — ' || coalesce(p_product_name, p_product_code),
    v_setup_zar, false, 0, v_setup_zar,
    current_date, current_date + 7, 'sent'
  )
  returning id into v_invoice_id;

  -- 6. HIGH-priority task for the coordinator ---------------------------------
  select user_id into v_coord_id from user_roles where is_coordinator = true limit 1;

  insert into tasks (
    title, description, assigned_to, created_by, priority, status,
    client_id, client_name, deal_id,
    source_action, source_entity_type, source_entity_id
  ) values (
    'Self-serve purchase — ' || coalesce(p_product_name, p_product_code) || ' · ' || v_client_name,
    'Client checked out on /client/checkout and invoice ' || v_invoice_number
      || ' has been issued for R' || v_setup_zar::text || '.'
      || E'\n\nProduct: ' || coalesce(p_product_name, p_product_code)
      || E'\nDeal: ' || v_deal_id::text
      || E'\nInvoice: /owner/invoices?focus=' || v_invoice_id::text
      || case when v_is_upsell then E'\nType: UPSELL — client already onboarded.'
              else E'\nType: FIRST purchase — needs onboarding after payment.' end
      || case when nullif(trim(coalesce(p_notes, '')), '') is not null
              then E'\n\nClient notes: ' || p_notes else '' end,
    coalesce(v_coord_id, v_uid), v_uid, 'high', 'pending',
    v_client_id, v_client_name, v_deal_id,
    'client_self_purchase', 'deal', v_deal_id
  );

  -- 7. Fan out owner alert via notify-owner-sale (fire-and-forget) -----------
  -- pg_net.http_post never blocks. The trigger deals_owner_sale_alert
  -- normally handles this but its default event_type is sale_logged;
  -- we send 'upsell_added' for upsells so the copy matches reality.
  begin
    v_notify_url  := current_setting('app.settings.notify_owner_sale_url', true);
    if v_notify_url is null or v_notify_url = '' then
      v_notify_url := 'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/notify-owner-sale';
    end if;
    v_notify_body := jsonb_build_object(
      'deal_id', v_deal_id,
      'event_type', case when v_is_upsell then 'upsell_added' else 'sale_logged' end
    );
    perform net.http_post(
      url     := v_notify_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := v_notify_body,
      timeout_milliseconds := 3000
    );
  exception when others then
    -- Notification is best-effort. Never fail the purchase because of it.
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'deal_id', v_deal_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'invoice_url_path', '/client/invoices/' || v_invoice_id::text,
    'is_upsell', v_is_upsell
  );
end;
$function$;

-- Only the client themselves calls this; anon and public should not.
revoke all on function public.client_self_purchase(text, text, text) from public, anon;
grant execute on function public.client_self_purchase(text, text, text) to authenticated;
