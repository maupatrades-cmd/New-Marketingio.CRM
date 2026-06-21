-- Migration 46: My Day notification engine
-- Adds lead_temperature, cold_notified_at, assigned_to to deals
-- Extends client_notifications.notification_type CHECK
-- Adds send_staff_notification helper, triggers for closed_won / setup_fee_cleared / cpc_lead_fee
-- Adds flag_cold_leads() and mark_my_notifications_read()

-- ─── deals additions ─────────────────────────────────────────────────────────

alter table public.deals
  add column if not exists lead_temperature text default 'warm'
    check (lead_temperature in ('cold','warm','hot')),
  add column if not exists cold_notified_at timestamptz,
  add column if not exists assigned_to uuid references public.profiles(id);

-- ─── Extend notification_type CHECK ──────────────────────────────────────────

alter table public.client_notifications
  drop constraint if exists client_notifications_notification_type_check;

alter table public.client_notifications
  add constraint client_notifications_notification_type_check
  check (notification_type = any (array[
    'payment_received','invoice_sent','onboarding_complete','contract_signed',
    'message_received','lead_pending_verification','hot_lead',
    'sale_closed_won','commission_unlocked','setup_fee_cleared',
    'cold_lead','cpc_lead_fee_earned','cpc_closure_bonus_earned'
  ]));

-- ─── Helper: send_staff_notification ─────────────────────────────────────────

create or replace function public.send_staff_notification(
  p_recipient_id        uuid,
  p_type                text,
  p_title               text,
  p_body                text,
  p_action_url          text    default null,
  p_related_entity_type text    default null,
  p_related_entity_id   uuid    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.client_notifications (
    recipient_user_id, notification_type, title, body,
    action_url, related_entity_type, related_entity_id
  ) values (
    p_recipient_id, p_type, p_title, p_body,
    p_action_url, p_related_entity_type, p_related_entity_id
  );
end;
$$;

-- ─── Trigger: deal closed_won ────────────────────────────────────────────────

create or replace function public._notify_deal_closed_won()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if (TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and old.stage is distinct from new.stage))
     and new.stage = 'closed_won' then

    -- Notify all owners + admins
    for r in
      select id from public.profiles where role in ('owner','admin')
    loop
      perform public.send_staff_notification(
        r.id, 'sale_closed_won',
        'New Sale Closed 🎉',
        coalesce(new.client_name,'A deal') || ' closed by ' ||
          coalesce((select full_name from public.profiles where id = new.closer_id), 'a closer'),
        '/owner/sales/leads',
        'deal', new.id
      );
    end loop;

    -- Notify closer (confirmation)
    if new.closer_id is not null then
      perform public.send_staff_notification(
        new.closer_id, 'sale_closed_won',
        'Sale Confirmed ✅',
        'Your sale for ' || coalesce(new.client_name,'this client') || ' is confirmed closed!',
        '/owner/sales/leads',
        'deal', new.id
      );
    end if;

    -- Notify CPC (closure bonus)
    if new.cpc_id is not null then
      perform public.send_staff_notification(
        new.cpc_id, 'cpc_closure_bonus_earned',
        'Closure Bonus Earned 💰',
        coalesce(new.client_name,'A deal') || ' closed — your closure bonus is queued.',
        '/owner/money/commissions',
        'deal', new.id
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_deal_closed_won on public.deals;
create trigger trg_notify_deal_closed_won
  after insert or update of stage on public.deals
  for each row execute function public._notify_deal_closed_won();

-- ─── Trigger: setup fee cleared ──────────────────────────────────────────────

create or replace function public._notify_setup_fee_cleared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if (old.setup_fee_cleared is distinct from new.setup_fee_cleared)
     and new.setup_fee_cleared = true then

    for r in
      select distinct staff_id from public.commissions
      where deal_id = new.id and status = 'pending'
    loop
      perform public.send_staff_notification(
        r.staff_id, 'setup_fee_cleared',
        'Setup Fee Cleared 🎉',
        'Setup fee paid for ' || coalesce(new.client_name,'your client') || ' — commission unlocking.',
        '/owner/money/commissions',
        'deal', new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_setup_fee_cleared on public.deals;
create trigger trg_notify_setup_fee_cleared
  after update of setup_fee_cleared on public.deals
  for each row execute function public._notify_setup_fee_cleared();

-- ─── Trigger: CPC lead fee earned ────────────────────────────────────────────

create or replace function public._notify_cpc_lead_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.commission_type = 'cpc_lead_fee' then
    perform public.send_staff_notification(
      new.staff_id, 'cpc_lead_fee_earned',
      'Lead Fee Queued 💵',
      'Your lead fee for ' || coalesce(new.client_name,'a client') || ' is queued for approval.',
      '/owner/money/commissions',
      'commission', new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_cpc_lead_fee on public.commissions;
create trigger trg_notify_cpc_lead_fee
  after insert on public.commissions
  for each row execute function public._notify_cpc_lead_fee();

-- ─── flag_cold_leads() — call via pg_cron or Edge Function ───────────────────

create or replace function public.flag_cold_leads()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  cold_cutoff timestamptz := now() - interval '7 days';
begin
  for r in
    select d.id, d.client_name, d.closer_id, d.cpc_id, d.assigned_to
    from public.deals d
    where d.stage in ('new_lead','discovery_visit')
      and d.updated_at < cold_cutoff
      and (d.lead_temperature != 'cold' or d.cold_notified_at is null)
  loop
    update public.deals
    set lead_temperature = 'cold', cold_notified_at = now()
    where id = r.id;

    if r.closer_id is not null then
      perform public.send_staff_notification(
        r.closer_id, 'cold_lead',
        '❄️ Cold Lead Alert',
        coalesce(r.client_name,'A lead') || ' has gone cold — no update in 7 days.',
        '/owner/leads/my',
        'deal', r.id
      );
    end if;

    if r.cpc_id is not null and r.cpc_id is distinct from r.closer_id then
      perform public.send_staff_notification(
        r.cpc_id, 'cold_lead',
        '❄️ Cold Lead Alert',
        coalesce(r.client_name,'A lead') || ' has gone cold — no update in 7 days.',
        '/owner/leads/my',
        'deal', r.id
      );
    end if;

    if r.assigned_to is not null
       and r.assigned_to is distinct from r.closer_id
       and r.assigned_to is distinct from r.cpc_id then
      perform public.send_staff_notification(
        r.assigned_to, 'cold_lead',
        '❄️ Cold Lead Alert',
        coalesce(r.client_name,'A lead') || ' has gone cold — no update in 7 days.',
        '/owner/leads/my',
        'deal', r.id
      );
    end if;
  end loop;
end;
$$;

-- ─── mark_my_notifications_read(p_ids) ───────────────────────────────────────
-- p_ids = null  → mark ALL unread for calling user
-- p_ids = array → mark only those IDs (must belong to calling user)

create or replace function public.mark_my_notifications_read(
  p_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ids is null then
    update public.client_notifications
    set is_read = true, read_at = now()
    where recipient_user_id = auth.uid() and is_read = false;
  else
    update public.client_notifications
    set is_read = true, read_at = now()
    where recipient_user_id = auth.uid()
      and id = any(p_ids)
      and is_read = false;
  end if;
end;
$$;
