-- Migration 75: generate_contract RPC + contracts storage bucket
-- Directive 09: MSA V3.0 Edge Function

-- ── Contracts storage bucket ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contracts', 'contracts', true, 52428800,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: service_role full access
CREATE POLICY "service_role_contracts_all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'contracts')
  WITH CHECK (bucket_id = 'contracts');

-- Storage RLS: authenticated users can read
CREATE POLICY "authenticated_contracts_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'contracts');

-- ── Branding storage bucket ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding', 'branding', true, 10485760,
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "service_role_branding_all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'branding')
  WITH CHECK (bucket_id = 'branding');

CREATE POLICY "public_branding_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'branding');

-- ── Ensure contracts table has required columns ───────────────────────────────
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS contract_version text,
  ADD COLUMN IF NOT EXISTS document_url     text,
  ADD COLUMN IF NOT EXISTS cover_summary    jsonb;

-- ── generate_contract(p_deal_id) RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_contract(p_deal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller      uuid := auth.uid();
  v_contract_id uuid;
  v_svc_key     text;
  v_fn_url      text := 'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/generate-contract';
  v_request_id  bigint;
BEGIN
  -- Capability check
  IF NOT (_is_owner(v_caller) OR _is_coordinator(v_caller)) THEN
    RAISE EXCEPTION 'access_denied: only owner or coordinator may generate contracts';
  END IF;

  -- Find or create contract row
  SELECT id INTO v_contract_id
  FROM contracts
  WHERE deal_id = p_deal_id
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    INSERT INTO contracts (deal_id, status, loaded_by_admin, contract_version)
    VALUES (p_deal_id, 'draft', v_caller, 'msa_v3.0')
    RETURNING id INTO v_contract_id;
  END IF;

  -- Get service role key from vault (optional; function also reads its own env var)
  SELECT decrypted_secret INTO v_svc_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  -- Fire async HTTP POST to edge function
  SELECT net.http_post(
    url     := v_fn_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_svc_key, '')
    ),
    body    := jsonb_build_object(
      'deal_id',     p_deal_id,
      'contract_id', v_contract_id
    )
  ) INTO v_request_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'contract_id', v_contract_id,
    'request_id',  v_request_id,
    'status',      'generating',
    'message',     'Contract generation queued. Poll contracts row for document_url.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_contract(uuid) TO authenticated;
