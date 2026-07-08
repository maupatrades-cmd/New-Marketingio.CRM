-- 102_directive_21_schema_and_rpcs.sql
-- Directive 21 — schema + RPCs backing the client portal completion pass.
-- Renumbered from 100_* on 8 Jul 2026 to resolve a filename collision with
-- 100_my_business_toolkit.sql. Contents pulled from the live database via
-- pg_get_functiondef so the migration ships as the source of truth
-- (previously the file was a comment-only stub because the SQL had been
-- applied via mcp__Supabase__apply_migration and never checked in).

-- ============================================================================
-- 1. Schema — new columns on contracts + clients
-- ============================================================================

alter table public.contracts add column if not exists id_verified      boolean default false;
alter table public.contracts add column if not exists banking_captured boolean default false;
alter table public.contracts add column if not exists contract_name    text;

alter table public.clients add column if not exists security_question_1    text;
alter table public.clients add column if not exists security_answer_1_hash text;
alter table public.clients add column if not exists security_question_2    text;
alter table public.clients add column if not exists security_answer_2_hash text;

alter table public.clients add column if not exists trading_name        text;
alter table public.clients add column if not exists registration_number text;
alter table public.clients add column if not exists vat_number          text;
alter table public.clients add column if not exists employee_count      integer;
alter table public.clients add column if not exists years_in_business   integer;
alter table public.clients add column if not exists twitter_handle      text;

-- Backfill banking_captured from client_banking (best-effort).
update public.contracts c
   set banking_captured = true
 where banking_captured is not true
   and exists (select 1 from public.client_banking cb where cb.deal_id = c.deal_id);

-- ============================================================================
-- 2. get_client_dashboard — extended with deals_list
-- ============================================================================

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
    'deals_list', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'package', d.package, 'add_on_name', d.add_on_name,
        'deal_type', d.deal_type, 'stage', d.stage,
        'setup_fee', d.setup_fee, 'monthly_retainer', d.monthly_retainer,
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

