-- Migration 60: DEL4 — Crons, storage buckets, quality/productivity RPCs

-- ─── a) Add missing column ───────────────────────────────────────────────────
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS deemed_approved_at timestamptz;

-- ─── b) generate_recurring_deliverables_batch ────────────────────────────────
-- NOTE: deal_services table does not exist yet; returns 0 until it is created.
CREATE OR REPLACE FUNCTION generate_recurring_deliverables_batch()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- deal_services table does not exist yet; skipping recurring spawn logic.
  RETURN v_count;
END;
$$;

-- ─── c) get_quality_stats ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_quality_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech');
  IF NOT FOUND THEN RAISE EXCEPTION 'access_denied'; END IF;

  SELECT jsonb_build_object(
    'avg_rating', ROUND(AVG(df.rating)::numeric, 2),
    'total_feedback', COUNT(df.id),
    'low_ratings', COUNT(CASE WHEN df.rating <= 2 THEN 1 END),
    'by_staff', (
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT p.full_name, ROUND(AVG(df2.rating)::numeric,2) AS avg_rating, COUNT(df2.id) AS count
        FROM deliverable_feedback df2
        JOIN deliverables d2 ON d2.feedback_id = df2.id
        JOIN profiles p ON p.id = d2.assigned_to
        GROUP BY p.full_name ORDER BY avg_rating ASC
      ) s
    ),
    'by_product', (
      SELECT jsonb_agg(row_to_json(p))
      FROM (
        SELECT d3.product, ROUND(AVG(df3.rating)::numeric,2) AS avg_rating, COUNT(df3.id) AS count
        FROM deliverable_feedback df3
        JOIN deliverables d3 ON d3.feedback_id = df3.id
        GROUP BY d3.product ORDER BY avg_rating ASC
      ) p
    ),
    'recent_low', (
      SELECT jsonb_agg(row_to_json(r))
      FROM (
        SELECT df4.rating, df4.comment, d4.title, d4.client_name, df4.created_at
        FROM deliverable_feedback df4
        JOIN deliverables d4 ON d4.feedback_id = df4.id
        WHERE df4.rating <= 2
        ORDER BY df4.created_at DESC LIMIT 10
      ) r
    )
  ) INTO v_result
  FROM deliverable_feedback df;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ─── d) get_productivity_stats ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_productivity_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech');
  IF NOT FOUND THEN RAISE EXCEPTION 'access_denied'; END IF;

  SELECT jsonb_build_object(
    'total_hours', ROUND(SUM(tl.hours)::numeric, 1),
    'this_month_hours', ROUND(SUM(CASE WHEN tl.date_worked >= date_trunc('month', now()) THEN tl.hours ELSE 0 END)::numeric, 1),
    'by_staff', (
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT p.full_name, ROUND(SUM(tl2.hours)::numeric,1) AS hours,
               COUNT(DISTINCT tl2.deliverable_id) AS deliverables
        FROM time_logs tl2 JOIN profiles p ON p.id = tl2.staff_id
        GROUP BY p.full_name ORDER BY hours DESC
      ) s
    ),
    'by_client', (
      SELECT jsonb_agg(row_to_json(c))
      FROM (
        SELECT d.client_name, ROUND(SUM(tl3.hours)::numeric,1) AS hours
        FROM time_logs tl3 JOIN deliverables d ON d.id = tl3.deliverable_id
        GROUP BY d.client_name ORDER BY hours DESC LIMIT 15
      ) c
    ),
    'overruns', (
      SELECT jsonb_agg(row_to_json(o))
      FROM (
        SELECT d.title, d.client_name, d.product,
               ROUND(SUM(tl4.hours)::numeric,1) AS hours_logged,
               COALESCE(ft.soft_sla_days,14)*8 AS expected_hours
        FROM time_logs tl4
        JOIN deliverables d ON d.id = tl4.deliverable_id
        LEFT JOIN fulfilment_templates ft ON ft.id = d.template_id
        GROUP BY d.title, d.client_name, d.product, ft.soft_sla_days
        HAVING SUM(tl4.hours) > COALESCE(ft.soft_sla_days,14)*8
        ORDER BY hours_logged DESC LIMIT 20
      ) o
    )
  ) INTO v_result FROM time_logs tl;
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ─── e) Cron: sweep deemed approved (04:00 UTC = 06:00 SAST) ─────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sweep-deemed-approved';

