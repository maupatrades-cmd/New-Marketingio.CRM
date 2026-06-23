-- ── Extend notification_type for deliverable events ────────────────────
ALTER TABLE client_notifications
  DROP CONSTRAINT client_notifications_notification_type_check;

ALTER TABLE client_notifications
  ADD CONSTRAINT client_notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY[
    'deliverable_ready','invoice_issued','invoice_overdue','payment_received',
    'payment_failed','message_received','contract_to_sign','report_ready',
    'onboarding_step_complete','onboarding_submission','lead_pending_verification',
    'client_cancelled','system_update','sale_logged','upsell_added',
    'opportunity_closed','hot_lead','lead_assigned',
    'lead_milestone_qualified','lead_milestone_contacted','lead_milestone_meeting',
    'lead_milestone_deal','lead_milestone_won','lead_milestone_lost','lead_milestone_cold',
    'lead_milestone_qualified_verified','lead_milestone_qualified_clarify',
    'lead_milestone_qualified_reject','lead_milestone_deal_created',
    'lead_milestone_sale_won','lead_milestone_sale_lost',
    'lead_ticket_opened','lead_ticket_actioned','lead_ticket_confirmed',
    'lead_ticket_auto_confirmed','lead_ticket_disputed','lead_ticket_reassigned',
    'lead_overwhelmed','closure_bonus_earned','closure_bonus_due',
    'new_lead_submitted',
    'deliverable_status_changed','deliverable_submitted','deliverable_approved',
    'deliverable_changes_requested','deliverable_rejected','deliverable_deemed_approved',
    'obligation_submitted','obligation_verified','obligation_reminder',
    'time_logged'
  ]));

