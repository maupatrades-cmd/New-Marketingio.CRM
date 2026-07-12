-- Migration 76: Contracts Full UI RPCs (Directive 11)
-- Creates all RPCs needed for the contracts management UI

-- ============================================================
-- 1. get_contracts_list
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_contracts_list(
  p_status text DEFAULT 'all',
  p_limit  int  DEFAULT 100
)
RETURNS TABLE (
  id                  uuid,
  deal_id             uuid,
  client_name         text,
  package             text,
  setup_fee           numeric,
  monthly_retainer    numeric,
  status              text,
  arrears_state       text,
  contract_version    text,
  document_url        text,
  created_at          timestamptz,
  client_signed_at    timestamptz,
  mio_signed_at       timestamptz,
  resend_count        int,
  has_sales_checklist bool,
  has_admin_checklist bool,
  open_mismatch_count int,
  closer_name         text,
  days_in_state       int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (_is_owner(auth.uid()) OR _is_coordinator(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.deal_id,
    c.client_name,
    c.package,
    c.setup_fee,
    c.monthly_retainer,
    c.status,
    c.arrears_state,
    c.contract_version,
    c.document_url,
    c.created_at,
    c.client_signed_at,
    c.mio_signed_at,
    c.resend_count,
    (ccs.id IS NOT NULL)                         AS has_sales_checklist,
    (cca.id IS NOT NULL)                         AS has_admin_checklist,
    COALESCE(mc.open_count, 0)::int              AS open_mismatch_count,
    d.closer_name,
    EXTRACT(DAY FROM now() - c.updated_at)::int  AS days_in_state
  FROM contracts c
  LEFT JOIN deals d ON d.id = c.deal_id
  LEFT JOIN contract_checklist_sales ccs ON ccs.contract_id = c.id
  LEFT JOIN contract_checklist_admin cca ON cca.contract_id = c.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS open_count
    FROM lead_tickets lt
    WHERE lt.ticket_type_code = 'contract_mismatch'
      AND lt.related_deal_id  = c.deal_id
      AND lt.status           = 'open'
  ) mc ON true
  WHERE
    CASE p_status
      WHEN 'draft'     THEN c.status IN ('draft', 'generated')
      WHEN 'sent'      THEN c.status = 'sent' AND c.client_signed_at IS NULL
      WHEN 'active'    THEN c.status IN ('fully_executed', 'active')
      WHEN 'cancelled' THEN c.status = 'cancelled'
      WHEN 'arrears'   THEN c.arrears_state IS NOT NULL
      ELSE true  -- 'all'
    END
  ORDER BY c.updated_at DESC
  LIMIT p_limit;
END;
$$;


-- ============================================================
-- 2. get_contract_detail
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_contract_detail(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (_is_owner(auth.uid()) OR _is_coordinator(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'contract',   to_jsonb(c),
    'deal',       to_jsonb(d),
    'sales_checklist', to_jsonb(ccs),
    'admin_checklist', to_jsonb(cca),
    'signatures', (
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.signed_at)
      FROM contract_signatures s
      WHERE s.contract_id = c.id
    ),
    'initials', (
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.initialled_at)
      FROM contract_initials i
      WHERE i.contract_id = c.id
    )
  )
  INTO v_result
  FROM contracts c
  LEFT JOIN deals d ON d.id = c.deal_id
  LEFT JOIN contract_checklist_sales ccs ON ccs.contract_id = c.id
  LEFT JOIN contract_checklist_admin cca ON cca.contract_id = c.id
  WHERE c.id = p_contract_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  RETURN v_result;
END;
$$;


-- ============================================================
-- 3. send_contract_for_signing
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_contract_for_signing(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
  v_url   text;
BEGIN
  IF NOT (_is_owner(auth.uid()) OR _is_coordinator(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_token := gen_random_uuid()::text;

  UPDATE contracts
  SET
    signing_token            = v_token,
    signing_token_expires_at = now() + interval '7 days',
    status                   = 'sent',
    signing_status           = 'pending',
    updated_at               = now()
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Construct a generic signing URL; the frontend may override the base URL
  v_url := '/sign/' || v_token;

  RETURN jsonb_build_object(
    'ok',           true,
    'signing_token', v_token,
    'signing_url',   v_url
  );
END;
$$;


-- ============================================================
-- 4. resend_contract
-- ============================================================
CREATE OR REPLACE FUNCTION public.resend_contract(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expires_at timestamptz;
  v_token      text;
BEGIN
  IF NOT (_is_owner(auth.uid()) OR _is_coordinator(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT signing_token_expires_at, signing_token
  INTO   v_expires_at, v_token
  FROM   contracts
  WHERE  id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Regenerate token if expired or missing
  IF v_expires_at IS NULL OR v_expires_at <= now() THEN
    v_token := gen_random_uuid()::text;
  END IF;

  UPDATE contracts
  SET
    resend_count                 = COALESCE(resend_count, 0) + 1,
    signing_token                = v_token,
    signing_token_expires_at     = now() + interval '7 days',
    last_signature_email_sent_at = now(),
    updated_at                   = now()
  WHERE id = p_contract_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ============================================================
-- 5. submit_sales_checklist
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_sales_checklist(
  p_contract_id uuid,
  p_items       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deal        deals%ROWTYPE;
  v_contract    contracts%ROWTYPE;
  v_coord_id    uuid;
  v_key         text;
  v_item_count  int := 0;
BEGIN
  -- Load contract
  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  -- Load deal
  SELECT * INTO v_deal FROM deals WHERE id = v_contract.deal_id;

  -- Only the closer or an owner may submit
  IF NOT (
    _is_owner(auth.uid())
    OR (v_deal.closer_id IS NOT NULL AND v_deal.closer_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied: only the closer or owner may submit the sales checklist';
  END IF;

  -- Validate: all items in the object must have explained=true
  -- p_items is { key: { explained: true, notes: '' }, ... }
  FOR v_key IN SELECT jsonb_object_keys(p_items)
  LOOP
    v_item_count := v_item_count + 1;
    IF (p_items->v_key->>'explained')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'All checklist items must have explained=true (% failed)', v_key;
    END IF;
  END LOOP;

  IF v_item_count < 14 THEN
    RAISE EXCEPTION 'Expected 14 checklist items, got %', v_item_count;
  END IF;

  -- Upsert checklist row
  INSERT INTO contract_checklist_sales (contract_id, completed_by, completed_at, completed_ip, items)
  VALUES (p_contract_id, auth.uid(), now(), inet_client_addr(), p_items)
  ON CONFLICT (contract_id) DO UPDATE
    SET completed_by = EXCLUDED.completed_by,
        completed_at = EXCLUDED.completed_at,
        completed_ip = EXCLUDED.completed_ip,
        items        = EXCLUDED.items;

  -- Find coordinator to assign task
  SELECT ur.user_id INTO v_coord_id
  FROM user_roles ur
  WHERE ur.is_coordinator = true
  LIMIT 1;

  -- Create task for coordinator
  INSERT INTO tasks (
    title, description, client_id, client_name, deal_id,
    assigned_to, created_by, status, priority,
    source_action, source_entity_type, source_entity_id
  )
  VALUES (
    'Admin checklist required: ' || COALESCE(v_deal.client_name, v_contract.client_name),
    'Sales checklist completed. Please complete the admin checklist for this contract.',
    v_contract.client_id,
    COALESCE(v_deal.client_name, v_contract.client_name),
    v_contract.deal_id,
    v_coord_id,
    auth.uid(),
    'pending',
    'high',
    'sales_checklist_submitted',
    'contract',
    p_contract_id
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ============================================================
-- 6. submit_admin_checklist
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_admin_checklist(
  p_contract_id  uuid,
  p_items        jsonb,
  p_banking_ok   boolean DEFAULT false,
  p_contact_ok   boolean DEFAULT false,
  p_identity_ok  boolean DEFAULT false,
  p_call_log_id  uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract       contracts%ROWTYPE;
  v_deal           deals%ROWTYPE;
  v_key            text;
  v_item           jsonb;
  v_all_confirmed  bool := true;
  v_ticket_id      uuid;
  v_ticket_ids     uuid[] := '{}';
  v_new_status     text;
BEGIN
  IF NOT (_is_owner(auth.uid()) OR _is_coordinator(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  SELECT * INTO v_deal FROM deals WHERE id = v_contract.deal_id;

  -- Inspect items (object: { key: { status, notes }, ... }); create mismatch tickets
  FOR v_key IN SELECT jsonb_object_keys(p_items)
  LOOP
    v_item := p_items->v_key;
    IF v_item->>'status' IN ('not_explained', 'unsure') THEN
      v_all_confirmed := false;

      IF v_deal.lead_id IS NOT NULL THEN
        INSERT INTO lead_tickets (
          lead_id, ticket_type_code, from_user_id,
          to_user_id, subject, body, priority, status, related_deal_id
        )
        VALUES (
          v_deal.lead_id,
          'contract_mismatch',
          auth.uid(),
          v_deal.closer_id,
          'Contract mismatch: ' || v_key,
          COALESCE(v_item->>'notes', 'Admin flagged item during checklist review.'),
          'high',
          'open',
          v_deal.id
        )
        RETURNING id INTO v_ticket_id;

        v_ticket_ids := array_append(v_ticket_ids, v_ticket_id);
      END IF;
    END IF;
  END LOOP;

  -- Determine new contract status
  IF v_all_confirmed AND p_banking_ok AND p_contact_ok AND p_identity_ok THEN
    v_new_status := 'verified';
  ELSE
    v_new_status := 'in_mismatch';
  END IF;

  -- Upsert admin checklist
  INSERT INTO contract_checklist_admin (
    contract_id, completed_by, completed_at, call_log_id, items,
    mismatch_ticket_ids, banking_verified, contact_verified, identity_verified
  )
  VALUES (
    p_contract_id, auth.uid(), now(), p_call_log_id, p_items,
    v_ticket_ids, p_banking_ok, p_contact_ok, p_identity_ok
  )
  ON CONFLICT (contract_id) DO UPDATE
    SET completed_by        = EXCLUDED.completed_by,
        completed_at        = EXCLUDED.completed_at,
        call_log_id         = EXCLUDED.call_log_id,
        items               = EXCLUDED.items,
        mismatch_ticket_ids = EXCLUDED.mismatch_ticket_ids,
        banking_verified    = EXCLUDED.banking_verified,
        contact_verified    = EXCLUDED.contact_verified,
        identity_verified   = EXCLUDED.identity_verified;

  -- Update contract status
  UPDATE contracts
  SET status     = v_new_status,
      updated_at = now()
  WHERE id = p_contract_id;

  RETURN jsonb_build_object(
    'ok',                true,
    'status',            v_new_status,
    'mismatch_ticket_ids', to_jsonb(v_ticket_ids)
  );
END;
$$;


-- ============================================================
-- 7. get_contract_for_signing  (PUBLIC — no auth check)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_contract_for_signing(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract contracts%ROWTYPE;
  v_sigs     jsonb;
BEGIN
  SELECT * INTO v_contract
  FROM   contracts
  WHERE  signing_token = p_token
    AND  signing_token_expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- Fetch any pre-filled MiO signatures
  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.signed_at)
  INTO   v_sigs
  FROM   contract_signatures s
  WHERE  s.contract_id = v_contract.id
    AND  s.signer_role NOT LIKE 'client%';

  RETURN jsonb_build_object(
    'ok',            true,
    'id',            v_contract.id,
    'client_name',   v_contract.client_name,
    'package',       v_contract.package,
    'document_url',  v_contract.document_url,
    'status',        v_contract.status,
    'cover_summary', v_contract.cover_summary,
    'mio_signatures', COALESCE(v_sigs, '[]'::jsonb)
  );
END;
$$;


-- ============================================================
-- 8. record_signature  (PUBLIC — called from signing page)
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_signature(
  p_contract_id    uuid,
  p_agreement_part text,
  p_signer_role    text,
  p_method         text,
  p_payload        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_master_sig_exists bool;
  v_popia_sig_exists  bool;
BEGIN
  -- Only client signatures accepted via this public endpoint
  IF p_signer_role NOT LIKE 'client%' THEN
    RAISE EXCEPTION 'Only client signatures may be submitted via this endpoint';
  END IF;

  INSERT INTO contract_signatures (
    contract_id,
    agreement_part,
    signer_role,
    signer_full_name,
    signer_email,
    signer_id_number,
    signer_capacity,
    signature_method,
    typed_signature,
    drawn_signature_data_url,
    signed_at,
    signed_ip,
    signed_user_agent
  )
  VALUES (
    p_contract_id,
    p_agreement_part,
    p_signer_role,
    p_payload->>'signer_full_name',
    p_payload->>'signer_email',
    p_payload->>'signer_id_number',
    p_payload->>'signer_capacity',
    p_method,
    p_payload->>'typed_signature',
    p_payload->>'drawn_signature_data_url',
    now(),
    inet_client_addr(),
    p_payload->>'user_agent'
  );

  -- Check if both master agreement and popia client sigs now exist
  SELECT EXISTS (
    SELECT 1 FROM contract_signatures
    WHERE contract_id   = p_contract_id
      AND signer_role   LIKE 'client%'
      AND agreement_part = 'master'
  ) INTO v_master_sig_exists;

  SELECT EXISTS (
    SELECT 1 FROM contract_signatures
    WHERE contract_id   = p_contract_id
      AND signer_role   LIKE 'client%'
      AND agreement_part = 'popia'
  ) INTO v_popia_sig_exists;

  IF v_master_sig_exists AND v_popia_sig_exists THEN
    UPDATE contracts
    SET client_signed_at   = now(),
        signed_by_client   = true,
        popia_signed       = true,
        popia_client_signed_at = now(),
        signing_status     = 'client_signed',
        updated_at         = now()
    WHERE id = p_contract_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ============================================================
-- 9. record_initials  (PUBLIC for client party)
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_initials(
  p_contract_id  uuid,
  p_party        text,
  p_initials_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- For non-client parties, require authentication
  IF p_party <> 'client' AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for non-client initials';
  END IF;

  INSERT INTO contract_initials (
    contract_id,
    party,
    initials_text,
    initialled_at,
    initialled_ip,
    initialled_user_agent,
    initialled_by
  )
  VALUES (
    p_contract_id,
    p_party,
    p_initials_text,
    now(),
    inet_client_addr(),
    NULL,  -- user_agent not available server-side; frontend may pass via separate column if needed
    auth.uid()
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ============================================================
-- 10. approve_contract  (Owner only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_contract(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT _is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: owner role required';
  END IF;

  UPDATE contracts
  SET status         = 'fully_executed',
      mio_signed_at  = now(),
      signed_by_mio  = true,
      popia_mio_signed_at = now(),
      signing_status = 'fully_signed',
      updated_at     = now()
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ============================================================
-- 11. send_back_contract
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_back_contract(
  p_contract_id uuid,
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract  contracts%ROWTYPE;
  v_deal      deals%ROWTYPE;
BEGIN
  IF NOT (_is_owner(auth.uid()) OR _is_coordinator(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  SELECT * INTO v_deal FROM deals WHERE id = v_contract.deal_id;

  -- Update contract status
  UPDATE contracts
  SET status     = 'sent_back',
      updated_at = now()
  WHERE id = p_contract_id;

  -- Create task assigned to closer
  INSERT INTO tasks (
    title, description, client_id, client_name, deal_id,
    assigned_to, created_by, status, priority,
    source_action, source_entity_type, source_entity_id
  )
  VALUES (
    'Contract sent back: ' || COALESCE(v_deal.client_name, v_contract.client_name),
    COALESCE(p_reason, 'Contract has been sent back for revision.'),
    v_contract.client_id,
    COALESCE(v_deal.client_name, v_contract.client_name),
    v_contract.deal_id,
    v_deal.closer_id,
    auth.uid(),
    'pending',
    'high',
    'contract_sent_back',
    'contract',
    p_contract_id
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ============================================================
-- System settings: MiO signing authority
-- ============================================================
INSERT INTO system_settings (key, value, updated_by)
VALUES (
  'mio_signing_authority.v1',
  '{"signer_name":"Riana du Plessis","signer_capacity":"Director","signer_initials":"MIOTNP","signature_storage_path":"brand-assets/mio_director_signature.png","witness_1_name":"Thapelo Maupa","witness_2_name":null}'::jsonb,
  NULL
)
ON CONFLICT (key) DO NOTHING;
