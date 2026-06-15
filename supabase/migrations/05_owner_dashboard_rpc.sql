-- 05_owner_dashboard_rpc.sql
-- Server-side aggregator for the Owner Dashboard so the FE makes one call.

create or replace function public.get_owner_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_month  text := to_char(now(), 'YYYY-MM');
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not (public.has_role(v_uid, 'owner') or public.has_role(v_uid, 'admin')) then
    raise exception 'Owner or admin role required' using errcode = '42501';
  end if;

  v_result := jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_clients',       (select count(*) from public.clients where status = 'active'),
      'onboarding_clients',   (select count(*) from public.clients where status = 'onboarding'),
      'open_deals',           (select count(*) from public.deals where stage not in ('closed_won','closed_lost')),
      'closed_won_this_month',(select count(*) from public.deals where stage = 'closed_won' and to_char(coalesce(closed_at, created_at),'YYYY-MM') = v_month),
      'mrr_zar',              (select coalesce(sum(monthly_retainer),0) from public.clients where status in ('active','onboarding')),
      'outstanding_invoices', (select count(*) from public.invoices where status in ('sent','overdue','partial','failed')),
      'pending_commissions',  (select coalesce(sum(commission_amount),0) from public.commissions where status = 'pending'),
      'overdue_tasks',        (select count(*) from public.tasks where status in ('open','in_progress') and due_date < current_date)
    ),
    'revenue_by_month', (
      select coalesce(jsonb_agg(row), '[]'::jsonb) from (
        select jsonb_build_object(
          'month', to_char(d, 'YYYY-MM'),
          'setup_zar', coalesce((select sum(setup_fee) from public.deals where stage='closed_won' and to_char(coalesce(closed_at,created_at),'YYYY-MM') = to_char(d,'YYYY-MM')), 0),
          'mrr_zar',   coalesce((select sum(monthly_retainer) from public.deals where stage='closed_won' and to_char(coalesce(closed_at,created_at),'YYYY-MM') = to_char(d,'YYYY-MM')), 0)
        ) as row
        from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') d
        order by d
      ) t
    ),
    'pipeline_by_stage', (
      select coalesce(jsonb_object_agg(stage, n), '{}'::jsonb) from (
        select stage, count(*) as n from public.deals
        where stage not in ('closed_won','closed_lost') group by stage
      ) s
    ),
    'recent_deals', (
      select coalesce(jsonb_agg(d), '[]'::jsonb) from (
        select id, client_name, stage, package, setup_fee, monthly_retainer, closer_name, closed_at, created_at
        from public.deals order by coalesce(closed_at, created_at) desc limit 10
      ) d
    ),
    'open_tasks', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select id, title, priority, due_date, assigned_to_name, client_name, status
        from public.tasks
        where status in ('open','in_progress')
        order by due_date asc nulls last limit 10
      ) t
    ),
    'team_kpis_this_month', (
      select coalesce(jsonb_agg(row), '[]'::jsonb) from (
        select jsonb_build_object(
          'staff_id', staff_id,
          'staff_name', staff_name,
          'staff_role', staff_role,
          'deals_closed', count(distinct deal_id),
          'commission_total', sum(commission_amount)
        ) as row
        from public.commissions
        where payroll_month = v_month
        group by staff_id, staff_name, staff_role
        order by sum(commission_amount) desc
      ) c
    ),
    'playbooks_featured', (
      select coalesce(jsonb_agg(p), '[]'::jsonb) from (
        select id, code, title, category, short_description
        from public.playbooks
        where 'owner' = any(visible_to_roles) or 'admin' = any(visible_to_roles) or 'field_agent' = any(visible_to_roles) or 'cpc' = any(visible_to_roles)
        order by updated_at desc limit 6
      ) p
    ),
    'generated_at', now()
  );

  return v_result;
end $$;

grant execute on function public.get_owner_dashboard() to authenticated;
