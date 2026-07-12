-- Migration 80: After client signs both parts, bump deal pipeline + send confirmation email
-- 1. Add 'contract_signed' to deals pipeline_phase constraint
-- 2. Update record_signature to set contract status='signed', deal pipeline='contract_signed',
--    and fire 'contract_signed' email to client

ALTER TABLE deals DROP CONSTRAINT deals_pipeline_phase_check;
ALTER TABLE deals ADD CONSTRAINT deals_pipeline_phase_check
  CHECK (pipeline_phase = ANY (ARRAY[
    'foundation', 'working', 'loading', 'contract_signed', 'active', 'archived'
  ]));

CREATE OR REPLACE FUNCTION public.record_signature(
  p_contract_id uuid,
  p_agreement_part text,
  p_signer_role text,
  p_method text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_master_sig_exists bool;
  v_popia_sig_exists  bool;
  v_contract          contracts%ROWTYPE;
  v_deal              deals%ROWTYPE;
  v_client_email      text;
  v_client_name       text;
  v_package           text;
  v_service_key       text;
  v_app_url           text := 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app';
BEGIN
  IF p_signer_role NOT LIKE 'client%' THEN
    RAISE EXCEPTION 'Only client signatures may be submitted via this endpoint';
  END IF;

  INSERT INTO contract_signatures (
    contract_id, agreement_part, signer_role,
    signer_full_name, signer_email, signer_id_number, signer_capacity,
    signature_method, typed_signature, drawn_signature_data_url,
    signed_at, signed_ip, signed_user_agent
  )
  VALUES (
    p_contract_id, p_agreement_part, p_signer_role,
    p_payload->>'signer_full_name',
    p_payload->>'signer_email',
    p_payload->>'signer_id_number',
    p_payload->>'signer_capacity',
    p_method,
    p_payload->>'typed_signature',
    p_payload->>'drawn_signature_data_url',
    now(), inet_client_addr(),
    p_payload->>'user_agent'
  );

  SELECT EXISTS (
    SELECT 1 FROM contract_signatures
    WHERE contract_id = p_contract_id AND signer_role LIKE 'client%' AND agreement_part = 'master'
  ) INTO v_master_sig_exists;

  SELECT EXISTS (
    SELECT 1 FROM contract_signatures
    WHERE contract_id = p_contract_id AND signer_role LIKE 'client%' AND agreement_part = 'popia'
  ) INTO v_popia_sig_exists;

  IF v_master_sig_exists AND v_popia_sig_exists THEN
    UPDATE contracts
    SET client_signed_at = now(),
        signed_by_client = true,
        popia_signed = true,
        popia_client_signed_at = now(),
        signing_status = 'client_signed',
        status = 'signed',
        updated_at = now()
    WHERE id = p_contract_id;

    SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
    SELECT * INTO v_deal FROM deals WHERE id = v_contract.deal_id;

    UPDATE deals
    SET pipeline_phase = 'contract_signed',
        updated_at = now()
    WHERE id = v_contract.deal_id;

    SELECT email, COALESCE(contact_person, business_name)
    INTO v_client_email, v_client_name
    FROM clients WHERE id = v_deal.client_id;

    v_package := COALESCE(v_deal.package, 'unknown');

    IF v_client_email IS NOT NULL THEN
      PERFORM net.http_post(
        'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/send-email',
        jsonb_build_object(
          'template', 'contract_signed',
          'to', v_client_email,
          'payload', jsonb_build_object(
            'clientName', COALESCE(v_client_name, v_contract.client_name),
            'packageName', initcap(replace(v_package, '_', ' ')),
            'portalUrl', v_app_url || '/client'
          )
        ),
        '{}'::jsonb,
        jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        30000
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
