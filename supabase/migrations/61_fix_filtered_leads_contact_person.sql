-- Fix: get_filtered_leads and export_leads_csv referenced l.contact_name,
-- but the leads table column is contact_person. The RPC threw 42703 on every
-- call, so the All Leads page always rendered "no leads".

CREATE OR REPLACE FUNCTION get_filtered_leads(
  p_search          text       DEFAULT NULL,
  p_status          text[]     DEFAULT NULL,
  p_temperature     text[]     DEFAULT NULL,
  p_source          text       DEFAULT NULL,
  p_assigned_to     uuid       DEFAULT NULL,
  p_submitted_by    uuid       DEFAULT NULL,
  p_date_from       date       DEFAULT NULL,
  p_date_to         date       DEFAULT NULL,
  p_tags            text       DEFAULT NULL,
  p_area            text       DEFAULT NULL,
  p_has_open_tickets boolean   DEFAULT NULL,
  p_unverified_only boolean    DEFAULT FALSE,
  p_sort_col        text       DEFAULT 'created_at',
  p_sort_dir        text       DEFAULT 'desc',
  p_limit           int        DEFAULT 50,
  p_offset          int        DEFAULT 0
)
RETURNS TABLE (
  id               uuid,
  business_name    text,
  contact_name     text,
  phone            text,
  email            text,
  source           text,
  lead_temperature text,
  status           text,
  estimated_value_zar numeric,
  assigned_to      uuid,
  assigned_to_name text,
  submitted_by     uuid,
  submitted_by_name text,
  area_suburb      text,
  tags             text[],
  open_ticket_count int,
  last_activity_at timestamptz,
  created_at       timestamptz,
  total_count      bigint
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM user_roles
   WHERE user_id = auth.uid()
     AND role IN ('owner','admin','head_of_tech') LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'access_denied: managers only'; END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      l.id, l.business_name, l.contact_person AS contact_name, l.phone, l.email,
      l.source, l.lead_temperature, l.status, l.estimated_value_zar,
      l.assigned_to,
      p_a.full_name AS assigned_to_name,
      l.submitted_by,
      p_s.full_name AS submitted_by_name,
      l.area_suburb, l.tags,
      COALESCE(l.open_ticket_count, 0)::int AS open_ticket_count,
      l.last_activity_at, l.created_at
    FROM leads l
    LEFT JOIN profiles p_a ON p_a.id = l.assigned_to
    LEFT JOIN profiles p_s ON p_s.id = l.submitted_by
    WHERE
      (p_search IS NULL OR (
        l.business_name   ILIKE '%' || p_search || '%' OR
        l.contact_person  ILIKE '%' || p_search || '%' OR
        l.phone           ILIKE '%' || p_search || '%' OR
        l.email           ILIKE '%' || p_search || '%'
      ))
      AND (p_status      IS NULL OR l.status           = ANY(p_status))
      AND (p_temperature IS NULL OR l.lead_temperature = ANY(p_temperature))
      AND (p_source      IS NULL OR l.source           = p_source)
      AND (p_assigned_to IS NULL OR l.assigned_to      = p_assigned_to)
      AND (p_submitted_by IS NULL OR l.submitted_by    = p_submitted_by)
      AND (p_date_from   IS NULL OR l.created_at::date >= p_date_from)
      AND (p_date_to     IS NULL OR l.created_at::date <= p_date_to)
      AND (p_area        IS NULL OR l.area_suburb ILIKE '%' || p_area || '%')
      AND (p_tags        IS NULL OR l.tags @> ARRAY[p_tags])
      AND (p_has_open_tickets IS NULL OR
           (p_has_open_tickets = TRUE  AND COALESCE(l.open_ticket_count,0) > 0) OR
           (p_has_open_tickets = FALSE AND COALESCE(l.open_ticket_count,0) = 0))
      AND (p_unverified_only = FALSE OR (l.status = 'pending' AND l.verified_by IS NULL))
  )
  SELECT
    f.*,
    COUNT(*) OVER () AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort_col = 'business_name'    AND p_sort_dir = 'asc'  THEN f.business_name    END ASC,
    CASE WHEN p_sort_col = 'business_name'    AND p_sort_dir = 'desc' THEN f.business_name    END DESC,
    CASE WHEN p_sort_col = 'lead_temperature' AND p_sort_dir = 'asc'  THEN f.lead_temperature END ASC,
    CASE WHEN p_sort_col = 'lead_temperature' AND p_sort_dir = 'desc' THEN f.lead_temperature END DESC,
    CASE WHEN p_sort_col = 'status'           AND p_sort_dir = 'asc'  THEN f.status           END ASC,
    CASE WHEN p_sort_col = 'status'           AND p_sort_dir = 'desc' THEN f.status           END DESC,
    CASE WHEN p_sort_col = 'estimated_value_zar' AND p_sort_dir = 'asc'  THEN f.estimated_value_zar END ASC NULLS LAST,
    CASE WHEN p_sort_col = 'estimated_value_zar' AND p_sort_dir = 'desc' THEN f.estimated_value_zar END DESC NULLS LAST,
    CASE WHEN p_sort_col = 'last_activity_at' AND p_sort_dir = 'asc'  THEN f.last_activity_at END ASC NULLS LAST,
    CASE WHEN p_sort_col = 'last_activity_at' AND p_sort_dir = 'desc' THEN f.last_activity_at END DESC NULLS LAST,
    CASE WHEN p_sort_col = 'open_ticket_count' AND p_sort_dir = 'asc'  THEN f.open_ticket_count END ASC,
    CASE WHEN p_sort_col = 'open_ticket_count' AND p_sort_dir = 'desc' THEN f.open_ticket_count END DESC,
    CASE WHEN p_sort_dir = 'asc'  THEN f.created_at END ASC,
    CASE WHEN p_sort_dir = 'desc' THEN f.created_at END DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;

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
        '"' || REPLACE(COALESCE(l.contact_person,''),'"','""') || '"',
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
      AND (p_search IS NULL OR l.business_name ILIKE '%'||p_search||'%' OR l.contact_person ILIKE '%'||p_search||'%')
      AND (p_status IS NULL OR l.status = ANY(p_status))
      AND (p_temperature IS NULL OR l.lead_temperature = ANY(p_temperature))
    LIMIT 1000
  ) t;

  RETURN COALESCE(v_csv, '');
END; $$;
