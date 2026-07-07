-- Migration 93: Parallel-flow notification bridge (Directive 18 Part 1 & 2)
--
-- The client portal and the staff console were two silos. Actions on
-- one side never surfaced on the other. This migration wires the
-- shared client_notifications table (which already carries recipient_user_id)
-- into every cross-side event via two SECURITY DEFINER helpers plus
-- five triggers.
--
-- What ships
--   Helpers
--     _notify_client(client_id, type, title, body, action_url, entity_type, entity_id)
--     _notify_staff (client_id, type, title, body, action_url, entity_type, entity_id, specific_staff_id?)
--   Triggers
--     trg_invoice_notify           (invoices)      — issued / overdue / paid (client + staff on paid)
--     trg_deliverable_notify_client(deliverables)  — status transitions
--     trg_contract_notify          (contracts)     — sent + client_signed
--     trg_client_assets_uploaded   (clients)       — brand_assets_urls growth → staff + trigger flip + GO LIVE task
--     trg_report_notify_client     (monthly_reports) — delivered
--
--   send_client_message already notifies staff (verified in place) so
--   no separate 2.6 trigger — skipping to avoid double-fire.
--
-- Ancillary
--   get_client_dashboard rewritten to use _pick_best_deal() for its
--   `deal` field. SHOE FIT has an Accelerate deal AND a later add_on
--   deal with package='none'; ORDER BY created_at DESC picked the
--   add-on, showing "Upgrade to Accelerate" for a client on Accelerate.
--   _pick_best_deal already prefers deals with real packages over
--   'none' — this migration just wires it in.

-- ══════════════════════════════════════════════════════════════════════
-- 1. HELPERS
-- ══════════════════════════════════════════════════════════════════════

