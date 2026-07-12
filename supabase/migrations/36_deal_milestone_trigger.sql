-- 36_deal_milestone_trigger.sql
-- Phase 3 PR 3: deals trigger for milestones 4-6 + close_sale_from_lead wrapper.
--
-- Trigger fires on:
--   INSERT: deal_created (pipeline stage) or sale_won (stage=closed_won born-closed)
--   UPDATE lead_id NULL→value: same logic as INSERT based on current stage
--   UPDATE stage→closed_won: sale_won
--   UPDATE stage→closed_lost: sale_lost
--
-- All pg_net calls are fire-and-forget inside BEGIN/EXCEPTION — never blocks a deal write.
--
-- close_sale_from_lead(payload, lead_id): thin wrapper that calls close_sale() then
-- sets deals.lead_id on the returned deal, which triggers the milestone. The UI passes
-- lead_id when Log Sale is initiated from a lead context (UI wiring is a follow-up step).

create or replace function public.fire_lead_milestone_on_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supabase_url text;
  v_milestone    text;
begin
  if NEW.lead_id is null then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.stage = 'closed_won' then
      v_milestone := 'sale_won';
    elsif NEW.stage != 'closed_lost' then
      v_milestone := 'deal_created';
    end if;
    -- closed_lost on INSERT is pathological — skip; stage flip covers it
  elsif TG_OP = 'UPDATE' then
    if OLD.lead_id is null and NEW.lead_id is not null then
      -- lead_id just linked to an existing deal (e.g. close_sale_from_lead)
      if NEW.stage = 'closed_won' then
        v_milestone := 'sale_won';
      elsif NEW.stage != 'closed_lost' then
        v_milestone := 'deal_created';
      end if;
    elsif NEW.stage is distinct from OLD.stage then
      if NEW.stage = 'closed_won' then
        v_milestone := 'sale_won';
      elsif NEW.stage = 'closed_lost' then
        v_milestone := 'sale_lost';
      end if;
    end if;
  end if;

  if v_milestone is null then
    return NEW;
  end if;

  begin
    select coalesce(
      (select value::text from public.system_settings where key = 'supabase_functions_url'),
      'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1'
    ) into v_supabase_url;

    perform net.http_post(
      url     := v_supabase_url || '/notify-lead-milestone',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object(
        'lead_id',   NEW.lead_id,
        'milestone', v_milestone,
        'metadata',  jsonb_build_object(
          'deal_id', NEW.id,
          'amount',  coalesce(NEW.setup_fee, 0) + coalesce(NEW.monthly_retainer, 0)
        )
      )
    );
  exception when others then
    insert into public.audit_log(actor_id, action, table_name, row_id, after_data)
    values (null, 'error', 'deals', NEW.id,
            jsonb_build_object('error', sqlerrm, 'context', 'fire_lead_milestone_on_deal',
                               'milestone', v_milestone));
  end;

  return NEW;
end $$;

drop trigger if exists lead_milestone_on_deal on public.deals;
create trigger lead_milestone_on_deal
  after insert or update of lead_id, stage
  on public.deals
  for each row
  execute function public.fire_lead_milestone_on_deal();

-- Wrapper: calls close_sale() then stamps lead_id on the created deal.
-- Trigger above fires on the UPDATE of lead_id, dispatching the milestone.
create or replace function public.close_sale_from_lead(payload jsonb, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result  jsonb;
  v_deal_id uuid;
begin
  -- Delegate to close_sale — all validations, commission, contracts etc live there.
  v_result := public.close_sale(payload);

  -- If lead_id provided, stamp it on the new deal. The trigger fires sale_won.
  if p_lead_id is not null
     and (v_result->>'success')::boolean
     and (v_result->>'deal_id') is not null
  then
    v_deal_id := (v_result->>'deal_id')::uuid;
    update public.deals
       set lead_id = p_lead_id
     where id = v_deal_id
       and lead_id is null;  -- idempotent: don't overwrite if already set
  end if;

  return v_result;
end $$;

revoke all on function public.close_sale_from_lead(jsonb, uuid) from public, anon;
grant execute on function public.close_sale_from_lead(jsonb, uuid) to authenticated;
