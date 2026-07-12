-- Migration 79: Update get_contract_for_signing to include mio_authority from system_settings
-- so the signing page can show the MiO signer name/capacity dynamically.

CREATE OR REPLACE FUNCTION public.get_contract_for_signing(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract contracts%ROWTYPE;
  v_sigs     jsonb;
  v_mio_auth jsonb;
BEGIN
  SELECT * INTO v_contract
  FROM   contracts
  WHERE  signing_token = p_token
    AND  signing_token_expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.signed_at)
  INTO   v_sigs
  FROM   contract_signatures s
  WHERE  s.contract_id = v_contract.id
    AND  s.signer_role NOT LIKE 'client%';

  SELECT value INTO v_mio_auth
  FROM system_settings
  WHERE key = 'mio_signing_authority.v1';

  RETURN jsonb_build_object(
    'ok',            true,
    'id',            v_contract.id,
    'client_name',   v_contract.client_name,
    'package',       v_contract.package,
    'document_url',  v_contract.document_url,
    'status',        v_contract.status,
    'cover_summary', v_contract.cover_summary,
    'mio_signatures', COALESCE(v_sigs, '[]'::jsonb),
    'mio_authority',  v_mio_auth
  );
END;
$$;
