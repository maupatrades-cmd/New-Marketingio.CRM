-- Migration 94: dispute_invoice + request_subscription_cancel (Directive 18 Part 4-5)
--
-- Two client-side actions that previously had no path:
--   1. dispute_invoice(invoice_id, reason)      — flips status to disputed,
--      creates HIGH-priority coordinator task, notifies staff.
--   2. request_subscription_cancel(reason)      — creates URGENT task,
--      notifies staff. Does NOT auto-cancel — staff must confirm the
--      30-day notice window and final billing per contract.
--
-- Also expands the invoices_status_check constraint to include
-- 'disputed' and 'refunded' so the dispute path is legal.

alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status = any (array['draft'::text, 'sent'::text, 'paid'::text,
    'overdue'::text, 'failed'::text, 'cancelled'::text, 'partial'::text,
    'disputed'::text, 'refunded'::text]));

create or replace function public.dispute_invoice(p_invoice_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_client_id   uuid;
  v_client_name text;
  v_inv         invoices%rowtype;
  v_coord       uuid;
begin
  select cl.id, cl.business_name into v_client_id, v_client_name
  from clients cl where cl.client_user_id = auth.uid();
  if v_client_id is null then raise exception 'not_a_client'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'reason_required'; end if;

  select * into v_inv from invoices where id = p_invoice_id and client_id = v_client_id;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_inv.status in ('paid','cancelled') then raise exception 'cannot_dispute_paid_or_cancelled'; end if;

  update invoices set status = 'disputed', updated_at = now() where id = p_invoice_id;

  select user_id into v_coord from user_roles where is_coordinator = true limit 1;
  insert into tasks (
    title, description, assigned_to, created_by, priority, status,
    client_id, client_name, source_action, source_entity_type, source_entity_id
  ) values (
    '⚠️ Invoice dispute — ' || v_inv.invoice_number || ' · ' || v_client_name,
    'Client disputed invoice ' || v_inv.invoice_number ||
      ' (R' || v_inv.total_amount::text || ').' || E'\n\nReason: ' || p_reason,
    coalesce(v_coord, (select user_id from user_roles where role = 'owner' limit 1)),
    auth.uid(), 'high', 'pending', v_client_id, v_client_name,
    'invoice_dispute', 'invoice', p_invoice_id
  );

  perform _notify_staff(v_client_id, 'invoice_disputed',
    '⚠️ ' || v_client_name || ' disputed ' || v_inv.invoice_number,
    'Reason: ' || p_reason,
    '/owner/money/invoices?focus=' || p_invoice_id::text,
    'invoice', p_invoice_id
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dispute_invoice(uuid, text) from public, anon;
grant execute on function public.dispute_invoice(uuid, text) to authenticated;

create or replace function public.request_subscription_cancel(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_cid uuid; v_name text; v_coord uuid;
begin
  select id, business_name into v_cid, v_name from clients where client_user_id = auth.uid();
  if v_cid is null then raise exception 'not_a_client'; end if;

  select user_id into v_coord from user_roles where is_coordinator = true limit 1;
  insert into tasks (
    title, description, assigned_to, created_by, priority, status,
    client_id, client_name, source_action, source_entity_type, source_entity_id
  ) values (
    '🛑 Cancellation request — ' || v_name,
    'Client requested to cancel their subscription.' ||
      case when nullif(trim(coalesce(p_reason, '')), '') is not null then E'\n\nReason: ' || p_reason else '' end ||
      E'\n\nAction: Review contract notice period, confirm cancellation date, issue final invoice.',
    coalesce(v_coord, (select user_id from user_roles where role = 'owner' limit 1)),
    auth.uid(), 'urgent', 'pending', v_cid, v_name,
    'subscription_cancel_request', 'client', v_cid
  );

  perform _notify_staff(v_cid, 'cancel_request',
    '🛑 ' || v_name || ' wants to cancel',
    coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'No reason given'),
    '/owner/clients/' || v_cid::text,
    'client', v_cid
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.request_subscription_cancel(text) from public, anon;
grant execute on function public.request_subscription_cancel(text) to authenticated;
