-- 31_assign_lead_wire_notify.sql
-- Phase 3 PR 2.5: wire notify-lead-assigned Edge Function into assign_lead RPC.
--
-- Changes vs migration 29:
--   • After the leads UPDATE, fire pg_net.http_post to notify-lead-assigned.
--   • Wrapped in BEGIN/EXCEPTION — a notification failure never breaks the assignment.
--   • Functions URL pulled from system_settings.supabase_functions_url with
--     a hardcoded fallback for the integration project.
--   • Sharpened "Invalid assignee" error message — names the allowed roles
--     explicitly (Phase 3 polish item).

create or replace function public.assign_lead(
  p_lead_id    uuid,
  p_to_user_id uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller        uuid := auth.uid();
  v_current       uuid;
  v_was_reassign  boolean;
  v_assignee_ok   boolean;
  v_supabase_url  text;
begin
  if not (public.has_role(v_caller, 'owner'::app_role) or public.has_role(v_caller, 'admin'::app_role)) then
    raise exception 'Insufficient privilege — owner or admin required'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_to_user_id
      and r.role in ('owner','admin','head_of_tech','field_agent','cpc')
  ) into v_assignee_ok;

  if not v_assignee_ok then
    raise exception 'Invalid assignee — user must be owner, admin, head_of_tech, field_agent or cpc'
      using errcode = '22023';
  end if;

  select assigned_to into v_current
    from public.leads
    where id = p_lead_id;

  if not found then
    raise exception 'Lead not found'
      using errcode = 'P0002';
  end if;

  if v_current = p_to_user_id then
    return jsonb_build_object(
      'ok', true,
      'lead_id', p_lead_id,
      'assignee_id', p_to_user_id,
      'was_reassignment', false,
      'noop', true
    );
  end if;

  v_was_reassign := v_current is not null;

  perform set_config('app.reassign_reason', coalesce(p_reason, ''), true);

  update public.leads
     set assigned_to  = p_to_user_id,
         assigned_by  = v_caller,
         assigned_at  = now()
   where id = p_lead_id;

  -- Fire notify-lead-assigned EF.
  select coalesce(
    (select value::text from public.system_settings where key = 'supabase_functions_url'),
    'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1'
  ) into v_supabase_url;

  begin
    perform net.http_post(
      url     := v_supabase_url || '/notify-lead-assigned',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object(
        'lead_id',     p_lead_id,
        'assignee_id', p_to_user_id,
        'assigner_id', v_caller
      )
    );
  exception
    when others then
      insert into public.audit_log(actor_id, action, table_name, row_id, after_data)
        values (v_caller, 'error', 'leads', p_lead_id,
                jsonb_build_object('error', sqlerrm, 'context', 'assign_lead_notify_dispatch'));
  end;

  return jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'assignee_id', p_to_user_id,
    'was_reassignment', v_was_reassign
  );
end $$;

grant execute on function public.assign_lead(uuid, uuid, text) to authenticated;
