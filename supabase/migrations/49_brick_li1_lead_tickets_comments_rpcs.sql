-- ══════════════════════════════════════════════════════════════════════════════
-- BRICK LI1 — Lead Tickets + Comments + Triggers + RLS + RPCs
-- Locked: Tuesday 23 June 2026
-- Decisions: Q1=auto R250, Q2=3-day dispute window, Q3=5 tickets overwhelm,
--            Q4=all-with-access comments, Q6=inherit history, Q7=owner-only dials
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend leads ───────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS last_activity_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_type text,
  ADD COLUMN IF NOT EXISTS open_ticket_count  integer NOT NULL DEFAULT 0;

-- ── 2. lead_tickets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_tickets (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             uuid        NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  ticket_type_code    text        NOT NULL,

  from_user_id        uuid        NOT NULL REFERENCES auth.users(id),
  to_user_id          uuid        REFERENCES auth.users(id),
  to_role             text,

  subject             text        NOT NULL,
  body                text,
  priority            text        NOT NULL DEFAULT 'normal'
                                  CHECK (priority IN ('low','normal','high','urgent')),

  status              text        NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open','actioned','confirmed','closed','cancelled')),
  actioned_by         uuid        REFERENCES auth.users(id),
  actioned_at         timestamptz,
  actioned_notes      text,
  confirmed_by        uuid        REFERENCES auth.users(id),
  confirmed_at        timestamptz,
  confirmed_notes     text,
  auto_confirmed      boolean     NOT NULL DEFAULT false,
  dispute_deadline    timestamptz,   -- confirmed_at + 3 days when auto_confirmed=true
  closed_at           timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text,

  system_generated    boolean     NOT NULL DEFAULT false,
  related_deal_id     uuid        REFERENCES deals(id),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_tickets_lead_created_idx   ON lead_tickets(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_tickets_to_user_status_idx ON lead_tickets(to_user_id, status);
CREATE INDEX IF NOT EXISTS lead_tickets_to_role_status_idx ON lead_tickets(to_role, status);
CREATE INDEX IF NOT EXISTS lead_tickets_from_status_idx    ON lead_tickets(from_user_id, status);
CREATE INDEX IF NOT EXISTS lead_tickets_status_prio_idx    ON lead_tickets(status, priority DESC);
CREATE INDEX IF NOT EXISTS lead_tickets_system_idx         ON lead_tickets(system_generated, created_at);
CREATE INDEX IF NOT EXISTS lead_tickets_auto_confirm_idx   ON lead_tickets(status, actioned_at)
  WHERE status = 'actioned';

-- ── 3. lead_comments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_comments (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                  uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id                uuid        NOT NULL REFERENCES auth.users(id),
  body                     text        NOT NULL,
  in_reply_to_id           uuid        REFERENCES lead_comments(id),
  attachment_storage_path  text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  edited_at                timestamptz
);

CREATE INDEX IF NOT EXISTS lead_comments_lead_created_idx ON lead_comments(lead_id, created_at ASC);

-- ── 4. Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_lead_manager()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid()
      AND role IN ('owner','admin','head_of_tech')
  );
$$;

CREATE OR REPLACE FUNCTION has_lead_access(p_lead_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads WHERE id = p_lead_id
      AND (submitted_by = auth.uid() OR assigned_to = auth.uid())
  ) OR is_lead_manager();
$$;

-- ── 5. updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_lead_tickets_updated_at ON lead_tickets;
CREATE TRIGGER trg_lead_tickets_updated_at
  BEFORE UPDATE ON lead_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_lead_comments_updated_at ON lead_comments;
CREATE TRIGGER trg_lead_comments_updated_at
  BEFORE UPDATE ON lead_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ── 6. Activity sync + overwhelm trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_sync_lead_from_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_type  text;
  v_delta int := 0;
  v_new_count int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type  := 'ticket_opened';
    v_delta := 1;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = OLD.status THEN
      v_type := 'ticket_updated';
    ELSIF NEW.status = 'actioned' THEN
      v_type := 'ticket_actioned';
    ELSIF NEW.status IN ('confirmed','closed','cancelled') THEN
      v_type  := 'ticket_' || NEW.status;
      v_delta := -1;
    ELSE
      v_type := 'ticket_updated';
    END IF;
  END IF;

  UPDATE leads SET
    last_activity_at   = now(),
    last_activity_type = v_type,
    open_ticket_count  = GREATEST(0, open_ticket_count + v_delta)
  WHERE id = COALESCE(NEW.lead_id, OLD.lead_id)
  RETURNING open_ticket_count INTO v_new_count;

  -- Q3: overwhelm alert at exactly 5
  IF v_delta > 0 AND v_new_count = 5 THEN
    INSERT INTO client_notifications (
      recipient_user_id, notification_type, title, body, action_url
    )
    SELECT ur.user_id,
      'lead_overwhelmed',
      '⚠️ Lead overwhelmed: ' || COALESCE(l.business_name, 'Unknown'),
      'This lead now has 5+ open tickets. Review and close stale items.',
      '/owner/leads/' || COALESCE(NEW.lead_id, OLD.lead_id) || '/inbox'
    FROM user_roles ur, leads l
    WHERE ur.role = 'owner'
      AND l.id = COALESCE(NEW.lead_id, OLD.lead_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_tickets_sync ON lead_tickets;
CREATE TRIGGER trg_lead_tickets_sync
  AFTER INSERT OR UPDATE ON lead_tickets FOR EACH ROW
  EXECUTE FUNCTION trg_sync_lead_from_ticket();

CREATE OR REPLACE FUNCTION trg_sync_lead_from_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE leads SET last_activity_at = now(), last_activity_type = 'comment_added'
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_comments_sync ON lead_comments;
CREATE TRIGGER trg_lead_comments_sync
  AFTER INSERT ON lead_comments FOR EACH ROW EXECUTE FUNCTION trg_sync_lead_from_comment();

-- ── 7. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE lead_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_tickets_select ON lead_tickets;
CREATE POLICY lead_tickets_select ON lead_tickets FOR SELECT TO authenticated
  USING (
    is_lead_manager()
    OR from_user_id = auth.uid()
    OR to_user_id   = auth.uid()
    OR EXISTS (
      SELECT 1 FROM leads l WHERE l.id = lead_tickets.lead_id
        AND (l.submitted_by = auth.uid() OR l.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS lead_tickets_insert ON lead_tickets;
CREATE POLICY lead_tickets_insert ON lead_tickets FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid());

DROP POLICY IF EXISTS lead_tickets_update ON lead_tickets;
CREATE POLICY lead_tickets_update ON lead_tickets FOR UPDATE TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR is_lead_manager());

DROP POLICY IF EXISTS lead_comments_select ON lead_comments;
CREATE POLICY lead_comments_select ON lead_comments FOR SELECT TO authenticated
  USING (has_lead_access(lead_id));

DROP POLICY IF EXISTS lead_comments_insert ON lead_comments;
CREATE POLICY lead_comments_insert ON lead_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND has_lead_access(lead_id));

DROP POLICY IF EXISTS lead_comments_update ON lead_comments;
CREATE POLICY lead_comments_update ON lead_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid());

-- ── 8. RPCs ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_lead_ticket(
  p_lead_id uuid, p_ticket_type_code text,
  p_to_user_id uuid DEFAULT NULL, p_to_role text DEFAULT NULL,
  p_subject text DEFAULT NULL, p_body text DEFAULT NULL,
  p_priority text DEFAULT 'normal', p_related_deal_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid; v_lead leads%ROWTYPE; v_label text; v_subject text;
BEGIN
  IF NOT has_lead_access(p_lead_id) THEN RAISE EXCEPTION 'access_denied'; END IF;
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: lead %', p_lead_id; END IF;
  SELECT tt->>'label' INTO v_label FROM system_settings,
    jsonb_array_elements(value->'ticket_types') AS tt
  WHERE key = 'lead_ticket_types.v1' AND tt->>'code' = p_ticket_type_code;
  v_subject := COALESCE(p_subject,
    COALESCE(v_label, p_ticket_type_code) || ' — ' || COALESCE(v_lead.business_name,'Lead')
    || CASE WHEN v_lead.phone IS NOT NULL THEN ' ' || v_lead.phone ELSE '' END);
  INSERT INTO lead_tickets (lead_id, ticket_type_code, from_user_id, to_user_id, to_role,
    subject, body, priority, related_deal_id)
  VALUES (p_lead_id, p_ticket_type_code, auth.uid(), p_to_user_id, p_to_role,
    v_subject, p_body, p_priority, p_related_deal_id)
  RETURNING id INTO v_id;
  IF p_to_user_id IS NOT NULL THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
    VALUES (p_to_user_id, 'lead_ticket_opened', '📨 New ticket: ' || v_subject,
      COALESCE(p_body,''), '/owner/leads/' || p_lead_id || '/inbox');
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION action_lead_ticket(p_ticket_id uuid, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_t lead_tickets%ROWTYPE; v_notify uuid;
BEGIN
  SELECT * INTO v_t FROM lead_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: ticket %', p_ticket_id; END IF;
  IF v_t.status <> 'open' THEN RAISE EXCEPTION 'invalid_state: %', v_t.status; END IF;
  IF v_t.from_user_id <> auth.uid()
     AND COALESCE(v_t.to_user_id,'00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()
     AND NOT is_lead_manager() THEN RAISE EXCEPTION 'access_denied'; END IF;
  UPDATE lead_tickets SET status='actioned', actioned_by=auth.uid(),
    actioned_at=now(), actioned_notes=p_notes WHERE id=p_ticket_id;
  v_notify := CASE WHEN auth.uid()=v_t.from_user_id THEN v_t.to_user_id ELSE v_t.from_user_id END;
  IF v_notify IS NOT NULL THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
    VALUES (v_notify, 'lead_ticket_actioned', '✅ Actioned — confirm: ' || v_t.subject,
      COALESCE(p_notes,'Please confirm this has been done.'),
      '/owner/leads/' || v_t.lead_id || '/inbox');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_lead_ticket(p_ticket_id uuid, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_t lead_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM lead_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: ticket %', p_ticket_id; END IF;
  IF v_t.status <> 'actioned' THEN RAISE EXCEPTION 'invalid_state: %', v_t.status; END IF;
  IF v_t.actioned_by = auth.uid() AND NOT is_lead_manager() THEN
    RAISE EXCEPTION 'cannot_self_confirm'; END IF;
  UPDATE lead_tickets SET status='confirmed', confirmed_by=auth.uid(),
    confirmed_at=now(), confirmed_notes=p_notes WHERE id=p_ticket_id;
  IF v_t.actioned_by IS NOT NULL AND v_t.actioned_by <> auth.uid() THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
    VALUES (v_t.actioned_by, 'lead_ticket_confirmed', '🎉 Confirmed: ' || v_t.subject,
      COALESCE(p_notes,'The other party confirmed this ticket.'),
      '/owner/leads/' || v_t.lead_id || '/inbox');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION dispute_lead_ticket(p_ticket_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_t lead_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM lead_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: ticket %', p_ticket_id; END IF;
  IF v_t.status <> 'confirmed' OR NOT v_t.auto_confirmed THEN
    RAISE EXCEPTION 'not_disputable: only auto-confirmed tickets can be disputed'; END IF;
  IF v_t.dispute_deadline IS NOT NULL AND now() > v_t.dispute_deadline THEN
    RAISE EXCEPTION 'dispute_window_closed: 3-day period has expired'; END IF;
  IF v_t.from_user_id <> auth.uid()
     AND COALESCE(v_t.to_user_id,'00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid() THEN
    RAISE EXCEPTION 'access_denied'; END IF;
  UPDATE lead_tickets SET status='open', auto_confirmed=false,
    confirmed_by=NULL, confirmed_at=NULL,
    confirmed_notes='DISPUTED: ' || p_reason,
    actioned_by=NULL, actioned_at=NULL, actioned_notes=NULL
  WHERE id=p_ticket_id;
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
  SELECT ur.user_id, 'lead_ticket_disputed',
    '⚠️ Ticket disputed: ' || v_t.subject, p_reason,
    '/owner/leads/' || v_t.lead_id || '/inbox'
  FROM user_roles ur WHERE ur.role = 'owner';
END;
$$;

CREATE OR REPLACE FUNCTION close_lead_ticket(p_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_t lead_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM lead_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: ticket %', p_ticket_id; END IF;
  IF v_t.status NOT IN ('confirmed','actioned') THEN
    RAISE EXCEPTION 'invalid_state: got %', v_t.status; END IF;
  IF v_t.from_user_id <> auth.uid()
     AND COALESCE(v_t.to_user_id,'00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()
     AND NOT is_lead_manager() THEN RAISE EXCEPTION 'access_denied'; END IF;
  UPDATE lead_tickets SET status='closed', closed_at=now() WHERE id=p_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_lead_ticket(p_ticket_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_t lead_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM lead_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: ticket %', p_ticket_id; END IF;
  IF v_t.status <> 'open' THEN RAISE EXCEPTION 'invalid_state: can only cancel open tickets'; END IF;
  IF v_t.from_user_id <> auth.uid() AND NOT is_lead_manager() THEN
    RAISE EXCEPTION 'access_denied: only sender or manager can cancel'; END IF;
  UPDATE lead_tickets SET status='cancelled', cancelled_at=now(),
    cancellation_reason=p_reason WHERE id=p_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION add_lead_comment(
  p_lead_id uuid, p_body text,
  p_in_reply_to_id uuid DEFAULT NULL, p_attachment_storage_path text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT has_lead_access(p_lead_id) THEN RAISE EXCEPTION 'access_denied'; END IF;
  IF trim(COALESCE(p_body,'')) = '' THEN RAISE EXCEPTION 'validation: body cannot be empty'; END IF;
  INSERT INTO lead_comments (lead_id, author_id, body, in_reply_to_id, attachment_storage_path)
  VALUES (p_lead_id, auth.uid(), trim(p_body), p_in_reply_to_id, p_attachment_storage_path)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_my_inbox_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_to_me int; v_created int; v_assigned int; v_urgent int; v_overwhelmed int;
BEGIN
  SELECT COUNT(*) INTO v_to_me FROM lead_tickets
    WHERE to_user_id = auth.uid() AND status = 'open';
  SELECT COUNT(*) INTO v_created FROM leads WHERE submitted_by = auth.uid();
  SELECT COUNT(*) INTO v_assigned FROM leads
    WHERE assigned_to = auth.uid() AND status NOT IN ('rejected','converted');
  SELECT COUNT(*) INTO v_urgent FROM lead_tickets
    WHERE to_user_id = auth.uid() AND status = 'open' AND priority IN ('high','urgent');
  SELECT COUNT(*) INTO v_overwhelmed FROM leads
    WHERE open_ticket_count >= 5
      AND (submitted_by = auth.uid() OR assigned_to = auth.uid() OR is_lead_manager());
  RETURN jsonb_build_object(
    'open_tickets_to_me', v_to_me,   'leads_created',    v_created,
    'leads_assigned',     v_assigned, 'urgent_tickets',   v_urgent,
    'overwhelmed_leads',  v_overwhelmed
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_inbox_tickets(
  p_status text DEFAULT NULL, p_type_code text DEFAULT NULL,
  p_priority text DEFAULT NULL, p_from_user uuid DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid, lead_id uuid, ticket_type_code text,
  from_user_id uuid, from_user_name text,
  to_user_id uuid, to_user_name text, to_role text,
  subject text, body text, priority text, status text,
  actioned_by uuid, actioned_at timestamptz, actioned_notes text,
  confirmed_by uuid, confirmed_at timestamptz, confirmed_notes text,
  auto_confirmed boolean, dispute_deadline timestamptz,
  closed_at timestamptz, cancelled_at timestamptz, cancellation_reason text,
  system_generated boolean, related_deal_id uuid,
  created_at timestamptz, updated_at timestamptz,
  lead_business_name text, lead_phone text, lead_temperature text, lead_status text
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT lt.id, lt.lead_id, lt.ticket_type_code,
    lt.from_user_id, fp.full_name,
    lt.to_user_id,   tp.full_name,
    lt.to_role, lt.subject, lt.body, lt.priority, lt.status,
    lt.actioned_by, lt.actioned_at, lt.actioned_notes,
    lt.confirmed_by, lt.confirmed_at, lt.confirmed_notes,
    lt.auto_confirmed, lt.dispute_deadline,
    lt.closed_at, lt.cancelled_at, lt.cancellation_reason,
    lt.system_generated, lt.related_deal_id,
    lt.created_at, lt.updated_at,
    l.business_name, l.phone, l.lead_temperature, l.status
  FROM lead_tickets lt
  JOIN leads l ON l.id = lt.lead_id
  LEFT JOIN profiles fp ON fp.id = lt.from_user_id
  LEFT JOIN profiles tp ON tp.id = lt.to_user_id
  WHERE (is_lead_manager() OR lt.from_user_id=auth.uid() OR lt.to_user_id=auth.uid()
         OR l.submitted_by=auth.uid() OR l.assigned_to=auth.uid())
    AND (p_status    IS NULL OR lt.status           = p_status)
    AND (p_type_code IS NULL OR lt.ticket_type_code = p_type_code)
    AND (p_priority  IS NULL OR lt.priority         = p_priority)
    AND (p_from_user IS NULL OR lt.from_user_id     = p_from_user)
  ORDER BY
    CASE lt.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
      WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
    lt.created_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION get_lead_full_history(p_lead_id uuid)
RETURNS TABLE (
  entry_type text, entry_id uuid, actor_id uuid, actor_name text,
  event_label text, detail text, priority text, status text, created_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  IF NOT has_lead_access(p_lead_id) THEN RAISE EXCEPTION 'access_denied'; END IF;
  RETURN QUERY
  SELECT 'ticket'::text, lt.id, lt.from_user_id, COALESCE(fp.full_name,'Unknown'),
    lt.ticket_type_code || ': ' || lt.subject, lt.body, lt.priority, lt.status, lt.created_at
  FROM lead_tickets lt LEFT JOIN profiles fp ON fp.id = lt.from_user_id
  WHERE lt.lead_id = p_lead_id
  UNION ALL
  SELECT 'comment'::text, lc.id, lc.author_id, COALESCE(ap.full_name,'Unknown'),
    'Comment', lc.body, NULL::text, NULL::text, lc.created_at
  FROM lead_comments lc LEFT JOIN profiles ap ON ap.id = lc.author_id
  WHERE lc.lead_id = p_lead_id
  ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION reassign_lead_ticket(
  p_ticket_id uuid, p_new_to_user_id uuid, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_t lead_tickets%ROWTYPE;
BEGIN
  IF NOT is_lead_manager() THEN RAISE EXCEPTION 'access_denied: only manager can reassign'; END IF;
  SELECT * INTO v_t FROM lead_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: ticket %', p_ticket_id; END IF;
  UPDATE lead_tickets SET to_user_id = p_new_to_user_id WHERE id = p_ticket_id;
  IF p_new_to_user_id IS NOT NULL THEN
    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
    VALUES (p_new_to_user_id, 'lead_ticket_reassigned',
      '🔄 Reassigned to you: ' || v_t.subject,
      COALESCE(p_reason,'A ticket has been reassigned to you.'),
      '/owner/leads/' || v_t.lead_id || '/inbox');
  END IF;
END;
$$;

-- ── 9. Auto-confirm cron function ─────────────────────────────────────────────
-- Schedule via pg_cron: SELECT cron.schedule('auto-confirm-tickets','0 2 * * *',
--   'SELECT auto_confirm_stale_tickets()');
CREATE OR REPLACE FUNCTION auto_confirm_stale_tickets()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_t lead_tickets%ROWTYPE;
BEGIN
  FOR v_t IN
    SELECT * FROM lead_tickets
    WHERE status = 'actioned' AND actioned_at < now() - interval '7 days'
  LOOP
    UPDATE lead_tickets SET
      status           = 'confirmed',
      confirmed_by     = actioned_by,
      confirmed_at     = now(),
      confirmed_notes  = 'Auto-confirmed after 7 days with no response.',
      auto_confirmed   = true,
      dispute_deadline = now() + interval '3 days'
    WHERE id = v_t.id;

    INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url)
    SELECT u, 'lead_ticket_auto_confirmed',
      '⏱ Auto-confirmed: ' || v_t.subject,
      'This ticket was auto-confirmed after 7 days. You have 3 days to dispute.',
      '/owner/leads/' || v_t.lead_id || '/inbox'
    FROM unnest(ARRAY[v_t.from_user_id, v_t.to_user_id]) AS u
    WHERE u IS NOT NULL;
  END LOOP;
END;
$$;

-- ── 10. Smoke guard ───────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT to_regclass('public.lead_tickets')  IS NOT NULL), 'lead_tickets missing';
  ASSERT (SELECT to_regclass('public.lead_comments') IS NOT NULL), 'lead_comments missing';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name='leads'
            AND column_name IN ('last_activity_at','last_activity_type','open_ticket_count')
         ) = 3, 'leads extension columns missing';
END;
$$;
