-- ══════════════════════════════════════════════════════════════════════
-- BRICK DEL1 Part A — Schema, Tables, RLS, RPCs, Trigger
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Extend deliverables status check ───────────────────────────────
ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS deliverables_status_check;
ALTER TABLE deliverables
  ADD CONSTRAINT deliverables_status_check CHECK (status = ANY (ARRAY[
    'not_started','in_progress','awaiting_client','client_reviewing',
    'approved','deemed_approved','completed','blocked',
    'client_requested_changes','client_rejected'
  ]));

-- ── 2. Extend deliverables with new columns ────────────────────────────
ALTER TABLE deliverables
  ADD COLUMN IF NOT EXISTS submitted_by             uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_by              uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_by              uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason         text,
  ADD COLUMN IF NOT EXISTS changes_requested_notes  text,
  ADD COLUMN IF NOT EXISTS feedback_id              uuid,
  ADD COLUMN IF NOT EXISTS requires_obligation_keys text[] DEFAULT '{}';

-- ── 3. Add structured obligations config to fulfilment_templates ───────
ALTER TABLE fulfilment_templates
  ADD COLUMN IF NOT EXISTS client_obligations_config jsonb DEFAULT '[]';

-- ── 4. TABLE: time_logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id  uuid        NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  staff_id        uuid        NOT NULL REFERENCES auth.users(id),
  hours           numeric(4,2) NOT NULL CHECK (hours > 0),
  date_worked     date        NOT NULL DEFAULT CURRENT_DATE,
  description     text,
  phase           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_logs_staff_date  ON time_logs(staff_id, date_worked DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_deliverable ON time_logs(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_date_worked ON time_logs(date_worked);

ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_logs_select" ON time_logs FOR SELECT USING (
  staff_id = auth.uid()
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
);
CREATE POLICY "time_logs_insert" ON time_logs FOR INSERT WITH CHECK (staff_id = auth.uid());
CREATE POLICY "time_logs_update" ON time_logs FOR UPDATE USING (
  staff_id = auth.uid() AND created_at > now() - INTERVAL '24 hours'
);
CREATE POLICY "time_logs_delete" ON time_logs FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'owner')
);

-- ── 5. TABLE: deliverable_feedback ────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverable_feedback (
  id                    uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id        uuid      NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  client_id             uuid      NOT NULL REFERENCES clients(id),
  rating                smallint  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment               text,
  annotations           jsonb,
  video_frame_feedback  jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_del_feedback_deliverable ON deliverable_feedback(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_del_feedback_client      ON deliverable_feedback(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_del_feedback_rating      ON deliverable_feedback(rating);

ALTER TABLE deliverable_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "del_feedback_select" ON deliverable_feedback FOR SELECT USING (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.client_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
);
CREATE POLICY "del_feedback_insert" ON deliverable_feedback FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.client_user_id = auth.uid())
);
CREATE POLICY "del_feedback_delete" ON deliverable_feedback FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'owner')
);

-- ── 6. TABLE: deliverable_status_history ──────────────────────────────
CREATE TABLE IF NOT EXISTS deliverable_status_history (
  id              uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id  uuid      NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  from_status     text,
  to_status       text      NOT NULL,
  changed_by      uuid      REFERENCES auth.users(id),
  changed_by_role text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_del_history_deliverable ON deliverable_status_history(deliverable_id, created_at DESC);

ALTER TABLE deliverable_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "del_history_select" ON deliverable_status_history FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM deliverables d
    WHERE d.id = deliverable_id AND (
      d.assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
      OR EXISTS (SELECT 1 FROM clients c WHERE c.id = d.client_id AND c.client_user_id = auth.uid())
    )
  )
);

-- ── 7. TABLE: client_obligations_progress ─────────────────────────────
CREATE TABLE IF NOT EXISTS client_obligations_progress (
  id                uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           uuid      NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  client_id         uuid      REFERENCES clients(id),
  template_id       uuid      REFERENCES fulfilment_templates(id),
  obligation_key    text      NOT NULL,
  obligation_label  text      NOT NULL,
  status            text      NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','submitted','verified','rejected','waived_by_admin')),
  submitted_at      timestamptz,
  submitted_files   text[],
  submitted_notes   text,
  verified_by       uuid      REFERENCES auth.users(id),
  verified_at       timestamptz,
  rejection_reason  text,
  waived_reason     text,
  due_date          date,
  blocking          boolean   NOT NULL DEFAULT TRUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_obligations_deal   ON client_obligations_progress(deal_id);
CREATE INDEX IF NOT EXISTS idx_obligations_client ON client_obligations_progress(client_id);
CREATE INDEX IF NOT EXISTS idx_obligations_status ON client_obligations_progress(status)
  WHERE status NOT IN ('verified','waived_by_admin');

ALTER TABLE client_obligations_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obligations_select" ON client_obligations_progress FOR SELECT USING (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.client_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
);
CREATE POLICY "obligations_update" ON client_obligations_progress FOR UPDATE USING (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.client_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
);