create or replace function public._notify_client(
  p_client_id           uuid,
  p_type                text,
  p_title               text,
  p_body                text default null,
  p_action_url          text default null,
  p_related_entity_type text default null,
  p_related_entity_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_user_id uuid;
  v_notif_id       uuid;
begin
  select client_user_id into v_client_user_id from clients where id = p_client_id;
  -- No auth user → nothing to notify. Silent no-op keeps triggers from
  -- crashing when a client hasn't been provisioned yet.
  if v_client_user_id is null then return null; end if;

  insert into client_notifications (
    client_id, recipient_user_id, notification_type, title, body,
    action_url, related_entity_type, related_entity_id, is_read
  ) values (
    p_client_id, v_client_user_id, p_type, p_title, p_body,
    p_action_url, p_related_entity_type, p_related_entity_id, false
  ) returning id into v_notif_id;

  return v_notif_id;
end;
$$;

create or replace function public._notify_staff(
  p_client_id           uuid,
  p_type                text,
  p_title               text,
  p_body                text default null,
  p_action_url          text default null,
  p_related_entity_type text default null,
  p_related_entity_id   uuid default null,
  p_specific_staff_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recipient uuid;
begin
  if p_specific_staff_id is not null then
    v_recipient := p_specific_staff_id;
  else
    -- Cascade: assigned field agent → deal closer → coordinator → owner
    select coalesce(
      c.assigned_field_agent,
      (select closer_id from deals where client_id = p_client_id and stage not in ('closed_lost','cancelled') order by created_at desc limit 1),
      (select user_id from user_roles where is_coordinator = true limit 1),
      (select user_id from user_roles where role = 'owner' limit 1)
    ) into v_recipient from clients c where c.id = p_client_id;
  end if;

  if v_recipient is null then return; end if;

  insert into client_notifications (
    client_id, recipient_user_id, notification_type, title, body,
    action_url, related_entity_type, related_entity_id, is_read
  ) values (
    p_client_id, v_recipient, p_type, p_title, p_body,
    p_action_url, p_related_entity_type, p_related_entity_id, false
  );

  -- Owner sees everything — mirror to owner unless the primary recipient
  -- IS the owner. Uses ON CONFLICT DO NOTHING via a WHERE NOT EXISTS
  -- pattern to keep the double-insert from breaking if the owner row
  -- ends up matching for any reason.
  if not exists (select 1 from user_roles where user_id = v_recipient and role = 'owner') then
    insert into client_notifications (
      client_id, recipient_user_id, notification_type, title, body,
      action_url, related_entity_type, related_entity_id, is_read
    )
    select
      p_client_id, ur.user_id, p_type, p_title, p_body,
      p_action_url, p_related_entity_type, p_related_entity_id, false
    from user_roles ur
    where ur.role = 'owner'
    limit 1;
  end if;
end;
$$;

revoke all on function public._notify_client(uuid, text, text, text, text, text, uuid) from public, anon;
revoke all on function public._notify_staff(uuid, text, text, text, text, text, uuid, uuid) from public, anon;

-- ══════════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ══════════════════════════════════════════════════════════════════════

-- 2.1 Invoice lifecycle -----------------------------------------------------
create or replace function public.trg_notify_client_invoice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Issued / sent → client
  if new.status in ('sent') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform _notify_client(
      new.client_id,
      'invoice_issued',
      '💰 Invoice ' || coalesce(new.invoice_number, new.id::text) || ' issued — R' || new.total_amount::text,
      'Due by ' || to_char(new.due_date, 'DD Mon YYYY') || '. Tap to view and pay.',
      '/client/invoices/' || new.id::text,
      'invoice', new.id
    );
  end if;

  -- Overdue → client
  if new.status = 'overdue' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform _notify_client(
      new.client_id,
      'invoice_overdue_client',
      '⚠️ Invoice ' || coalesce(new.invoice_number, new.id::text) || ' is overdue',
      'R' || new.total_amount::text || ' was due on ' || to_char(new.due_date, 'DD Mon YYYY') || '. Please settle to avoid service interruption.',
      '/client/invoices/' || new.id::text,
      'invoice', new.id
    );
  end if;

  -- Paid → client (receipt) + staff (heads-up)
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform _notify_client(
      new.client_id,
      'payment_received',
      '✅ Payment received — ' || coalesce(new.invoice_number, new.id::text),
      'R' || new.total_amount::text || ' has been received. Thank you!',
      '/client/invoices/' || new.id::text,
      'invoice', new.id
    );
    perform _notify_staff(
      new.client_id,
      'invoice_paid_by_client',
      '💰 ' || coalesce(new.client_name, 'Client') || ' paid ' || coalesce(new.invoice_number, new.id::text),
      'R' || new.total_amount::text || ' received.',
      '/owner/money/invoices?focus=' || new.id::text,
      'invoice', new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoice_notify on invoices;
create trigger trg_invoice_notify
  after insert or update of status on invoices
  for each row execute function trg_notify_client_invoice();

-- 2.2 Deliverable status transitions ---------------------------------------
-- Deliverables use different status values than the directive's draft:
--   not_started, in_progress, awaiting_client, client_reviewing, approved,
--   deemed_approved, completed, blocked, client_requested_changes, client_rejected
-- Copy is mapped to the real values below.
create or replace function public.trg_notify_client_deliverable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_title text;
  v_body  text;
begin
  if old.status = new.status then return new; end if;
  if new.client_id is null then return new; end if;

  case new.status
    when 'in_progress'            then v_title := '🚧 Work started';           v_body := 'Work has started on "' || coalesce(new.title, 'your deliverable') || '"';
    when 'awaiting_client'        then v_title := '📦 Ready for review!';       v_body := '"' || coalesce(new.title, 'A deliverable') || '" is ready for your review.';
    when 'client_reviewing'       then v_title := '📦 Ready for review!';       v_body := '"' || coalesce(new.title, 'A deliverable') || '" is ready for your review.';
    when 'approved'               then v_title := '✅ Deliverable approved';    v_body := '"' || coalesce(new.title, 'The deliverable') || '" has been approved.';
    when 'deemed_approved'        then v_title := '✅ Deliverable approved';    v_body := '"' || coalesce(new.title, 'The deliverable') || '" is now approved.';
    when 'completed'              then v_title := '🎉 Deliverable complete!';   v_body := '"' || coalesce(new.title, 'The deliverable') || '" has been delivered!';
    when 'client_requested_changes' then v_title := '📝 Changes requested';    v_body := 'We noted your changes on "' || coalesce(new.title, 'the deliverable') || '".';
    when 'client_rejected'        then v_title := '📝 Changes requested';      v_body := 'We noted your rejection of "' || coalesce(new.title, 'the deliverable') || '".';
    when 'blocked'                then return new;   -- internal state — don't spam
    when 'not_started'            then return new;   -- internal state — don't spam
    else v_title := '📦 Deliverable update';          v_body := '"' || coalesce(new.title, 'A deliverable') || '" status is now ' || new.status;
  end case;

  perform _notify_client(
    new.client_id,
    'deliverable_' || new.status,
    v_title,
    v_body,
    '/client/deliverables/' || new.id::text,
    'deliverable', new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_deliverable_notify_client on deliverables;
create trigger trg_deliverable_notify_client
  after update of status on deliverables
  for each row execute function trg_notify_client_deliverable();

-- 2.3 Contract sent / signed ------------------------------------------------
create or replace function public.trg_notify_client_contract()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_id   uuid;
  v_client_name text;
  v_package     text;
begin
  -- Resolve client via deals
  select d.client_id, d.client_name, coalesce(new.package, d.package)
    into v_client_id, v_client_name, v_package
  from deals d
  where d.id = new.deal_id;

  if v_client_id is null then return new; end if;

  -- Sent → client
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform _notify_client(
      v_client_id,
      'contract_ready',
      '📝 Your contract is ready to sign',
      case when v_package is not null then 'Review and sign your ' || v_package || ' agreement.' else 'Review and sign your Marketing iO agreement.' end,
      '/client/contracts/' || new.id::text,
      'contract', new.id
    );
  end if;

  -- Client signed → staff
  if new.signing_status = 'client_signed'
     and (tg_op = 'INSERT' or old.signing_status is distinct from new.signing_status)
  then
    perform _notify_staff(
      v_client_id,
      'contract_signed_by_client',
      '🎉 ' || coalesce(v_client_name, 'Client') || ' signed their contract!',
      case when new.client_signed_at is not null
           then 'Signed at ' || to_char(new.client_signed_at, 'DD Mon YYYY HH24:MI') || '. Ready for owner approval.'
           else 'Ready for owner approval.' end,
      '/owner/contracts?focus=' || new.id::text,
      'contract', new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_contract_notify on contracts;
create trigger trg_contract_notify
  after insert or update of status, signing_status on contracts
  for each row execute function trg_notify_client_contract();

-- 2.4 Brand-asset upload → staff + auto-trigger flip + GO LIVE --------------
create or replace function public.trg_notify_staff_assets_uploaded()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old_count int;
  v_new_count int;
  v_all_green boolean;
begin
  v_old_count := jsonb_array_length(coalesce(old.brand_assets_urls, '[]'::jsonb));
  v_new_count := jsonb_array_length(coalesce(new.brand_assets_urls, '[]'::jsonb));

  if v_new_count <= v_old_count then return new; end if;

  -- Staff notification
  perform _notify_staff(
    new.id,
    'assets_uploaded',
    '📁 ' || coalesce(new.business_name, 'Client') || ' uploaded ' || (v_new_count - v_old_count) || ' brand file(s)',
    'Review the uploaded assets and confirm they are usable for production.',
    '/owner/clients/' || new.id::text,
    'client', new.id
  );

  -- Auto-flip the brand_assets_received trigger
  update client_onboarding
     set trigger_brand_assets_received      = true,
         trigger_brand_assets_received_date = current_date,
         updated_at                         = now()
   where client_id = new.id
     and trigger_brand_assets_received = false;

  -- All four green → GO LIVE task
  select exists (
    select 1 from client_onboarding
     where client_id = new.id
       and trigger_setup_fee_paid           = true
       and trigger_onboarding_form_returned = true
       and trigger_debit_mandate_signed     = true
       and trigger_brand_assets_received    = true
       and overall_status is distinct from 'complete'
  ) into v_all_green;

  if v_all_green then
    update client_onboarding
       set overall_status = 'complete',
           current_phase  = 'go_live',
           completed_at   = now(),
           updated_at     = now()
     where client_id = new.id;

    insert into tasks (
      title, description, assigned_to, created_by, priority, status,
      client_id, client_name, source_action, source_entity_type, source_entity_id
    ) values (
      '🚀 GO LIVE — ' || coalesce(new.business_name, 'Client'),
      'All 4 onboarding triggers are green. Begin deliverable production.',
      (select user_id from user_roles where is_coordinator = true limit 1),
      (select user_id from user_roles where role = 'owner' limit 1),
      'urgent', 'pending',
      new.id, new.business_name,
      'onboarding_complete', 'client', new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_client_assets_uploaded on clients;
create trigger trg_client_assets_uploaded
  after update of brand_assets_urls on clients
  for each row execute function trg_notify_staff_assets_uploaded();

-- 2.5 Monthly report delivered → client -------------------------------------
create or replace function public.trg_notify_client_report()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'delivered'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform _notify_client(
      new.client_id,
      'report_ready',
      '📊 Your ' || coalesce(new.report_month, 'monthly') || ' report is ready',
      'View your marketing performance summary and insights.',
      '/client/reports/' || new.id::text,
      'monthly_report', new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_report_notify_client on monthly_reports;
create trigger trg_report_notify_client
  after insert or update of status on monthly_reports
  for each row execute function trg_notify_client_report();

-- ══════════════════════════════════════════════════════════════════════
-- 3. get_client_dashboard — use _pick_best_deal for the deal field
-- ══════════════════════════════════════════════════════════════════════
-- Only the `deal` subquery changes (from ORDER BY created_at DESC LIMIT 1
-- to WHERE id = _pick_best_deal(v_cid)). Everything else preserved verbatim.

create or replace function public.get_client_dashboard()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cid uuid; v_r jsonb;
begin
  select id into v_cid from clients where client_user_id = auth.uid();
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'not_a_client'); end if;

  select jsonb_build_object('ok', true,
    'client', (select jsonb_build_object('id', id, 'business_name', business_name, 'contact_person', contact_person, 'logo_url', logo_url, 'has_seen_welcome', has_seen_welcome, 'phone', phone, 'email', email, 'address', address, 'industry', industry, 'status', status) from clients where id = v_cid),
    'deal', (select jsonb_build_object('id', id, 'package', package, 'stage', stage, 'setup_fee', setup_fee, 'monthly_retainer', monthly_retainer, 'add_on_name', add_on_name) from deals where id = _pick_best_deal(v_cid)),
    'contract', (select jsonb_build_object('id', c.id, 'status', c.status, 'document_url', c.document_url, 'client_signed_at', c.client_signed_at,
      'signing_url', case when c.signing_token is not null and c.signing_token_expires_at > now()
        then 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app/sign/' || c.signing_token else null end)
      from contracts c join deals d on d.id = c.deal_id where d.client_id = v_cid order by c.created_at desc limit 1),
    'onboarding', (select jsonb_build_object('id', id, 'overall_status', overall_status, 'onboarding_token', onboarding_token, 'current_phase', current_phase,
      'setup_fee_paid', trigger_setup_fee_paid, 'form_returned', trigger_onboarding_form_returned,
      'mandate_signed', trigger_debit_mandate_signed, 'assets_received', trigger_brand_assets_received,
      'triggers_done', (case when trigger_setup_fee_paid then 1 else 0 end + case when trigger_onboarding_form_returned then 1 else 0 end + case when trigger_debit_mandate_signed then 1 else 0 end + case when trigger_brand_assets_received then 1 else 0 end))
      from client_onboarding where client_id = v_cid order by created_at desc limit 1),
    'outstanding_invoices', (select count(*) from invoices where client_id = v_cid and status in ('issued','overdue','sent')),
    'outstanding_amount', (select coalesce(sum(total_amount), 0) from invoices where client_id = v_cid and status in ('issued','overdue','sent')),
    'overdue_invoices', (select count(*) from invoices where client_id = v_cid and status = 'overdue'),
    'active_deliverables', (select count(*) from deliverables where client_id = v_cid and status not in ('completed','cancelled','approved','deemed_approved')),
    'recent_notifications', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'type', n.notification_type, 'is_read', n.is_read, 'action_url', n.action_url, 'created_at', n.created_at) order by n.created_at desc), '[]'::jsonb) from (select * from client_notifications where client_id = v_cid and recipient_user_id = auth.uid() order by created_at desc limit 5) n),
    'unread_count', (select count(*) from client_notifications where client_id = v_cid and recipient_user_id = auth.uid() and is_read = false),
    'unpaid_invoices', (select count(*) from invoices where client_id = v_cid and status in ('issued','overdue')),
    'unread_messages', (select count(*) from client_messages where client_id = v_cid and is_from_client = false and is_read = false),
    'unread_activity', (select count(*) from client_notifications where client_id = v_cid and recipient_user_id = auth.uid() and is_read = false),
    'deliverables_list', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'status', d.status, 'due_date', d.due_date,
        'file_urls', to_jsonb(d.file_urls), 'product', d.product) order by d.due_date asc nulls last), '[]'::jsonb)
      from deliverables d where d.client_id = v_cid and d.status not in ('cancelled')),
    'invoices_list', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'invoice_number', i.invoice_number, 'total_amount', i.total_amount,
        'due_date', i.due_date, 'status', i.status) order by i.due_date asc), '[]'::jsonb)
      from invoices i where i.client_id = v_cid and i.status in ('issued','overdue','sent')),
    'contracts_list', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'status', c.status, 'package', dl.package, 'document_url', c.document_url,
        'client_signed_at', c.client_signed_at,
        'signing_url', case when c.signing_token is not null and c.signing_token_expires_at > now()
          then 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app/sign/' || c.signing_token else null end)
        order by c.created_at desc), '[]'::jsonb)
      from contracts c join deals dl on dl.id = c.deal_id where dl.client_id = v_cid),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'role', t.role) order by t.ord), '[]'::jsonb)
      from (
        (select dl.closer_name as name, 'Your Sales Consultant' as role, 1 as ord from deals dl where dl.client_id = v_cid and dl.closer_name is not null order by dl.created_at desc limit 1)
        union all
        (select p.full_name, 'Your Account Coordinator', 2 from user_roles ur join profiles p on p.id = ur.user_id where ur.is_coordinator = true and p.full_name is not null limit 1)
      ) t)
  ) into v_r;
  return v_r;
end; $function$;