SELECT cron.schedule(
  'sweep-deemed-approved',
  '0 4 * * *',
  $CRON$
  WITH updated AS (
    UPDATE deliverables SET
      status = 'deemed_approved',
      approved_date = CURRENT_DATE,
      deemed_approved_at = now(),
      updated_at = now()
    WHERE status IN ('awaiting_client','client_reviewing')
      AND review_deadline IS NOT NULL
      AND review_deadline < CURRENT_DATE
    RETURNING id
  ),
  cnt AS (SELECT COUNT(*) AS n FROM updated)
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, is_read, created_at)
  SELECT ur.user_id,
    'deliverable_deemed_approved',
    (SELECT n::text FROM cnt) || ' deliverables auto-approved today',
    (SELECT n::text FROM cnt) || ' deliverables were auto-approved as deemed approved today.',
    FALSE,
    now()
  FROM user_roles ur
  WHERE ur.role IN ('owner','admin')
    AND (SELECT n FROM cnt) > 0;
  $CRON$
);

-- ─── f) Cron: generate recurring deliverables (04:05 UTC = 06:05 SAST) ───────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'generate-recurring-deliverables';

SELECT cron.schedule(
  'generate-recurring-deliverables',
  '5 4 * * *',
  $CRON$ SELECT generate_recurring_deliverables_batch(); $CRON$
);

-- ─── g) Cron: remind client review (07:00 UTC = 09:00 SAST) ─────────────────
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'remind-client-review';

SELECT cron.schedule(
  'remind-client-review',
  '0 7 * * *',
  $CRON$
  INSERT INTO client_notifications (recipient_user_id, notification_type, title, body, action_url, is_read, created_at)
  SELECT c.client_user_id,
    'obligation_reminder',
    CASE WHEN d.review_deadline = CURRENT_DATE + 2 THEN '2-day review reminder'
         ELSE '1-day review reminder' END,
    'Your deliverable "' || d.title || '" requires review by ' || d.review_deadline::text || '.',
    '/client/deliverables',
    FALSE,
    now()
  FROM deliverables d
  JOIN clients c ON c.id = d.client_id
  WHERE d.status IN ('awaiting_client','client_reviewing')
    AND d.review_deadline IN (CURRENT_DATE + 2, CURRENT_DATE + 1)
    AND c.client_user_id IS NOT NULL;
  $CRON$
);

-- ─── h) Storage buckets ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('deliverables', 'deliverables', FALSE, 26214400, ARRAY['image/*','application/pdf','video/mp4','application/zip']),
  ('client-submissions', 'client-submissions', FALSE, 26214400, ARRAY['image/*','application/pdf','video/mp4','application/zip'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff_deliverables_all" ON storage.objects;
CREATE POLICY "staff_deliverables_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'deliverables'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech','field_agent','cpc'))
  )
  WITH CHECK (
    bucket_id = 'deliverables'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech','field_agent','cpc'))
  );

DROP POLICY IF EXISTS "client_deliverables_read" ON storage.objects;
CREATE POLICY "client_deliverables_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'deliverables'
    AND EXISTS (
      SELECT 1 FROM clients c
      JOIN deliverables d ON d.client_id = c.id
      WHERE c.client_user_id = auth.uid()
        AND (storage.foldername(name))[1] = d.id::text
    )
  );

DROP POLICY IF EXISTS "client_submissions_upload" ON storage.objects;
CREATE POLICY "client_submissions_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-submissions'
    AND EXISTS (SELECT 1 FROM clients WHERE client_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "staff_submissions_read" ON storage.objects;
CREATE POLICY "staff_submissions_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-submissions'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech'))
  );

-- ─── i) Lead ticket types (create types key if missing) ──────────────────────
UPDATE system_settings
SET value = jsonb_set(
  value,
  '{types}',
  COALESCE(value->'types', '[]'::jsonb) || '[
    {"code":"deliverable_ready_for_review","label":"Deliverable ready for review","assignable_roles":["owner","admin"],"auto_close_days":3},
    {"code":"deliverable_changes_requested","label":"Changes requested by client","assignable_roles":["owner","admin","head_of_tech"],"auto_close_days":5},
    {"code":"deliverable_rejected","label":"Deliverable rejected by client","assignable_roles":["owner","admin"],"auto_close_days":null},
    {"code":"client_obligation_needed","label":"Client obligation needed","assignable_roles":["owner","admin","head_of_tech"],"auto_close_days":7},
    {"code":"verify_client_obligation","label":"Verify client obligation","assignable_roles":["owner","admin","head_of_tech"],"auto_close_days":2}
  ]'::jsonb,
  TRUE
)
WHERE key = 'lead_ticket_types.v1';