-- ── 8. LB-009 RLS fix — add deal closer + separate insert/update ───────
DROP POLICY IF EXISTS deliverables_read        ON deliverables;
DROP POLICY IF EXISTS deliverables_write       ON deliverables;
DROP POLICY IF EXISTS deliverables_select      ON deliverables;
DROP POLICY IF EXISTS deliverables_update_staff ON deliverables;
DROP POLICY IF EXISTS deliverables_insert_staff ON deliverables;

ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliverables_select" ON deliverables FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
  OR assigned_to = auth.uid()
  OR EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_id AND (d.closer_id = auth.uid() OR d.cpc_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.client_user_id = auth.uid())
);
CREATE POLICY "deliverables_update_staff" ON deliverables FOR UPDATE USING (
  assigned_to = auth.uid()
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
);
CREATE POLICY "deliverables_insert_staff" ON deliverables FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
);

-- ── 9. deliverable_rules.v1 in system_settings ────────────────────────
INSERT INTO system_settings (key, value) VALUES (
  'deliverable_rules.v1',
  jsonb_build_object(
    'review_window_days', 5,
    'overrun_threshold_multiplier', 2,
    'low_rating_alert_threshold', 3,
    'deemed_approved_notify_days_before', ARRAY[2, 1],
    'file_size_limit_mb', 25,
    'client_obligations_enforcement', 'enforce',
    'recurring_generate_day_of_month', 1,
    'locked_at', '2026-06-23',
    'locked_by', 'Thapelo Maupa'
  )
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── 10. spawn_deliverables_for_deal RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION spawn_deliverables_for_deal(p_deal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deal          deals%ROWTYPE;
  v_client        clients%ROWTYPE;
  v_template      fulfilment_templates%ROWTYPE;
  v_setup_item    jsonb;
  v_recur_item    jsonb;
  v_obligation    jsonb;
  v_new_del_id    uuid;
  v_spawned_setup int := 0;
  v_spawned_recur int := 0;
  v_spawned_oblig int := 0;
  v_rules         jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech');
    IF NOT FOUND THEN RAISE EXCEPTION 'access_denied: managers only'; END IF;
  END IF;

  SELECT * INTO v_deal FROM deals WHERE id = p_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: deal %', p_deal_id; END IF;

  SELECT * INTO v_client FROM clients WHERE id = v_deal.client_id;
  SELECT value INTO v_rules FROM system_settings WHERE key = 'deliverable_rules.v1';

  -- Prevent double-spawn
  IF EXISTS (SELECT 1 FROM deliverables WHERE deal_id = p_deal_id AND is_custom = FALSE) THEN
    RETURN jsonb_build_object('already_spawned', true, 'deal_id', p_deal_id);
  END IF;

  SELECT * INTO v_template FROM fulfilment_templates
   WHERE code = v_deal.package AND is_active = TRUE;

  IF FOUND THEN
    -- Setup deliverables
    FOR v_setup_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.setup_deliverables, '[]'))
    LOOP
      INSERT INTO deliverables (
        client_id, client_name, deal_id, template_id,
        title, phase, product, owner_role, status,
        due_date, requires_obligation_keys, is_custom
      ) VALUES (
        v_deal.client_id,
        COALESCE(v_client.business_name, v_client.contact_person),
        p_deal_id, v_template.id,
        v_setup_item->>'title', 'setup', v_template.name,
        v_template.internal_owner_role, 'not_started',
        CURRENT_DATE + COALESCE((v_setup_item->>'sla_days')::int, v_template.soft_sla_days, 14),
        '{}', FALSE
      ) RETURNING id INTO v_new_del_id;

      INSERT INTO deliverable_status_history (deliverable_id, from_status, to_status, changed_by_role, notes)
      VALUES (v_new_del_id, NULL, 'not_started', 'system', 'Auto-spawned from setup fee paid');
      v_spawned_setup := v_spawned_setup + 1;
    END LOOP;

    -- Recurring deliverables (next month)
    FOR v_recur_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.recurring_deliverables, '[]'))
    LOOP
      INSERT INTO deliverables (
        client_id, client_name, deal_id, template_id,
        title, phase, product, owner_role, status,
        month_year, due_date, requires_obligation_keys, is_custom
      ) VALUES (
        v_deal.client_id,
        COALESCE(v_client.business_name, v_client.contact_person),
        p_deal_id, v_template.id,
        v_recur_item->>'title', 'monthly_recurring', v_template.name,
        v_template.internal_owner_role, 'not_started',
        to_char(date_trunc('month', now()) + INTERVAL '1 month', 'YYYY-MM'),
        (date_trunc('month', now()) + INTERVAL '1 month' + INTERVAL '9 days')::date,
        '{}', FALSE
      ) RETURNING id INTO v_new_del_id;

      INSERT INTO deliverable_status_history (deliverable_id, from_status, to_status, changed_by_role, notes)
      VALUES (v_new_del_id, NULL, 'not_started', 'system', 'Auto-spawned recurring deliverable');
      v_spawned_recur := v_spawned_recur + 1;
    END LOOP;

    -- Client obligations
    FOR v_obligation IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.client_obligations_config, '[]'))
    LOOP
      INSERT INTO client_obligations_progress (
        deal_id, client_id, template_id,
        obligation_key, obligation_label, status, blocking, due_date
      ) VALUES (
        p_deal_id, v_deal.client_id, v_template.id,
        v_obligation->>'key', v_obligation->>'label',
        'pending',
        COALESCE((v_obligation->>'blocking')::boolean, TRUE),
        CURRENT_DATE + COALESCE(v_template.soft_sla_days, 14)
      ) ON CONFLICT DO NOTHING;
      v_spawned_oblig := v_spawned_oblig + 1;
    END LOOP;
  END IF;

  -- Notify owner/admin
  INSERT INTO client_notifications (
    recipient_user_id, notification_type, title, body,
    related_entity_type, related_entity_id, action_url
  )
  SELECT ur.user_id, 'system_update',
    '📋 Deliverables spawned for ' || COALESCE(v_client.business_name, 'client'),
    v_spawned_setup || ' setup + ' || v_spawned_recur || ' recurring created',
    'deal', p_deal_id, '/owner/fulfilment'
  FROM user_roles ur WHERE ur.role IN ('owner','admin');

  -- Audit
  INSERT INTO audit_log (table_name, row_id, action, actor_id, after_data)
  VALUES (
    'deals', p_deal_id::text, 'spawn_deliverables',
    COALESCE(auth.uid(), (SELECT user_id FROM user_roles WHERE role='owner' LIMIT 1)),
    jsonb_build_object(
      'spawned_setup', v_spawned_setup, 'spawned_recurring', v_spawned_recur,
      'spawned_obligations', v_spawned_oblig, 'template_code', v_deal.package
    )
  );

  RETURN jsonb_build_object(
    'deal_id', p_deal_id,
    'spawned_setup', v_spawned_setup,
    'spawned_recurring', v_spawned_recur,
    'spawned_obligations', v_spawned_oblig
  );
END;
$$;

-- ── 11. Trigger on deals.setup_fee_cleared_date ───────────────────────
CREATE OR REPLACE FUNCTION trg_spawn_deliverables_on_setup_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.setup_fee_cleared_date IS NULL AND NEW.setup_fee_cleared_date IS NOT NULL THEN
    PERFORM spawn_deliverables_for_deal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spawn_deliverables ON deals;
CREATE TRIGGER trg_spawn_deliverables
  AFTER UPDATE OF setup_fee_cleared_date ON deals
  FOR EACH ROW EXECUTE FUNCTION trg_spawn_deliverables_on_setup_fee();

-- ── Smoke ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT to_regprocedure('public.spawn_deliverables_for_deal(uuid)') IS NOT NULL),
    'spawn_deliverables_for_deal missing';
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name='deliverables' AND column_name='requires_obligation_keys') = 1,
    'deliverables.requires_obligation_keys missing';
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='time_logs') = 1,
    'time_logs table missing';
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='deliverable_feedback') = 1,
    'deliverable_feedback table missing';
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='client_obligations_progress') = 1,
    'client_obligations_progress table missing';
END $$;