-- ── change_deliverable_status RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION change_deliverable_status(
  p_deliverable_id uuid,
  p_new_status     text,
  p_notes          text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del     deliverables%ROWTYPE;
  v_rules   jsonb;
  v_review_days int;
  v_blocking_obligation text;
  v_client  clients%ROWTYPE;
BEGIN
  SELECT * INTO v_del FROM deliverables WHERE id = p_deliverable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: deliverable %', p_deliverable_id; END IF;

  -- Auth: assignee or manager
  IF auth.uid() <> v_del.assigned_to THEN
    PERFORM 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech');
    IF NOT FOUND THEN RAISE EXCEPTION 'access_denied'; END IF;
  END IF;

  -- Validate status value
  IF p_new_status NOT IN ('not_started','in_progress','awaiting_client','client_reviewing',
    'approved','deemed_approved','completed','blocked','client_requested_changes','client_rejected') THEN
    RAISE EXCEPTION 'invalid_status: %', p_new_status;
  END IF;

  -- Obligation block check for not_started → in_progress
  IF v_del.status = 'not_started' AND p_new_status = 'in_progress'
     AND array_length(v_del.requires_obligation_keys, 1) > 0 THEN
    SELECT cop.obligation_label INTO v_blocking_obligation
    FROM client_obligations_progress cop
    WHERE cop.deal_id = v_del.deal_id
      AND cop.obligation_key = ANY(v_del.requires_obligation_keys)
      AND cop.status NOT IN ('verified','waived_by_admin')
      AND cop.blocking = TRUE
    LIMIT 1;
    IF v_blocking_obligation IS NOT NULL THEN
      RAISE EXCEPTION 'obligation_block: Cannot start — waiting on client to provide: %', v_blocking_obligation;
    END IF;
  END IF;

  -- Load rules
  SELECT value INTO v_rules FROM system_settings WHERE key = 'deliverable_rules.v1';
  v_review_days := COALESCE((v_rules->>'review_window_days')::int, 5);

  -- Update deliverable
  UPDATE deliverables SET
    status          = p_new_status,
    notes           = CASE WHEN p_notes IS NULL THEN notes
                           ELSE COALESCE(notes,'') || E'\n' || p_notes END,
    submitted_date  = CASE WHEN p_new_status = 'awaiting_client' THEN CURRENT_DATE ELSE submitted_date END,
    review_deadline = CASE WHEN p_new_status = 'awaiting_client' THEN CURRENT_DATE + v_review_days ELSE review_deadline END,
    submitted_by    = CASE WHEN p_new_status = 'awaiting_client' THEN auth.uid() ELSE submitted_by END,
    updated_at      = now()
  WHERE id = p_deliverable_id;

  -- History
  INSERT INTO deliverable_status_history (deliverable_id, from_status, to_status, changed_by, changed_by_role, notes)
  VALUES (p_deliverable_id, v_del.status, p_new_status, auth.uid(), 'staff', p_notes);

  -- Notifications
  SELECT * INTO v_client FROM clients WHERE id = v_del.client_id;

  IF p_new_status = 'awaiting_client' THEN
    -- Notify client
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
    SELECT v_client.client_user_id, 'deliverable_submitted',
      '📋 ' || v_del.title || ' is ready for your review',
      'You have ' || v_review_days || ' days to approve or request changes. After that it will be auto-approved.',
      'deliverable', p_deliverable_id, '/client/deliverables'
    WHERE v_client.client_user_id IS NOT NULL;
    -- Notify owner
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
    SELECT ur.user_id, 'deliverable_status_changed',
      v_del.title || ' sent to client for review',
      COALESCE(v_client.business_name,'Client') || ' now has a deliverable awaiting action',
      'deliverable', p_deliverable_id, '/owner/fulfilment'
    FROM user_roles ur WHERE ur.role IN ('owner','admin');
  ELSE
    -- Generic status change notification to owner/admin
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
    SELECT ur.user_id, 'deliverable_status_changed',
      v_del.title || ' → ' || p_new_status,
      COALESCE(v_client.business_name,'Client') || ' · ' || v_del.product,
      'deliverable', p_deliverable_id, '/owner/fulfilment'
    FROM user_roles ur WHERE ur.role IN ('owner','admin')
    AND ur.user_id <> auth.uid();
  END IF;

  -- Audit
  INSERT INTO audit_log (table_name, row_id, action, actor_id, before_data, after_data)
  VALUES ('deliverables', p_deliverable_id::text, 'change_status', auth.uid(),
    jsonb_build_object('status', v_del.status),
    jsonb_build_object('status', p_new_status));
END;
$$;

-- ── log_time_on_deliverable RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_time_on_deliverable(
  p_deliverable_id uuid,
  p_hours          numeric,
  p_date_worked    date DEFAULT CURRENT_DATE,
  p_description    text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del    deliverables%ROWTYPE;
  v_log_id uuid;
  v_rules  jsonb;
  v_threshold int;
  v_total_hours numeric;
BEGIN
  SELECT * INTO v_del FROM deliverables WHERE id = p_deliverable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: deliverable %', p_deliverable_id; END IF;
  IF p_hours <= 0 OR p_hours > 24 THEN RAISE EXCEPTION 'invalid_hours: must be 0.5–24'; END IF;

  INSERT INTO time_logs (deliverable_id, staff_id, hours, date_worked, description, phase)
  VALUES (p_deliverable_id, auth.uid(), p_hours, p_date_worked, p_description, v_del.phase)
  RETURNING id INTO v_log_id;

  -- Check overrun (> 2x SLA days × 8h per day)
  SELECT value INTO v_rules FROM system_settings WHERE key = 'deliverable_rules.v1';
  v_threshold := COALESCE((v_rules->>'overrun_threshold_multiplier')::int, 2);

  SELECT COALESCE(SUM(hours), 0) INTO v_total_hours
  FROM time_logs WHERE deliverable_id = p_deliverable_id;

  -- Flag overrun to owner (silent, no exception)
  DECLARE
    v_sla_hours numeric;
    v_template  fulfilment_templates%ROWTYPE;
  BEGIN
    SELECT * INTO v_template FROM fulfilment_templates WHERE id = v_del.template_id;
    v_sla_hours := COALESCE(v_template.soft_sla_days, 14) * 8.0;
    IF v_total_hours > v_sla_hours * v_threshold THEN
      INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, related_entity_type, related_entity_id, action_url)
      SELECT ur.user_id, 'system_update',
        '⚠ Time overrun: ' || v_del.title,
        ROUND(v_total_hours,1) || 'h logged vs ' || ROUND(v_sla_hours,0) || 'h expected',
        'deliverable', p_deliverable_id, '/owner/fulfilment'
      FROM user_roles ur WHERE ur.role IN ('owner','admin')
      ON CONFLICT DO NOTHING;
    END IF;
  END;

  RETURN v_log_id;
END;
$$;

-- ── get_fulfilment_deliverables RPC ────────────────────────────────────
CREATE OR REPLACE FUNCTION get_fulfilment_deliverables(
  p_phase      text    DEFAULT NULL,
  p_status     text[]  DEFAULT NULL,
  p_client_id  uuid    DEFAULT NULL,
  p_assigned   uuid    DEFAULT NULL,
  p_search     text    DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  title           text,
  phase           text,
  product         text,
  client_id       uuid,
  client_name     text,
  deal_id         uuid,
  assigned_to     uuid,
  assigned_name   text,
  owner_role      text,
  status          text,
  due_date        date,
  submitted_date  date,
  review_deadline date,
  approved_date   date,
  month_year      text,
  notes           text,
  file_urls       text[],
  requires_obligation_keys text[],
  hours_logged    numeric,
  created_at      timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech');
  IF NOT FOUND THEN RAISE EXCEPTION 'access_denied: managers only'; END IF;

  RETURN QUERY
  SELECT
    d.id, d.title, d.phase, d.product,
    d.client_id, d.client_name, d.deal_id,
    d.assigned_to,
    COALESCE(p.full_name, d.assigned_to_name) AS assigned_name,
    d.owner_role, d.status,
    d.due_date, d.submitted_date, d.review_deadline, d.approved_date,
    d.month_year, d.notes, d.file_urls, d.requires_obligation_keys,
    COALESCE(tl.hours_sum, 0) AS hours_logged,
    d.created_at
  FROM deliverables d
  LEFT JOIN profiles p ON p.id = d.assigned_to
  LEFT JOIN (
    SELECT deliverable_id, SUM(hours) AS hours_sum
    FROM time_logs GROUP BY deliverable_id
  ) tl ON tl.deliverable_id = d.id
  WHERE
    (p_phase     IS NULL OR d.phase = p_phase)
    AND (p_status    IS NULL OR d.status = ANY(p_status))
    AND (p_client_id IS NULL OR d.client_id = p_client_id)
    AND (p_assigned  IS NULL OR d.assigned_to = p_assigned)
    AND (p_search    IS NULL OR d.title ILIKE '%'||p_search||'%'
                             OR d.client_name ILIKE '%'||p_search||'%')
  ORDER BY
    CASE d.status
      WHEN 'client_rejected'         THEN 1
      WHEN 'client_requested_changes' THEN 2
      WHEN 'awaiting_client'         THEN 3
      WHEN 'in_progress'             THEN 4
      WHEN 'not_started'             THEN 5
      ELSE 6
    END,
    d.due_date ASC NULLS LAST;
END;
$$;

-- Smoke
DO $$
BEGIN
  ASSERT (SELECT to_regprocedure('public.change_deliverable_status(uuid,text,text)') IS NOT NULL),
    'change_deliverable_status missing';
  ASSERT (SELECT to_regprocedure('public.log_time_on_deliverable(uuid,numeric,date,text)') IS NOT NULL),
    'log_time_on_deliverable missing';
END $$;
