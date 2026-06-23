-- ══════════════════════════════════════════════════════════════════════════════
-- BRICK LI5 — Lead triage RPCs (verify_lead, reject_lead, accept_lead)
-- Role-gated SECURITY DEFINER. All writes audit_log.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── verify_lead ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_lead(p_lead_id uuid, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role  text;
  v_lead  leads%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM user_roles
   WHERE user_id = auth.uid()
     AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied: managers only'; END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: lead %', p_lead_id; END IF;
  IF v_lead.status = 'verified' THEN RAISE EXCEPTION 'already_verified'; END IF;

  UPDATE leads SET
    status        = 'verified',
    verified_by   = auth.uid(),
    verified_date = CURRENT_DATE,
    notes         = CASE WHEN p_notes IS NULL THEN notes
                         ELSE COALESCE(notes,'') || E'\n[VERIFY] ' || p_notes END
  WHERE id = p_lead_id;

  INSERT INTO audit_log (table_name, row_id, action, actor_id, before_data, after_data)
  VALUES ('leads', p_lead_id::text, 'verify_lead', auth.uid(),
          jsonb_build_object('status', v_lead.status),
          jsonb_build_object('status','verified','notes', p_notes));
END;
$$;

-- ── reject_lead ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_lead(p_lead_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role  text;
  v_lead  leads%ROWTYPE;
BEGIN
  IF trim(COALESCE(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'validation: reason required';
  END IF;

  SELECT role INTO v_role FROM user_roles
   WHERE user_id = auth.uid()
     AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied: managers only'; END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: lead %', p_lead_id; END IF;

  UPDATE leads SET
    status           = 'rejected',
    rejection_reason = trim(p_reason)
  WHERE id = p_lead_id;

  -- Notify the submitter so they know what happened
  IF v_lead.submitted_by IS NOT NULL AND v_lead.submitted_by <> auth.uid() THEN
    INSERT INTO client_notifications (
      recipient_user_id, notification_type, title, body, action_url
    ) VALUES (
      v_lead.submitted_by, 'system_update',
      '❌ Lead rejected: ' || COALESCE(v_lead.business_name,'Unknown'),
      'Reason: ' || trim(p_reason),
      '/owner/leads/' || p_lead_id || '/inbox'
    );
  END IF;

  INSERT INTO audit_log (table_name, row_id, action, actor_id, before_data, after_data)
  VALUES ('leads', p_lead_id::text, 'reject_lead', auth.uid(),
          jsonb_build_object('status', v_lead.status),
          jsonb_build_object('status','rejected','rejection_reason', trim(p_reason)));
END;
$$;

-- ── accept_lead ───────────────────────────────────────────────────────────────
-- Manager pulls a lead onto themselves: sets assigned_to = auth.uid().
-- Distinct from assign_lead (which routes to someone else).
CREATE OR REPLACE FUNCTION accept_lead(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role  text;
  v_lead  leads%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM user_roles
   WHERE user_id = auth.uid()
     AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied: managers only'; END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: lead %', p_lead_id; END IF;

  UPDATE leads SET
    assigned_to = auth.uid(),
    assigned_at = now()
  WHERE id = p_lead_id;

  INSERT INTO audit_log (table_name, row_id, action, actor_id, before_data, after_data)
  VALUES ('leads', p_lead_id::text, 'accept_lead', auth.uid(),
          jsonb_build_object('assigned_to', v_lead.assigned_to),
          jsonb_build_object('assigned_to', auth.uid()));
END;
$$;

-- ── Smoke ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT to_regprocedure('public.verify_lead(uuid,text)') IS NOT NULL, 'verify_lead missing';
  ASSERT to_regprocedure('public.reject_lead(uuid,text)') IS NOT NULL, 'reject_lead missing';
  ASSERT to_regprocedure('public.accept_lead(uuid)')      IS NOT NULL, 'accept_lead missing';
END $$;
