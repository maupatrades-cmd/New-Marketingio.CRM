-- ── client_approve_deliverable ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION client_approve_deliverable(p_deliverable_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del    deliverables%ROWTYPE;
  v_client clients%ROWTYPE;
  v_pending_setup int;
BEGIN
  SELECT * INTO v_del FROM deliverables WHERE id = p_deliverable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_del.status NOT IN ('awaiting_client','client_reviewing') THEN
    RAISE EXCEPTION 'invalid_state: deliverable is %', v_del.status;
  END IF;

  SELECT * INTO v_client FROM clients WHERE id = v_del.client_id;
  -- Auth: must be the client
  IF v_client.client_user_id <> auth.uid() THEN RAISE EXCEPTION 'access_denied'; END IF;

  UPDATE deliverables SET
    status = 'approved', approved_date = CURRENT_DATE,
    approved_by = auth.uid(), updated_at = now()
  WHERE id = p_deliverable_id;

  INSERT INTO deliverable_status_history (deliverable_id, from_status, to_status, changed_by, changed_by_role)
  VALUES (p_deliverable_id, v_del.status, 'approved', auth.uid(), 'client');

  -- Notify assigned staff
  IF v_del.assigned_to IS NOT NULL THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
    VALUES (v_del.assigned_to, 'deliverable_approved',
      '✓ ' || v_del.title || ' approved',
      COALESCE(v_client.business_name,'Client') || ' approved your work',
      'deliverable', p_deliverable_id, '/owner/fulfilment');
  END IF;

  -- Notify owner/admin
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
  SELECT ur.user_id, 'deliverable_approved',
    COALESCE(v_client.business_name,'Client') || ' approved: ' || v_del.title,
    'Deliverable closed ✓', 'deliverable', p_deliverable_id, '/owner/fulfilment'
  FROM user_roles ur WHERE ur.role IN ('owner','admin');

  -- Check if all setup deliverables for this deal are now approved
  IF v_del.phase = 'setup' AND v_del.deal_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_pending_setup
    FROM deliverables
    WHERE deal_id = v_del.deal_id
      AND phase = 'setup'
      AND status NOT IN ('approved','deemed_approved','completed')
      AND id <> p_deliverable_id;

    IF v_pending_setup = 0 THEN
      -- All setup approved — update deal onboarding
      UPDATE deals SET client_onboarded = TRUE, client_onboarded_date = CURRENT_DATE
       WHERE id = v_del.deal_id AND client_onboarded = FALSE;

      INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
      SELECT ur.user_id, 'system_update',
        '🎉 ' || COALESCE(v_client.business_name,'Client') || ' fully onboarded!',
        'All setup deliverables approved. First recurring cycle starts next month.',
        'deal', v_del.deal_id, '/owner/fulfilment'
      FROM user_roles ur WHERE ur.role IN ('owner','admin');
    END IF;
  END IF;

  INSERT INTO audit_log (table_name, row_id, action, actor_id, before_data, after_data)
  VALUES ('deliverables', p_deliverable_id::text, 'client_approve', auth.uid(),
    jsonb_build_object('status', v_del.status), jsonb_build_object('status','approved'));
END;
$$;

-- ── client_request_changes ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION client_request_changes(p_deliverable_id uuid, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del    deliverables%ROWTYPE;
  v_client clients%ROWTYPE;
BEGIN
  IF trim(COALESCE(p_notes,'')) = '' THEN RAISE EXCEPTION 'validation: notes required'; END IF;
  SELECT * INTO v_del FROM deliverables WHERE id = p_deliverable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_client FROM clients WHERE id = v_del.client_id;
  IF v_client.client_user_id <> auth.uid() THEN RAISE EXCEPTION 'access_denied'; END IF;

  UPDATE deliverables SET
    status = 'client_requested_changes',
    changes_requested_notes = trim(p_notes),
    updated_at = now()
  WHERE id = p_deliverable_id;

  INSERT INTO deliverable_status_history (deliverable_id, from_status, to_status, changed_by, changed_by_role, notes)
  VALUES (p_deliverable_id, v_del.status, 'client_requested_changes', auth.uid(), 'client', trim(p_notes));

  -- Notify assigned staff (urgent)
  IF v_del.assigned_to IS NOT NULL THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
    VALUES (v_del.assigned_to, 'deliverable_changes_requested',
      '🔄 Changes requested: ' || v_del.title,
      COALESCE(v_client.business_name,'Client') || ' says: ' || left(trim(p_notes), 200),
      'deliverable', p_deliverable_id, '/owner/fulfilment');
  END IF;

  -- Notify owner
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
  SELECT ur.user_id, 'deliverable_changes_requested',
    COALESCE(v_client.business_name,'Client') || ' requested changes on ' || v_del.title,
    left(trim(p_notes), 200), 'deliverable', p_deliverable_id, '/owner/fulfilment'
  FROM user_roles ur WHERE ur.role IN ('owner','admin');

  INSERT INTO audit_log (table_name, row_id, action, actor_id, before_data, after_data)
  VALUES ('deliverables', p_deliverable_id::text, 'client_request_changes', auth.uid(),
    jsonb_build_object('status', v_del.status),
    jsonb_build_object('status','client_requested_changes','notes',p_notes));
END;
$$;

-- ── client_reject_deliverable ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION client_reject_deliverable(p_deliverable_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del    deliverables%ROWTYPE;
  v_client clients%ROWTYPE;
BEGIN
  IF trim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'validation: reason required'; END IF;
  SELECT * INTO v_del FROM deliverables WHERE id = p_deliverable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_client FROM clients WHERE id = v_del.client_id;
  IF v_client.client_user_id <> auth.uid() THEN RAISE EXCEPTION 'access_denied'; END IF;

  UPDATE deliverables SET
    status = 'client_rejected', rejection_reason = trim(p_reason),
    rejected_by = auth.uid(), updated_at = now()
  WHERE id = p_deliverable_id;

  INSERT INTO deliverable_status_history (deliverable_id, from_status, to_status, changed_by, changed_by_role, notes)
  VALUES (p_deliverable_id, v_del.status, 'client_rejected', auth.uid(), 'client', trim(p_reason));

  -- Urgent notification to owner
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
  SELECT ur.user_id, 'deliverable_rejected',
    '🚨 ' || COALESCE(v_client.business_name,'Client') || ' REJECTED: ' || v_del.title,
    'Reason: ' || left(trim(p_reason), 300),
    'deliverable', p_deliverable_id, '/owner/fulfilment'
  FROM user_roles ur WHERE ur.role IN ('owner','admin');

  IF v_del.assigned_to IS NOT NULL THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
    VALUES (v_del.assigned_to, 'deliverable_rejected',
      '❌ Rejected: ' || v_del.title,
      COALESCE(v_client.business_name,'Client') || ': ' || left(trim(p_reason), 200),
      'deliverable', p_deliverable_id, '/owner/fulfilment');
  END IF;

  INSERT INTO audit_log (table_name, row_id, action, actor_id, before_data, after_data)
  VALUES ('deliverables', p_deliverable_id::text, 'client_reject', auth.uid(),
    jsonb_build_object('status', v_del.status),
    jsonb_build_object('status','client_rejected','reason',p_reason));
END;
$$;

-- ── submit_client_obligation ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_client_obligation(
  p_obligation_id uuid,
  p_notes         text DEFAULT NULL,
  p_files         text[] DEFAULT '{}'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_obl    client_obligations_progress%ROWTYPE;
  v_client clients%ROWTYPE;
BEGIN
  SELECT * INTO v_obl FROM client_obligations_progress WHERE id = p_obligation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_client FROM clients WHERE id = v_obl.client_id;
  IF v_client.client_user_id <> auth.uid() THEN RAISE EXCEPTION 'access_denied'; END IF;

  UPDATE client_obligations_progress SET
    status = 'submitted', submitted_at = now(),
    submitted_notes = p_notes, submitted_files = p_files, updated_at = now()
  WHERE id = p_obligation_id;

  -- Notify admin
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
  SELECT ur.user_id, 'obligation_submitted',
    COALESCE(v_client.business_name,'Client') || ' submitted: ' || v_obl.obligation_label,
    'Please verify when you can.',
    'deal', v_obl.deal_id, '/owner/fulfilment'
  FROM user_roles ur WHERE ur.role IN ('owner','admin');

  -- Auto-acknowledge to client
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
  VALUES (auth.uid(), 'obligation_submitted',
    'Received: ' || v_obl.obligation_label,
    'We''ll review and confirm shortly.',
    '/client/deliverables');
END;
$$;

-- ── verify_client_obligation ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION verify_client_obligation(p_obligation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_obl  client_obligations_progress%ROWTYPE;
  v_client clients%ROWTYPE;
BEGIN
  PERFORM 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech');
  IF NOT FOUND THEN RAISE EXCEPTION 'access_denied'; END IF;

  SELECT * INTO v_obl FROM client_obligations_progress WHERE id = p_obligation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  UPDATE client_obligations_progress SET
    status = 'verified', verified_by = auth.uid(), verified_at = now(), updated_at = now()
  WHERE id = p_obligation_id;

  SELECT * INTO v_client FROM clients WHERE id = v_obl.client_id;

  -- Notify client
  IF v_client.client_user_id IS NOT NULL THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
    VALUES (v_client.client_user_id, 'obligation_verified',
      '✓ Verified: ' || v_obl.obligation_label,
      'We''ve confirmed your submission. Work can now begin.',
      '/client/deliverables');
  END IF;

  -- Notify staff on any deliverables now unblocked
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
  SELECT DISTINCT d.assigned_to, 'obligation_verified',
    'Obligation verified — you can now start: ' || d.title,
    v_obl.obligation_label || ' has been verified for ' || COALESCE(v_client.business_name,'client'),
    'deliverable', d.id, '/owner/fulfilment'
  FROM deliverables d
  WHERE d.deal_id = v_obl.deal_id
    AND d.requires_obligation_keys @> ARRAY[v_obl.obligation_key]
    AND d.assigned_to IS NOT NULL
    AND d.status = 'not_started';

  INSERT INTO audit_log (table_name, row_id, action, actor_id, after_data)
  VALUES ('client_obligations_progress', p_obligation_id::text, 'verify_obligation', auth.uid(),
    jsonb_build_object('status','verified','obligation_key', v_obl.obligation_key));
END;
$$;

-- ── waive_client_obligation ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION waive_client_obligation(p_obligation_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_obl client_obligations_progress%ROWTYPE;
BEGIN
  PERFORM 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin');
  IF NOT FOUND THEN RAISE EXCEPTION 'access_denied: owner/admin only'; END IF;
  IF trim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'validation: reason required'; END IF;

  SELECT * INTO v_obl FROM client_obligations_progress WHERE id = p_obligation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  UPDATE client_obligations_progress SET
    status = 'waived_by_admin', waived_reason = trim(p_reason),
    verified_by = auth.uid(), verified_at = now(), updated_at = now()
  WHERE id = p_obligation_id;

  INSERT INTO audit_log (table_name, row_id, action, actor_id, after_data)
  VALUES ('client_obligations_progress', p_obligation_id::text, 'waive_obligation', auth.uid(),
    jsonb_build_object('status','waived_by_admin','reason',p_reason));
END;
$$;

-- ── record_deliverable_feedback ────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_deliverable_feedback(
  p_deliverable_id uuid,
  p_rating         smallint,
  p_comment        text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del      deliverables%ROWTYPE;
  v_client   clients%ROWTYPE;
  v_feedback_id uuid;
  v_low_threshold int;
  v_rules    jsonb;
BEGIN
  SELECT * INTO v_del FROM deliverables WHERE id = p_deliverable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_client FROM clients WHERE id = v_del.client_id;
  IF v_client.client_user_id <> auth.uid() THEN RAISE EXCEPTION 'access_denied'; END IF;
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid_rating: 1-5 only'; END IF;

  INSERT INTO deliverable_feedback (deliverable_id, client_id, rating, comment)
  VALUES (p_deliverable_id, v_del.client_id, p_rating, p_comment)
  RETURNING id INTO v_feedback_id;

  UPDATE deliverables SET feedback_id = v_feedback_id WHERE id = p_deliverable_id;

  -- Low-rating alert
  SELECT value INTO v_rules FROM system_settings WHERE key = 'deliverable_rules.v1';
  v_low_threshold := COALESCE((v_rules->>'low_rating_alert_threshold')::int, 3);

  IF p_rating <= v_low_threshold THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
    SELECT ur.user_id, 'system_update',
      '⚠ Low rating: ' || p_rating || '★ on ' || v_del.title,
      COALESCE(v_client.business_name,'Client') || COALESCE(': "' || left(p_comment,100) || '"',''),
      'deliverable', p_deliverable_id, '/owner/fulfilment/quality'
    FROM user_roles ur WHERE ur.role IN ('owner','admin');
  END IF;

  -- Notify assigned staff (all ratings)
  IF v_del.assigned_to IS NOT NULL THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
    VALUES (v_del.assigned_to, 'deliverable_approved',
      p_rating || '★ feedback on ' || v_del.title,
      COALESCE(p_comment, 'No comment left'),
      '/owner/fulfilment');
  END IF;

  RETURN v_feedback_id;
END;
$$;

-- ── get_client_deliverables ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_client_deliverables()
RETURNS TABLE (
  id              uuid,
  title           text,
  phase           text,
  product         text,
  status          text,
  due_date        date,
  review_deadline date,
  approved_date   date,
  month_year      text,
  notes           text,
  file_urls       text[],
  changes_requested_notes text,
  rejection_reason text,
  feedback_id     uuid,
  feedback_rating smallint,
  days_left       int,
  created_at      timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT id INTO v_client_id FROM clients WHERE client_user_id = auth.uid() LIMIT 1;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'not_a_client'; END IF;

  RETURN QUERY
  SELECT
    d.id, d.title, d.phase, d.product, d.status,
    d.due_date, d.review_deadline, d.approved_date, d.month_year,
    d.notes, d.file_urls, d.changes_requested_notes, d.rejection_reason,
    d.feedback_id,
    df.rating,
    CASE WHEN d.review_deadline IS NOT NULL
         THEN (d.review_deadline - CURRENT_DATE)
         ELSE NULL END AS days_left,
    d.created_at
  FROM deliverables d
  LEFT JOIN deliverable_feedback df ON df.id = d.feedback_id
  WHERE d.client_id = v_client_id
    AND d.status NOT IN ('completed')
  ORDER BY
    CASE d.status
      WHEN 'awaiting_client'           THEN 1
      WHEN 'client_reviewing'          THEN 1
      WHEN 'client_requested_changes'  THEN 2
      WHEN 'client_rejected'           THEN 2
      WHEN 'in_progress'               THEN 3
      WHEN 'not_started'               THEN 4
      ELSE 5
    END,
    d.review_deadline ASC NULLS LAST,
    d.due_date ASC NULLS LAST;
END;
$$;

-- ── get_client_obligations ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_client_obligations()
RETURNS SETOF client_obligations_progress LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT id INTO v_client_id FROM clients WHERE client_user_id = auth.uid() LIMIT 1;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'not_a_client'; END IF;
  RETURN QUERY
  SELECT * FROM client_obligations_progress
  WHERE client_id = v_client_id
  ORDER BY
    CASE status WHEN 'pending' THEN 1 WHEN 'submitted' THEN 2
                WHEN 'rejected' THEN 3 ELSE 4 END,
    due_date ASC NULLS LAST;
END;
$$;

-- Smoke
DO $$
BEGIN
  ASSERT (SELECT to_regprocedure('public.client_approve_deliverable(uuid)') IS NOT NULL), 'client_approve_deliverable missing';
  ASSERT (SELECT to_regprocedure('public.client_request_changes(uuid,text)') IS NOT NULL), 'client_request_changes missing';
  ASSERT (SELECT to_regprocedure('public.client_reject_deliverable(uuid,text)') IS NOT NULL), 'client_reject_deliverable missing';
  ASSERT (SELECT to_regprocedure('public.submit_client_obligation(uuid,text,text[])') IS NOT NULL), 'submit_client_obligation missing';
  ASSERT (SELECT to_regprocedure('public.verify_client_obligation(uuid)') IS NOT NULL), 'verify_client_obligation missing';
  ASSERT (SELECT to_regprocedure('public.record_deliverable_feedback(uuid,smallint,text)') IS NOT NULL), 'record_deliverable_feedback missing';
END $$;