-- ============================================================================
-- 3. get_my_contracts — verification-scanner fields
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_contracts()
 RETURNS TABLE(id uuid, status text, package text, document_url text, client_signed_at timestamp with time zone, mio_signed_at timestamp with time zone, popia_signed boolean, id_verified boolean, banking_captured boolean, add_on_name text, created_at timestamp with time zone, signing_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client_id uuid;
begin
  select cl.id into v_client_id from clients cl where cl.client_user_id = auth.uid();
  return query
  select c.id, c.status, d.package, c.document_url,
         c.client_signed_at, c.mio_signed_at,
         c.popia_signed, c.id_verified, c.banking_captured,
         d.add_on_name, c.created_at,
         case when c.signing_token is not null
                  and (c.signing_token_expires_at is null or c.signing_token_expires_at > now())
              then 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app/sign/' || c.signing_token
              else null end
  from contracts c join deals d on d.id = c.deal_id
  where d.client_id = v_client_id
  order by c.created_at desc;
end; $function$;

-- ============================================================================
-- 4. get_my_profile — expose industry / socials / business info + security-question status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cid uuid; v_r jsonb;
begin
  select id into v_cid from clients where client_user_id = auth.uid();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  select jsonb_build_object('ok', true,
    'client', (select jsonb_build_object(
      'id', c.id, 'business_name', c.business_name, 'contact_person', c.contact_person,
      'email', c.email, 'phone', c.phone, 'whatsapp_number', c.whatsapp_number,
      'website', c.website, 'address', c.address, 'logo_url', c.logo_url,
      'industry', c.industry,
      'brand_colors', c.brand_colors, 'brand_fonts', c.brand_fonts,
      'tone_of_voice', c.tone_of_voice, 'languages', c.languages,
      'words_to_avoid', c.words_to_avoid,
      'facebook_page_url', c.facebook_page_url, 'instagram_handle', c.instagram_handle,
      'tiktok_handle', c.tiktok_handle, 'google_account_email', c.google_account_email,
      'twitter_handle', c.twitter_handle,
      'trading_name', c.trading_name, 'registration_number', c.registration_number,
      'vat_number', c.vat_number,
      'employee_count', c.employee_count, 'years_in_business', c.years_in_business,
      'brand_assets_urls', c.brand_assets_urls,
      'security_question_1', c.security_question_1,
      'security_question_2', c.security_question_2,
      'security_questions_set', (c.security_answer_1_hash is not null),
      'created_at', c.created_at)
      from clients c where c.id = v_cid),
    'deal', (select jsonb_build_object('package', d.package, 'stage', d.stage)
      from deals d where d.id = _pick_best_deal(v_cid)),
    'preferences', (select row_to_json(np)::jsonb from notification_preferences np where np.user_id = auth.uid())
  ) into v_r;
  return v_r;
end; $function$;

-- ============================================================================
-- 5. client_self_update — whitelist expanded to Directive 21 fields
-- ============================================================================

CREATE OR REPLACE FUNCTION public.client_self_update(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_client_id     uuid;
  v_deal_id       uuid;
  v_existing_disc jsonb;
  v_new_disc      jsonb;
  v_client_keys   text[] := array[
    'business_name','contact_person','phone','whatsapp_number',
    'website','address','industry','gmaps_url','socials','logo_url',
    'brand_colors','brand_fonts','tone_of_voice','languages',
    'words_to_avoid','posting_preference','google_account_email',
    'facebook_page_url','instagram_handle','tiktok_handle','twitter_handle',
    'preferred_call_time','onboarding_notes','brand_assets_urls',
    'trading_name','registration_number','vat_number',
    'employee_count','years_in_business'
  ];
  v_disc_keys     text[] := array[
    'biz_does','ideal_customer','goal','differentiator','brand_ready',
    'location','avoid','socials_existing','how_found','competitor',
    'busy_times','price_range','biz_whatsapp'
  ];
  v_client_patch  jsonb := '{}'::jsonb;
  v_disc_patch    jsonb := '{}'::jsonb;
  v_k             text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into v_client_id from public.clients where client_user_id = auth.uid() limit 1;
  if v_client_id is null then raise exception 'no_client_for_user'; end if;

  foreach v_k in array v_client_keys loop
    if p_payload ? v_k then v_client_patch := v_client_patch || jsonb_build_object(v_k, p_payload->v_k); end if;
  end loop;

  if p_payload ? 'discovery' and jsonb_typeof(p_payload->'discovery') = 'object' then
    foreach v_k in array v_disc_keys loop
      if (p_payload->'discovery') ? v_k then
        v_disc_patch := v_disc_patch || jsonb_build_object(v_k, (p_payload->'discovery')->v_k);
      end if;
    end loop;
  end if;

  if v_client_patch <> '{}'::jsonb then
    update public.clients c
       set business_name    = coalesce(v_client_patch->>'business_name',    c.business_name),
           contact_person   = coalesce(v_client_patch->>'contact_person',   c.contact_person),
           phone            = coalesce(v_client_patch->>'phone',            c.phone),
           whatsapp_number  = coalesce(v_client_patch->>'whatsapp_number',  c.whatsapp_number),
           website          = coalesce(v_client_patch->>'website',          c.website),
           address          = coalesce(v_client_patch->>'address',          c.address),
           industry         = coalesce(v_client_patch->>'industry',         c.industry),
           gmaps_url        = coalesce(v_client_patch->>'gmaps_url',        c.gmaps_url),
           logo_url         = coalesce(v_client_patch->>'logo_url',         c.logo_url),
           socials          = coalesce(v_client_patch->'socials',           c.socials),
           brand_colors     = coalesce(v_client_patch->>'brand_colors',     c.brand_colors),
           brand_fonts      = coalesce(v_client_patch->>'brand_fonts',      c.brand_fonts),
           tone_of_voice    = coalesce(v_client_patch->>'tone_of_voice',    c.tone_of_voice),
           languages        = coalesce(v_client_patch->>'languages',        c.languages),
           words_to_avoid   = coalesce(v_client_patch->>'words_to_avoid',   c.words_to_avoid),
           posting_preference = coalesce(v_client_patch->>'posting_preference', c.posting_preference),
           google_account_email = coalesce(v_client_patch->>'google_account_email', c.google_account_email),
           facebook_page_url = coalesce(v_client_patch->>'facebook_page_url', c.facebook_page_url),
           instagram_handle = coalesce(v_client_patch->>'instagram_handle', c.instagram_handle),
           tiktok_handle    = coalesce(v_client_patch->>'tiktok_handle',    c.tiktok_handle),
           twitter_handle   = coalesce(v_client_patch->>'twitter_handle',   c.twitter_handle),
           preferred_call_time = coalesce(v_client_patch->>'preferred_call_time', c.preferred_call_time),
           onboarding_notes = coalesce(v_client_patch->>'onboarding_notes', c.onboarding_notes),
           brand_assets_urls = coalesce(v_client_patch->'brand_assets_urls', c.brand_assets_urls),
           trading_name     = coalesce(v_client_patch->>'trading_name',     c.trading_name),
           registration_number = coalesce(v_client_patch->>'registration_number', c.registration_number),
           vat_number       = coalesce(v_client_patch->>'vat_number',       c.vat_number),
           employee_count   = coalesce((v_client_patch->>'employee_count')::integer, c.employee_count),
           years_in_business = coalesce((v_client_patch->>'years_in_business')::integer, c.years_in_business),
           updated_at       = now()
     where c.id = v_client_id;
  end if;

  if v_disc_patch <> '{}'::jsonb then
    select id, coalesce(discovery, '{}'::jsonb)
      into v_deal_id, v_existing_disc
      from public.deals
     where client_id = v_client_id
     order by (stage = 'closed_won') desc, created_at desc
     limit 1;
    if v_deal_id is not null then
      v_new_disc := v_existing_disc || v_disc_patch;
      update public.deals set discovery = v_new_disc, updated_at = now() where id = v_deal_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'client_id', v_client_id, 'deal_id', v_deal_id,
    'client_keys', (select array_agg(key) from jsonb_object_keys(v_client_patch) as t(key)),
    'disc_keys',   (select array_agg(key) from jsonb_object_keys(v_disc_patch)   as t(key))
  );
end $function$;

-- ============================================================================
-- 6. get_my_billing — powers the three-tab Billing page
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_billing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cid uuid; v_deal_id uuid; v_debit_day int; v_result jsonb;
begin
  select cl.id into v_cid from clients cl where cl.client_user_id = auth.uid();
  if v_cid is null then raise exception 'not_a_client'; end if;
  v_deal_id := _pick_best_deal(v_cid);
  select coalesce(nullif(mandate_debit_day, '')::int, null) into v_debit_day
    from clients where id = v_cid;
  select jsonb_build_object(
    'overview', jsonb_build_object(
      'monthly_retainer', (select coalesce(monthly_retainer, 0) from deals where id = v_deal_id),
      'debit_day', v_debit_day,
      'total_paid', (select coalesce(sum(total_amount), 0) from invoices where client_id = v_cid and status = 'paid'),
      'total_outstanding', (select coalesce(sum(total_amount), 0) from invoices where client_id = v_cid and status in ('issued','sent','overdue'))
    ),
    'payment_history', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'invoice_number', i.invoice_number, 'description', i.description,
      'total_amount', i.total_amount, 'status', i.status, 'invoice_type', i.invoice_type,
      'issue_date', i.issue_date, 'due_date', i.due_date, 'payment_date', i.payment_date,
      'payment_method', i.payment_method
    ) order by i.created_at desc), '[]'::jsonb)
      from invoices i where i.client_id = v_cid),
    'bank', (select jsonb_build_object(
      'bank_name', b.bank_name,
      'account_holder', b.account_holder_name,
      'account_type', b.account_type,
      'branch_code', b.branch_code,
      'verification_status', b.verification_status,
      'account_masked', '****' || right(coalesce(b.account_number_enc::text, '  '), 4),
      'mandate_signed', (select mandate_authorized_at is not null from clients where id = v_cid),
      'mandate_date', (select mandate_authorized_at from clients where id = v_cid)
    ) from client_banking b where b.client_id = v_cid order by b.updated_at desc, b.captured_at desc limit 1)
  ) into v_result;
  return v_result;
