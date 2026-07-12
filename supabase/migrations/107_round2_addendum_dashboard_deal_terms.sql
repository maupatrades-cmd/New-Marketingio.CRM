-- Migration 107: Round 2 addendum — extend get_client_dashboard.deals_list
-- with contract_term_months + add_on_code.
--
-- ClientProducts.jsx now decides whether a purchased item can be
-- re-ordered by comparing the deal's created_at against a cooldown
-- window derived from contract_term_months (falls back to 30 days for
-- once-off / termless deals). Without those two extra fields exposed
-- the frontend has to guess, so it either greys out forever or lets
-- a client double-buy an active service. Add both fields so the UI
-- can compute expiry deterministically.
--
-- add_on_code lets the frontend match a deal to a catalog product by
-- code (the canonical join key) instead of slugging the display name.
--
-- This is a CREATE OR REPLACE — the rest of the function body is
-- copied verbatim from migration 102 so behaviour for every other key
-- is unchanged.

CREATE OR REPLACE FUNCTION public.get_client_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      from deliverables d where d.client_id = v_cid and d.status not in ('blocked','not_started')),
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
    -- deals_list — NEW fields: add_on_code (canonical catalog key) and
    -- contract_term_months (drives the re-order cooldown window).
    'deals_list', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'package', d.package, 'add_on_name', d.add_on_name,
        'add_on_code', d.add_on_code,
        'deal_type', d.deal_type, 'stage', d.stage,
        'setup_fee', d.setup_fee, 'monthly_retainer', d.monthly_retainer,
        'contract_term_months', d.contract_term_months,
        'is_upsell', d.is_upsell, 'source', d.source,
        'created_at', d.created_at)), '[]'::jsonb)
      from deals d where d.client_id = v_cid and d.stage not in ('closed_lost','cancelled')),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'role', t.role) order by t.ord), '[]'::jsonb)
      from (
        (select dl.closer_name as name, 'Your Sales Consultant' as role, 1 as ord from deals dl where dl.client_id = v_cid and dl.closer_name is not null order by dl.created_at desc limit 1)
        union all
        (select p.full_name, 'Your Account Coordinator', 2 from user_roles ur join profiles p on p.id = ur.user_id where ur.is_coordinator = true and p.full_name is not null limit 1)
      ) t)
  ) into v_r;
  return v_r;
end; $function$;
