-- Slice 2 Part C — Post-sale orchestrator.
-- See docs/SPEC-2-post-sale-followups.md §A.4.
--
-- Changes:
--   1) public.invoices_seq — sequence used to mint invoice numbers
--      INV-YYYY-NNNNNN.
--   2) close_sale extended to also create the setup_fee invoice in the
--      same transaction. Result now includes invoice_id + invoice_number.
--   3) New SECURITY DEFINER fn fire_post_sale_orchestrator() — replaces
--      fire_onboarding_invite_recap() on the deals AFTER INSERT trigger.
--      POSTs { deal_id } to the post-sale-orchestrator Edge Function
--      via pg_net (async, never blocks the commit).
--   4) New Edge Function post-sale-orchestrator (verify_jwt=false,
--      deployed via MCP) fans out 4 emails per deal:
--      a) provision_client     → client_welcome_magic_link
--      b) onboarding_invite_recap (discovery + outstanding list)
--      c) contract_for_signature (uses contracts.signing_token)
--      d) invoice_issued (uses the setup invoice from step 2)
--      Each step is wrapped in try/catch so one failure can't block the
--      others; the run is audit-logged into client_activity_log.

create sequence if not exists public.invoices_seq start with 1001;

-- close_sale() is the deployed function body in the database (≈350 lines).
-- See pg_get_functiondef('public.close_sale(jsonb)'::regprocedure) for the
-- current source. Important: it now creates the setup invoice when
-- setup_fee > 0 and returns invoice_id + invoice_number.

create or replace function public.fire_post_sale_orchestrator()
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
  -- Read the project URL + anon key from custom GUCs (set via
  -- `alter database … set app.settings.supabase_url = '…'` on the
  -- target project). Bake nothing into the migration so a leaked file
  -- can't ship a live key, and a project rotation doesn't require a
  -- migration rewrite.
  v_url  := coalesce(
    nullif(current_setting('app.settings.supabase_url',  true), ''),
    'https://yyrzppuntgtvurnnksfc.supabase.co'
  );
  v_anon := nullif(current_setting('app.settings.supabase_anon_key', true), '');
  if v_anon is null then
    -- Missing anon key — skip the fan-out rather than 401'ing the fn.
    -- The close_sale still commits; alert loudly via NOTICE for CI.
    raise notice 'fire_post_sale_orchestrator: app.settings.supabase_anon_key not set — orchestrator not fired for deal %', new.id;
    return new;
  end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/post-sale-orchestrator',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_anon
    ),
    body    := jsonb_build_object('deal_id', new.id)
  );
  return new;
end $$;

drop trigger if exists deals_onboarding_recap on public.deals;
drop trigger if exists deals_post_sale_orchestrator on public.deals;
create trigger deals_post_sale_orchestrator
  after insert on public.deals
  for each row execute function public.fire_post_sale_orchestrator();
