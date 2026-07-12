-- 35_qualify_lead_wire_milestone.sql
-- Phase 3 PR 3: add notify-lead-milestone fire-and-forget call to qualify_lead RPC.
-- Three call sites: qualified_verified | qualified_clarify | qualified_reject.
-- Wrapped in BEGIN/EXCEPTION — never breaks the qualification decision.

create or replace function public.qualify_lead(
  p_lead_id          uuid,
  p_decision         text,
  p_criteria_checked jsonb,
  p_temperature      text,
  p_note             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor        uuid := auth.uid();
  v_lead         record;
  v_r87_accrued  boolean := false;
  v_supabase_url text;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not (public.has_role(v_actor, 'owner') or public.has_role(v_actor, 'admin')) then
    raise exception 'forbidden: owner/admin only' using errcode = '42501';
  end if;

  if p_decision not in ('verified','needs_clarification','rejected') then
    raise exception 'invalid_decision: %', p_decision using errcode = '22023';
  end if;

  if p_temperature is not null and p_temperature not in ('cold','warm','hot') then
    raise exception 'invalid_temperature: %', p_temperature using errcode = '22023';
  end if;

  if p_decision = 'rejected' and (p_note is null or trim(p_note) = '') then
    raise exception 'rejection_reason_required' using errcode = '22023';
  end if;

  if p_decision = 'needs_clarification' and (p_note is null or trim(p_note) = '') then
    raise exception 'clarification_note_required' using errcode = '22023';
  end if;

  select id, source, submitted_by, cpc_r87_paid, notes
    into v_lead
    from public.leads
   where id = p_lead_id
   for update;

  if v_lead.id is null then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  if p_decision = 'verified' then
    update public.leads
       set status             = 'verified',
           verified_by        = v_actor,
           verified_date      = current_date,
           warm_lead_criteria = p_criteria_checked,
           lead_temperature   = coalesce(p_temperature, lead_temperature),
           updated_at         = now()
     where id = p_lead_id;

    if v_lead.source = 'cpc_outbound'
       and v_lead.submitted_by is not null
       and public.has_role(v_lead.submitted_by, 'cpc')
       and v_lead.cpc_r87_paid = false
    then
      update public.leads
         set cpc_r87_paid = true,
             updated_at   = now()
       where id = p_lead_id;

      insert into public.audit_log (actor_id, action, table_name, row_id, after_data)
      values (
        v_actor,
        'cpc_r87_accrued',
        'leads',
        p_lead_id,
        jsonb_build_object(
          'cpc_user_id', v_lead.submitted_by,
          'amount',      87,
          'lead_id',     p_lead_id
        )
      );
      v_r87_accrued := true;
    end if;

  elsif p_decision = 'needs_clarification' then
    update public.leads
       set status             = 'pending_verification',
           warm_lead_criteria = p_criteria_checked,
           lead_temperature   = coalesce(p_temperature, lead_temperature),
           notes              = coalesce(notes || E'\n\n', '') ||
                                '[' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] needs_clarification: ' || p_note,
           updated_at         = now()
     where id = p_lead_id;

  elsif p_decision = 'rejected' then
    update public.leads
       set status             = 'rejected',
           rejection_reason   = p_note,
           warm_lead_criteria = p_criteria_checked,
           lead_temperature   = coalesce(p_temperature, lead_temperature),
           updated_at         = now()
     where id = p_lead_id;
  end if;

  insert into public.audit_log (actor_id, action, table_name, row_id, after_data)
  values (
    v_actor,
    'lead_qualified',
    'leads',
    p_lead_id,
    jsonb_build_object(
      'decision',         p_decision,
      'criteria_checked', p_criteria_checked,
      'temperature',      p_temperature,
      'note',             p_note,
      'r87_accrued',      v_r87_accrued
    )
  );

  -- Notify lead assigner of milestone — fire-and-forget, never breaks qualification.
  begin
    select coalesce(
      (select value::text from public.system_settings where key = 'supabase_functions_url'),
      'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1'
    ) into v_supabase_url;

    perform net.http_post(
      url     := v_supabase_url || '/notify-lead-milestone',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object(
        'lead_id',   p_lead_id,
        'milestone', case p_decision
                       when 'verified'            then 'qualified_verified'
                       when 'needs_clarification' then 'qualified_clarify'
                       when 'rejected'            then 'qualified_reject'
                     end,
        'metadata',  case p_decision
                       when 'needs_clarification' then jsonb_build_object('note', p_note)
                       when 'rejected'            then jsonb_build_object('rejection_reason', p_note)
                       else '{}'::jsonb
                     end
      )
    );
  exception when others then
    insert into public.audit_log(actor_id, action, table_name, row_id, after_data)
    values (v_actor, 'error', 'leads', p_lead_id,
            jsonb_build_object('error', sqlerrm, 'context', 'qualify_lead_notify_milestone'));
  end;

  return jsonb_build_object(
    'ok',          true,
    'lead_id',     p_lead_id,
    'decision',    p_decision,
    'r87_accrued', v_r87_accrued
  );
end $$;
