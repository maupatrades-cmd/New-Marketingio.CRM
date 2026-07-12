-- 38_convert_lead_stamps_lead_id.sql
-- Stamp deals.lead_id when converting a lead, so the milestone trigger from
-- migration 36 fires deal_created. Also allow re-qualifying a rejected lead
-- by removing the implicit block — qualify_lead already updates regardless of
-- prior status, so this is purely a UI affordance.

create or replace function public.convert_lead_to_deal(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_caller_role  public.app_role;
  v_caller_name  text;
  v_lead         public.leads;
  v_deal_source  text;
  v_deal_id      uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_caller_role := public.current_user_role();
  if v_caller_role is null or v_caller_role::text not in ('owner','admin') then
    raise exception 'forbidden: owner or admin required' using errcode = '42501';
  end if;

  select full_name into v_caller_name from public.profiles where id = v_caller;

  select * into v_lead from public.leads where id = p_lead_id;
  if not found then
    raise exception 'lead_not_found: %', p_lead_id using errcode = '23503';
  end if;

  if v_lead.status = 'converted' or v_lead.converted_to_deal_id is not null then
    raise exception 'lead_already_converted: %', p_lead_id using errcode = '23505';
  end if;

  v_deal_source := case v_lead.source
                     when 'phone_call_to_admin' then 'other'
                     when 'cpc_outbound'        then 'cpc_outbound'
                     when 'field_agent_direct'  then 'field_agent_direct'
                     when 'fnc_referral'        then 'fnc_referral'
                     when 'inbound'             then 'inbound'
                     when 'referral'            then 'referral'
                     else 'other'
                   end;

  insert into public.deals(
    client_id, client_name, deal_type, package, add_on_name,
    stage, setup_fee, monthly_retainer, probability,
    closer_id, closer_name, closer_role, source,
    notes,
    lead_id
  ) values (
    null, v_lead.business_name, 'core_package', 'none', null,
    'new_lead', null, null, 10,
    v_caller, v_caller_name, v_caller_role, v_deal_source,
    v_lead.notes,
    p_lead_id
  )
  returning id into v_deal_id;

  update public.leads
     set status               = 'converted',
         converted_to_deal_id = v_deal_id,
         updated_at           = now()
   where id = p_lead_id;

  return jsonb_build_object(
    'ok',      true,
    'lead_id', p_lead_id,
    'deal_id', v_deal_id
  );
end $$;

grant execute on function public.convert_lead_to_deal(uuid) to authenticated;
