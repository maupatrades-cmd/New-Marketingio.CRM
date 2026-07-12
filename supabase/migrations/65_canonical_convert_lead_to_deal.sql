-- 65_canonical_convert_lead_to_deal.sql
-- Drops all 4 overloaded convert_lead_to_deal variants that conflicted in
-- production and replaces with ONE canonical version.
-- Fixes:
--   Bug #1 — deal.cpc_id not populated from lead.submitted_by when submitted_by_role='cpc'
--   Bug #2 — closer_id was set to the caller, stealing credit from lead assignee
--   Bug #3 — no p_quick_close parameter for the Log Sale fast path
--   Bug #4 — stage was 'new_lead' instead of 'contacted' in pipeline path
-- Bug #5 (UI) handled by frontend (Convert button was wired to ticket creation).
-- compute_pipeline_phase signature: (p_stage, p_onboarding_complete_date, p_setup_fee_cleared_date)

DROP FUNCTION IF EXISTS public.convert_lead_to_deal(uuid);
DROP FUNCTION IF EXISTS public.convert_lead_to_deal(uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.convert_lead_to_deal(
  p_lead_id uuid,
  p_quick_close boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_caller_role   public.app_role;
  v_caller_name   text;
  v_lead          public.leads;
  v_deal_source   text;
  v_deal_id       uuid;
  v_closer_id     uuid;
  v_closer_name   text;
  v_closer_role   text;
  v_cpc_id        uuid;
  v_cpc_name      text;
  v_initial_stage text;
  v_initial_prob  integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  v_caller_role := public.current_user_role();
  IF v_caller_role IS NULL
     OR v_caller_role::text NOT IN ('owner','admin','head_of_tech') THEN
    RAISE EXCEPTION 'forbidden: owner, admin or head_of_tech required'
      USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_caller_name
    FROM public.profiles WHERE id = v_caller;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found: %', p_lead_id USING ERRCODE = '23503';
  END IF;

  IF v_lead.status = 'converted'
     OR v_lead.converted_to_deal_id IS NOT NULL THEN
    RAISE EXCEPTION 'lead_already_converted: existing_deal=%',
      v_lead.converted_to_deal_id USING ERRCODE = '23505';
  END IF;

  IF v_lead.status NOT IN ('verified','assigned') THEN
    RAISE EXCEPTION 'lead_must_be_verified_first: current_status=%',
      v_lead.status USING ERRCODE = 'P0001';
  END IF;

  -- Closer = lead.assigned_to (preserves consultant credit)
  IF v_lead.assigned_to IS NOT NULL THEN
    v_closer_id := v_lead.assigned_to;
    SELECT p.full_name, ur.role::text
      INTO v_closer_name, v_closer_role
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = v_closer_id
    ORDER BY ur.granted_at NULLS LAST
    LIMIT 1;
  ELSE
    v_closer_id   := v_caller;
    v_closer_name := v_caller_name;
    v_closer_role := v_caller_role::text;
  END IF;

  -- CPC propagation from lead capturer
  IF v_lead.submitted_by_role = 'cpc'
     AND v_lead.submitted_by IS NOT NULL
     AND v_lead.submitted_by != v_closer_id THEN
    v_cpc_id   := v_lead.submitted_by;
    v_cpc_name := v_lead.submitted_by_name;
  END IF;

  v_deal_source := CASE v_lead.source
    WHEN 'phone_call_to_admin' THEN 'other'
    WHEN 'cpc_outbound'        THEN 'cpc_outbound'
    WHEN 'field_agent_direct'  THEN 'field_agent_direct'
    WHEN 'fnc_referral'        THEN 'fnc_referral'
    WHEN 'inbound'             THEN 'inbound'
    WHEN 'referral'            THEN 'referral'
    ELSE 'other'
  END;

  IF p_quick_close THEN
    v_initial_stage := 'negotiation';
    v_initial_prob  := 80;
  ELSE
    v_initial_stage := 'contacted';
    v_initial_prob  := 20;
  END IF;

  INSERT INTO public.deals(
    client_name, deal_type, package,
    stage, pipeline_phase, probability,
    closer_id, closer_name, closer_role,
    cpc_id, cpc_name,
    source, notes, lead_id
  ) VALUES (
    v_lead.business_name,
    'core_package',
    'none',
    v_initial_stage,
    public.compute_pipeline_phase(v_initial_stage, NULL, NULL),
    v_initial_prob,
    v_closer_id, v_closer_name, v_closer_role,
    v_cpc_id, v_cpc_name,
    v_deal_source,
    COALESCE(p_notes, v_lead.notes),
    p_lead_id
  ) RETURNING id INTO v_deal_id;

  UPDATE public.leads
     SET status               = 'converted',
         converted_to_deal_id = v_deal_id,
         updated_at           = now(),
         last_activity_at     = now(),
         last_activity_type   = 'converted_to_deal'
   WHERE id = p_lead_id;

  INSERT INTO public.audit_log(table_name, row_id, action, actor_id, after_data)
  VALUES (
    'leads', p_lead_id, 'lead_converted', v_caller,
    jsonb_build_object(
      'new_deal_id',   v_deal_id,
      'closer_id',     v_closer_id,
      'closer_role',   v_closer_role,
      'cpc_id',        v_cpc_id,
      'cpc_name',      v_cpc_name,
      'initial_stage', v_initial_stage,
      'path',          CASE WHEN p_quick_close THEN 'quick_close' ELSE 'pipeline' END,
      'caller',        v_caller,
      'on_behalf_of',  CASE WHEN v_closer_id != v_caller THEN v_closer_id ELSE NULL END
    )
  );

  RETURN jsonb_build_object(
    'success',       true,
    'deal_id',       v_deal_id,
    'lead_id',       p_lead_id,
    'initial_stage', v_initial_stage,
    'closer_id',     v_closer_id,
    'closer_name',   v_closer_name,
    'cpc_id',        v_cpc_id,
    'cpc_name',      v_cpc_name,
    'path',          CASE WHEN p_quick_close THEN 'quick_close' ELSE 'pipeline' END,
    'next_step',     CASE WHEN p_quick_close THEN 'open_log_sale_wizard' ELSE 'view_in_pipeline' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_lead_to_deal(uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_deal(uuid, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.convert_lead_to_deal(uuid, boolean, text) IS
'Canonical Convert Lead → Deal RPC. Locked 24 Jun 2026.
Closer preserved from lead.assigned_to. CPC auto-propagated
from lead.submitted_by when submitted_by_role=cpc.
Quick close → negotiation stage. Pipeline → contacted stage.';
