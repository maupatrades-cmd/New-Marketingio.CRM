-- 33_cold_lead_cron.sql
-- Phase 3 PR 4: cold-lead cron.
--
-- Daily at 06:00 SAST (= 04:00 UTC), scan for verified + assigned leads
-- that have had no updates for 7+ days and fire notify-lead-milestone with
-- milestone='cold'. cold_notified_at on leads prevents re-fire.

create extension if not exists pg_cron with schema extensions;

alter table public.leads
  add column if not exists cold_notified_at timestamptz;

create or replace function public.check_cold_leads()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead         record;
  v_count_fired  int := 0;
  v_count_scan   int := 0;
  v_supabase_url text;
begin
  select coalesce(
    (select value::text from public.system_settings where key = 'supabase_functions_url'),
    'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1'
  ) into v_supabase_url;

  for v_lead in
    select id
      from public.leads
     where status            = 'verified'
       and assigned_to      is not null
       and cold_notified_at is null
       and updated_at        < now() - interval '7 days'
     order by updated_at asc
     limit 200      -- safety cap per run
  loop
    v_count_scan := v_count_scan + 1;

    begin
      perform net.http_post(
        url     := v_supabase_url || '/notify-lead-milestone',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body    := jsonb_build_object('lead_id', v_lead.id, 'milestone', 'cold')
      );

      update public.leads
         set cold_notified_at = now()
       where id = v_lead.id;

      v_count_fired := v_count_fired + 1;
    exception when others then
      insert into public.audit_log(actor_id, action, table_name, row_id, after_data)
        values (null, 'error', 'leads', v_lead.id,
                jsonb_build_object('error', sqlerrm, 'context', 'check_cold_leads_dispatch'));
    end;
  end loop;

  insert into public.audit_log(actor_id, action, table_name, row_id, after_data)
    values (null, 'cold_lead_scan_completed', 'leads', null,
            jsonb_build_object('scanned', v_count_scan, 'fired', v_count_fired));

  return jsonb_build_object('scanned', v_count_scan, 'fired', v_count_fired);
end $$;

revoke all on function public.check_cold_leads() from public, anon, authenticated;

-- Schedule daily at 06:00 SAST = 04:00 UTC.
do $$
begin
  perform cron.unschedule('cold_lead_scan')
  where exists (select 1 from cron.job where jobname = 'cold_lead_scan');
exception when others then null;
end $$;

select cron.schedule(
  'cold_lead_scan',
  '0 4 * * *',
  $$select public.check_cold_leads();$$
);
