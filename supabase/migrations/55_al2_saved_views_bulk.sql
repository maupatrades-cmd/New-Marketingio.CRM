-- saved_lead_views table
CREATE TABLE IF NOT EXISTS saved_lead_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  icon         text,
  filter_state jsonb NOT NULL DEFAULT '{}',
  is_default   boolean NOT NULL DEFAULT FALSE,
  is_shared    boolean NOT NULL DEFAULT FALSE,
  shared_by    uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_lead_views ENABLE ROW LEVEL SECURITY;

-- Users see their own views + shared views
CREATE POLICY "saved_views_select" ON saved_lead_views FOR SELECT
  USING (user_id = auth.uid() OR is_shared = TRUE);
CREATE POLICY "saved_views_insert" ON saved_lead_views FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "saved_views_update" ON saved_lead_views FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "saved_views_delete" ON saved_lead_views FOR DELETE
  USING (user_id = auth.uid());

-- Seed 6 default views for every owner (owner user_id)
DO $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT user_id INTO v_owner_id FROM user_roles WHERE role = 'owner' LIMIT 1;
  IF v_owner_id IS NULL THEN RETURN; END IF;

  INSERT INTO saved_lead_views (user_id, name, icon, filter_state, is_default, is_shared) VALUES
    (v_owner_id, 'All Leads',      '📋', '{}',                                                         TRUE, TRUE),
    (v_owner_id, 'Needs Triage',   '⏳', '{"status":["pending"],"unverified_only":true}',              TRUE, TRUE),
    (v_owner_id, 'Hot Leads',      '🔥', '{"temperature":["hot"]}',                                    TRUE, TRUE),
    (v_owner_id, 'My Assignments', '📌', '{"assigned_to":"__CURRENT_USER__"}',                         TRUE, TRUE),
    (v_owner_id, 'Rejected',       '❌', '{"status":["rejected"]}',                                    TRUE, TRUE),
    (v_owner_id, 'High Value',     '💰', '{"min_value":5000}',                                         TRUE, TRUE)
  ON CONFLICT DO NOTHING;
END $$;

