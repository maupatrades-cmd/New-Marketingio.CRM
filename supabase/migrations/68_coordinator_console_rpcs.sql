-- Coordinator Console — DB layer
-- Panels 1 (Verification Gate), 2 (Follow-Up Tracker),
-- 3 (Appointment Oversight), 5 (Obligations Board)

-- ── Schema additions ──────────────────────────────────────────────────────────

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS is_coordinator boolean NOT NULL DEFAULT false;
UPDATE user_roles SET is_coordinator = true WHERE role IN ('admin', 'owner');

ALTER TABLE leads ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
  CHECK (verification_status IN ('pending','verified','rejected'));
UPDATE leads SET verification_status = 'verified'  WHERE status IN ('verified','converted');
UPDATE leads SET verification_status = 'rejected'  WHERE status = 'rejected';

ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS is_coordinator_note boolean NOT NULL DEFAULT false;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- ── Panel 1: get_pending_lead_verifications ───────────────────────────────────

CREATE OR REPLACE FUNCTION get_pending_lead_verifications(p_limit int DEFAULT 50)
RETURNS TABLE (
  lead_id uuid, business_name text, contact_person text, phone text,
  submitted_by uuid, submitted_by_name text, submitted_by_role text,
  submitted_at timestamptz, hours_since_submission numeric,
  industry text, source text, notes text, has_docs boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    l.id, l.business_name, l.contact_person, l.phone,
    l.submitted_by,
    COALESCE(p.full_name, p.email, 'Unknown'),
    COALESCE(ur.role, 'unknown'),
    l.created_at,
    ROUND(EXTRACT(EPOCH FROM (now() - l.created_at)) / 3600, 1),
    l.industry, l.source, l.notes,
    false
  FROM leads l
  LEFT JOIN profiles p ON p.id = l.submitted_by
  LEFT JOIN user_roles ur ON ur.user_id = l.submitted_by
  WHERE l.verification_status = 'pending'
  ORDER BY l.created_at ASC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION get_pending_lead_verifications(int) TO authenticated;

-- ── Panel 2: get_team_follow_ups ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_team_follow_ups(p_filter text DEFAULT 'all')
RETURNS TABLE (
  task_id uuid, title text, description text,
  assigned_to uuid, assigned_to_name text, assigned_to_role text,
  lead_id uuid, lead_name text, client_id uuid, client_name text,
  due_date date, status text, created_at timestamptz,
  last_comment_at timestamptz, days_overdue int, urgency text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    t.id, t.title, t.description,
    t.assigned_to,
    COALESCE(p.full_name, p.email) AS assigned_to_name,
    COALESCE(ur.role, 'unassigned') AS assigned_to_role,
    NULL::uuid AS lead_id,
    d.client_name AS lead_name,
    t.client_id,
    c.business_name AS client_name,
    t.due_date, t.status, t.created_at,
    (SELECT MAX(tc.created_at) FROM task_comments tc WHERE tc.task_id = t.id),
    CASE WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE
         THEN (CURRENT_DATE - t.due_date) ELSE 0 END,
    CASE
      WHEN t.assigned_to IS NULL THEN 'unassigned'
      WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE THEN 'overdue'
      WHEN t.due_date = CURRENT_DATE THEN 'due_today'
      ELSE 'on_time'
    END
  FROM tasks t
  LEFT JOIN profiles p ON p.id = t.assigned_to
  LEFT JOIN user_roles ur ON ur.user_id = t.assigned_to
  LEFT JOIN deals d ON d.id = t.deal_id
  LEFT JOIN clients c ON c.id = t.client_id
  WHERE t.status IN ('open','in_progress')
    AND (
      p_filter = 'all'
      OR (p_filter = 'overdue'    AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE)
      OR (p_filter = 'unassigned' AND t.assigned_to IS NULL)
      OR (p_filter = 'due_today'  AND t.due_date = CURRENT_DATE)
    )
  ORDER BY
    CASE WHEN t.assigned_to IS NULL THEN 0
         WHEN t.due_date < CURRENT_DATE THEN 1
         WHEN t.due_date = CURRENT_DATE THEN 2
         ELSE 3 END,
    t.due_date ASC NULLS LAST
  LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION get_team_follow_ups(text) TO authenticated;

-- ── Panel 2: nudge_task_owner ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nudge_task_owner(
  p_task_id uuid,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_nudger_name text;
  v_msg text;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'task not found'); END IF;
  IF v_task.assigned_to IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no assignee'); END IF;

  SELECT COALESCE(full_name, email, 'Coordinator') INTO v_nudger_name FROM profiles WHERE id = auth.uid();
  v_msg := COALESCE(p_message, 'Your follow-up on "' || v_task.title || '" needs attention.');

  INSERT INTO client_notifications (user_id, title, body, deep_link, created_at)
  VALUES (
    v_task.assigned_to,
    '📣 Coordinator nudge',
    v_msg,
    CASE WHEN v_task.deal_id IS NOT NULL THEN '/owner/sales?focus=deal' ELSE '/owner/tasks' END,
    now()
  );

  INSERT INTO task_comments (task_id, user_id, body, is_coordinator_note, created_at)
  VALUES (p_task_id, auth.uid(), '[Coordinator nudge] ' || v_msg, true, now());

  RETURN jsonb_build_object('ok', true, 'nudged_user', v_task.assigned_to);
END;
$$;
GRANT EXECUTE ON FUNCTION nudge_task_owner(uuid, text) TO authenticated;

-- ── Panel 3: get_appointment_oversight ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_appointment_oversight(p_window_days int DEFAULT 7)
RETURNS TABLE (
  appointment_id uuid, appointment_type text, scheduled_at timestamptz,
  duration_minutes int, status text, confirmed_at timestamptz, location text,
  assigned_to uuid, assigned_to_name text,
  lead_id uuid, lead_name text, client_id uuid, client_name text,
  notes text, is_past boolean, hours_until numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.id, a.appointment_type, a.scheduled_at, a.duration_minutes,
    a.status, a.confirmed_at, a.location, a.assigned_to,
    COALESCE(p.full_name, p.email) AS assigned_to_name,
    a.lead_id, l.business_name, a.client_id, c.business_name,
    a.notes,
    a.scheduled_at < now(),
    ROUND(EXTRACT(EPOCH FROM (a.scheduled_at - now())) / 3600, 1)
  FROM appointments a
  LEFT JOIN profiles p ON p.id = a.assigned_to
  LEFT JOIN leads l ON l.id = a.lead_id
  LEFT JOIN clients c ON c.id = a.client_id
  WHERE a.status NOT IN ('cancelled')
    AND a.scheduled_at >= now() - INTERVAL '24 hours'
    AND a.scheduled_at <= now() + (p_window_days || ' days')::interval
  ORDER BY a.scheduled_at ASC
  LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION get_appointment_oversight(int) TO authenticated;

-- ── Panel 3: confirm_appointment ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION confirm_appointment(
  p_appointment_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_appt appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not found'); END IF;
  IF v_appt.status != 'scheduled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not in scheduled state');
  END IF;
  UPDATE appointments
  SET confirmed_at = now(),
      notes = CASE WHEN p_notes IS NOT NULL THEN COALESCE(notes || E'\n', '') || p_notes ELSE notes END
  WHERE id = p_appointment_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION confirm_appointment(uuid, text) TO authenticated;

-- ── Panel 5: get_open_obligations ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_open_obligations(p_scope text DEFAULT 'all')
RETURNS TABLE (
  obligation_id uuid, scope text, entity_id uuid, entity_name text,
  obligation_type text, description text, status text,
  due_date date, days_open int, is_blocker boolean,
  assigned_to uuid, assigned_to_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Client obligations
  IF p_scope IN ('all','client') THEN
    RETURN QUERY
    SELECT
      cop.id, 'client'::text, cop.client_id, c.business_name,
      cop.obligation_key, COALESCE(cop.label, cop.obligation_key),
      cop.status, cop.due_date::date,
      (CURRENT_DATE - cop.submitted_at::date),
      COALESCE(cop.blocking, false),
      cop.assigned_to,
      COALESCE(p.full_name, p.email)
    FROM client_obligations_progress cop
    LEFT JOIN clients c ON c.id = cop.client_id
    LEFT JOIN profiles p ON p.id = cop.assigned_to
    WHERE cop.status NOT IN ('completed','waived');
  END IF;

  -- Staff documents
  IF p_scope IN ('all','staff') THEN
    RETURN QUERY
    SELECT
      sd.id, 'staff'::text, sd.user_id, COALESCE(p2.full_name, p2.email, 'Unknown'),
      sd.document_type, sd.document_type,
      CASE WHEN sd.verified THEN 'verified' ELSE 'pending' END,
      NULL::date,
      (CURRENT_DATE - sd.uploaded_at::date),
      false,
      sd.user_id, COALESCE(p2.full_name, p2.email)
    FROM staff_documents sd
    LEFT JOIN profiles p2 ON p2.id = sd.user_id
    WHERE NOT sd.verified;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION get_open_obligations(text) TO authenticated;