end $function$;

-- ============================================================================
-- 7. update_my_security_questions — bcrypt-hashed answers via pgcrypto
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_my_security_questions(p_q1 text, p_a1 text, p_q2 text DEFAULT NULL::text, p_a2 text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_cid uuid;
begin
  select id into v_cid from clients where client_user_id = auth.uid();
  if v_cid is null then raise exception 'not_a_client'; end if;
  if p_q1 is null or length(trim(p_a1)) = 0 then raise exception 'question_1_required'; end if;
  update clients set
    security_question_1  = p_q1,
    security_answer_1_hash = crypt(lower(trim(p_a1)), gen_salt('bf', 8)),
    security_question_2  = p_q2,
    security_answer_2_hash = case
      when p_q2 is not null and length(trim(coalesce(p_a2,''))) > 0
      then crypt(lower(trim(p_a2)), gen_salt('bf', 8))
      else null end,
    updated_at = now()
   where id = v_cid;
  return jsonb_build_object('ok', true);
end $function$;

-- ============================================================================
-- Grants
-- ============================================================================

revoke all on function public.get_client_dashboard()             from public, anon;
revoke all on function public.get_my_contracts()                 from public, anon;
revoke all on function public.get_my_profile()                   from public, anon;
revoke all on function public.client_self_update(jsonb)          from public, anon;
revoke all on function public.get_my_billing()                   from public, anon;
revoke all on function public.update_my_security_questions(text, text, text, text) from public, anon;

grant execute on function public.get_client_dashboard()             to authenticated;
grant execute on function public.get_my_contracts()                 to authenticated;
grant execute on function public.get_my_profile()                   to authenticated;
grant execute on function public.client_self_update(jsonb)          to authenticated;
grant execute on function public.get_my_billing()                   to authenticated;
grant execute on function public.update_my_security_questions(text, text, text, text) to authenticated;