-- batch_verify_leads
CREATE OR REPLACE FUNCTION batch_verify_leads(p_lead_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text; v_count int;
BEGIN
  IF array_length(p_lead_ids, 1) > 100 THEN RAISE EXCEPTION 'batch_too_large: max 100'; END IF;
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
  UPDATE leads SET status='verified', verified_by=auth.uid(), verified_date=CURRENT_DATE
   WHERE id = ANY(p_lead_ids) AND status <> 'verified';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- batch_reject_leads
CREATE OR REPLACE FUNCTION batch_reject_leads(p_lead_ids uuid[], p_reason text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text; v_count int;
BEGIN
  IF array_length(p_lead_ids, 1) > 100 THEN RAISE EXCEPTION 'batch_too_large: max 100'; END IF;
  IF trim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'validation: reason required'; END IF;
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
  UPDATE leads SET status='rejected', rejection_reason=trim(p_reason) WHERE id = ANY(p_lead_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- batch_assign_leads
CREATE OR REPLACE FUNCTION batch_assign_leads(p_lead_ids uuid[], p_assignee_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text; v_count int;
BEGIN
  IF array_length(p_lead_ids, 1) > 100 THEN RAISE EXCEPTION 'batch_too_large: max 100'; END IF;
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
  UPDATE leads SET assigned_to=p_assignee_id, assigned_at=now() WHERE id = ANY(p_lead_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- batch_set_temperature
CREATE OR REPLACE FUNCTION batch_set_temperature(p_lead_ids uuid[], p_temperature text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text; v_count int;
BEGIN
  IF array_length(p_lead_ids, 1) > 100 THEN RAISE EXCEPTION 'batch_too_large: max 100'; END IF;
  IF p_temperature NOT IN ('hot','warm','cold') THEN RAISE EXCEPTION 'invalid temperature'; END IF;
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
  UPDATE leads SET lead_temperature=p_temperature WHERE id = ANY(p_lead_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- batch_add_tag
CREATE OR REPLACE FUNCTION batch_add_tag(p_lead_ids uuid[], p_tag text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role text; v_count int;
BEGIN
  IF array_length(p_lead_ids, 1) > 100 THEN RAISE EXCEPTION 'batch_too_large: max 100'; END IF;
  IF trim(COALESCE(p_tag,'')) = '' THEN RAISE EXCEPTION 'tag required'; END IF;
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
  UPDATE leads SET tags = array_append(COALESCE(tags,'{}'), trim(p_tag))
   WHERE id = ANY(p_lead_ids) AND NOT (COALESCE(tags,'{}') @> ARRAY[trim(p_tag)]);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- export_leads_csv — returns CSV as text
CREATE OR REPLACE FUNCTION export_leads_csv(
  p_lead_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_temperature text[] DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_csv  text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;

  SELECT string_agg(row_to_csv, E'\n') INTO v_csv
  FROM (
    SELECT 'id,business_name,contact_name,phone,email,source,temperature,status,estimated_value,area,tags,assigned_to,submitted_by,created_at' AS row_to_csv
    UNION ALL
    SELECT
      concat_ws(',',
        '"' || REPLACE(l.id::text,'"','""') || '"',
        '"' || REPLACE(COALESCE(l.business_name,''),'"','""') || '"',
        '"' || REPLACE(COALESCE(l.contact_name,''),'"','""') || '"',
        '"' || REPLACE(COALESCE(l.phone,''),'"','""') || '"',
        '"' || REPLACE(COALESCE(l.email,''),'"','""') || '"',
        '"' || REPLACE(COALESCE(l.source,''),'"','""') || '"',
        '"' || REPLACE(COALESCE(l.lead_temperature,''),'"','""') || '"',
        '"' || REPLACE(COALESCE(l.status,''),'"','""') || '"',
        COALESCE(l.estimated_value_zar::text,''),
        '"' || REPLACE(COALESCE(l.area_suburb,''),'"','""') || '"',
        '"' || REPLACE(array_to_string(COALESCE(l.tags,'{}'),';'),'"','""') || '"',
        '"' || REPLACE(COALESCE(p_a.full_name,''),'"','""') || '"',
        '"' || REPLACE(COALESCE(p_s.full_name,''),'"','""') || '"',
        '"' || l.created_at::text || '"'
      )
    FROM leads l
    LEFT JOIN profiles p_a ON p_a.id = l.assigned_to
    LEFT JOIN profiles p_s ON p_s.id = l.submitted_by
    WHERE
      (p_lead_ids   IS NULL OR l.id = ANY(p_lead_ids))
      AND (p_search IS NULL OR l.business_name ILIKE '%'||p_search||'%' OR l.contact_name ILIKE '%'||p_search||'%')
      AND (p_status IS NULL OR l.status = ANY(p_status))
      AND (p_temperature IS NULL OR l.lead_temperature = ANY(p_temperature))
    LIMIT 1000
  ) t;

  RETURN COALESCE(v_csv, '');
END; $$;

-- get_lead_insights — returns jsonb with all insight data
CREATE OR REPLACE FUNCTION get_lead_insights()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;

  RETURN jsonb_build_object(
    'funnel', (
      SELECT jsonb_object_agg(status, cnt)
      FROM (SELECT status, COUNT(*) AS cnt FROM leads GROUP BY status) t
    ),
    'top_sources', (
      SELECT jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC)
      FROM (SELECT COALESCE(source,'unknown') AS source, COUNT(*) AS cnt FROM leads GROUP BY source ORDER BY cnt DESC LIMIT 8) t
    ),
    'top_performers', (
      SELECT jsonb_agg(jsonb_build_object('name', full_name, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT p.full_name, COUNT(*) AS cnt
        FROM leads l JOIN profiles p ON p.id = l.assigned_to
        WHERE l.assigned_to IS NOT NULL
        GROUP BY p.full_name ORDER BY cnt DESC LIMIT 8
      ) t
    ),
    'age_distribution', (
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT
          CASE
            WHEN age_days < 1  THEN 'today'
            WHEN age_days < 3  THEN '1-3d'
            WHEN age_days < 7  THEN '3-7d'
            WHEN age_days < 14 THEN '7-14d'
            ELSE '14d+'
          END AS bucket,
          COUNT(*) AS cnt
        FROM (SELECT EXTRACT(EPOCH FROM (now() - created_at))/86400 AS age_days FROM leads) t
        GROUP BY bucket
      ) t2
    ),
    'area_heatmap', (
      SELECT jsonb_agg(jsonb_build_object('area', area_suburb, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT area_suburb, COUNT(*) AS cnt
        FROM leads WHERE area_suburb IS NOT NULL AND area_suburb <> ''
        GROUP BY area_suburb ORDER BY cnt DESC LIMIT 10
      ) t
    ),
    'ticket_velocity', (
      SELECT jsonb_build_object(
        'avg_tickets_per_lead', ROUND(AVG(open_ticket_count)::numeric, 2),
        'total_open_tickets', SUM(open_ticket_count)
      )
      FROM leads WHERE open_ticket_count IS NOT NULL
    )
  );
END; $$;
