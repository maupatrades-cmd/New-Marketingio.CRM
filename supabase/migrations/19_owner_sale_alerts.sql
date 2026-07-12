-- SPEC — Owner sale-event notifications.
--   see send-email template `owner_sale_alert` + notify-owner-sale Edge Function.
--
-- Three new notification_type values + a deals AFTER-INSERT trigger that
-- POSTs to the new notify-owner-sale Edge Function (async, never blocks
-- the close). Reuses the SAME client_notifications table + bell that
-- the hot-lead engine uses. No second engine.

-- 1) Extend notification_type to allow the three new owner-side events.
alter table public.client_notifications
  drop constraint if exists client_notifications_notification_type_check;
alter table public.client_notifications
  add constraint client_notifications_notification_type_check check (
    notification_type in (
      'deliverable_ready','invoice_issued','invoice_overdue','payment_received','payment_failed',
      'message_received','contract_to_sign','report_ready','onboarding_step_complete',
      'onboarding_submission','lead_pending_verification','client_cancelled','system_update',
      -- Owner sale-event notifications:
      'sale_logged','upsell_added','opportunity_closed'
    )
  );

-- 2) AFTER-INSERT trigger on deals — when a closed_won deal lands we
--    fire-and-forget a POST to notify-owner-sale. Independent of the
--    existing deals_post_sale_orchestrator trigger so an owner-alert
--    failure can never affect the client-facing post-sale fan-out
--    (and vice versa).
create or replace function public.fire_owner_sale_alert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url  text;
  v_anon text;
begin
  if new.stage != 'closed_won' then return new; end if;
  -- Read URL + anon key from GUCs — see migration 16 rationale. No
  -- secrets baked into the migration file.
  v_url  := coalesce(
    nullif(current_setting('app.settings.supabase_url',  true), ''),
    'https://yyrzppuntgtvurnnksfc.supabase.co'
  );
  v_anon := nullif(current_setting('app.settings.supabase_anon_key', true), '');
  if v_anon is null then
    raise notice 'fire_owner_sale_alert: app.settings.supabase_anon_key not set — alert not fired for deal %', new.id;
    return new;
  end if;
  -- For now, every closed_won deal fires as 'sale_logged'. When the
  -- Upsell and Sales Opportunities surfaces are rebuilt, those flows
  -- can call notify-owner-sale directly with 'upsell_added' or
  -- 'opportunity_closed' before / instead of relying on this trigger.
  perform net.http_post(
    url     := v_url || '/functions/v1/notify-owner-sale',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_anon
    ),
    body    := jsonb_build_object('deal_id', new.id, 'event_type', 'sale_logged')
  );
  return new;
end $$;

drop trigger if exists deals_owner_sale_alert on public.deals;
create trigger deals_owner_sale_alert
  after insert on public.deals
  for each row execute function public.fire_owner_sale_alert();
