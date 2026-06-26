-- Migration 78: Fix send_contract_for_signing and resend_contract RPCs
-- Both used named params for net.http_post (not supported) and cast body as ::text.
-- Fixed to positional args: net.http_post(url, body jsonb, params jsonb, headers jsonb, timeout_ms int)

CREATE OR REPLACE FUNCTION public.send_contract_for_signing(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
  v_contract contracts%ROWTYPE;
  v_deal deals%ROWTYPE;
  v_client_email text;
  v_client_name text;
  v_package text;
  v_app_url text := 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app';
  v_sign_url text;
  v_service_key text;
BEGIN
  IF NOT (_is_owner(auth.uid()) OR _is_coordinator(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  SELECT * INTO v_deal FROM deals WHERE id = v_contract.deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deal not found for contract'; END IF;

  SELECT email, COALESCE(contact_person, business_name) INTO v_client_email, v_client_name
  FROM clients WHERE id = v_deal.client_id;
  IF v_client_email IS NULL THEN RAISE EXCEPTION 'Client has no email address'; END IF;

  v_package := COALESCE(v_deal.package, 'unknown');

  v_token := gen_random_uuid()::text;
  v_sign_url := v_app_url || '/sign/' || v_token;

  UPDATE contracts
  SET signing_token = v_token,
      signing_token_expires_at = now() + interval '7 days',
      status = 'sent',
      signing_status = 'pending',
      updated_at = now()
  WHERE id = p_contract_id;

  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  PERFORM net.http_post(
    'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/send-email',
    jsonb_build_object(
      'template', 'contract_for_signature',
      'to', v_client_email,
      'payload', jsonb_build_object(
        'clientName', v_client_name,
        'packageName', initcap(replace(v_package, '_', ' ')),
        'signUrl', v_sign_url
      )
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    ),
    30000
  );

  RETURN jsonb_build_object(
    'ok', true,
    'signing_token', v_token,
    'signing_url', v_sign_url,
    'emailed_to', v_client_email
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.resend_contract(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract contracts%ROWTYPE;
  v_deal deals%ROWTYPE;
  v_client_email text;
  v_client_name text;
  v_package text;
  v_token text;
  v_app_url text := 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app';
  v_sign_url text;
  v_service_key text;
BEGIN
  IF NOT (_is_owner(auth.uid()) OR _is_coordinator(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_contract FROM contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  SELECT * INTO v_deal FROM deals WHERE id = v_contract.deal_id;

  SELECT email, COALESCE(contact_person, business_name) INTO v_client_email, v_client_name
  FROM clients WHERE id = v_deal.client_id;
  IF v_client_email IS NULL THEN RAISE EXCEPTION 'Client has no email address'; END IF;

  v_package := COALESCE(v_deal.package, 'unknown');

  IF v_contract.signing_token IS NULL OR v_contract.signing_token_expires_at < now() THEN
    v_token := gen_random_uuid()::text;
    UPDATE contracts SET signing_token = v_token, signing_token_expires_at = now() + interval '7 days' WHERE id = p_contract_id;
  ELSE
    v_token := v_contract.signing_token;
  END IF;

  v_sign_url := v_app_url || '/sign/' || v_token;

  UPDATE contracts SET resend_count = COALESCE(resend_count, 0) + 1, updated_at = now() WHERE id = p_contract_id;

  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_service_key := NULL; END;

  PERFORM net.http_post(
    'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/send-email',
    jsonb_build_object(
      'template', 'contract_for_signature',
      'to', v_client_email,
      'payload', jsonb_build_object(
        'clientName', v_client_name,
        'packageName', initcap(replace(v_package, '_', ' ')),
        'signUrl', v_sign_url
      )
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    ),
    30000
  );

  RETURN jsonb_build_object('ok', true, 'signing_url', v_sign_url, 'emailed_to', v_client_email, 'resend_count', COALESCE(v_contract.resend_count, 0) + 1);
END;
$$;
