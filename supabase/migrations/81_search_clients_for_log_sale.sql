-- Migration 81: RPC for searching existing clients in the Log Sale flow
-- Returns client info + active deal count + latest package for display

CREATE OR REPLACE FUNCTION public.search_clients_for_log_sale(p_search text DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  business_name text,
  contact_person text,
  phone text,
  email text,
  address text,
  whatsapp_number text,
  active_deal_count bigint,
  latest_package text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.business_name,
    c.contact_person,
    c.phone,
    c.email,
    c.address,
    c.whatsapp_number,
    (SELECT count(*) FROM deals d WHERE d.client_id = c.id AND d.pipeline_phase NOT IN ('archived'))::bigint AS active_deal_count,
    (SELECT d2.package FROM deals d2 WHERE d2.client_id = c.id ORDER BY d2.created_at DESC LIMIT 1) AS latest_package
  FROM clients c
  WHERE p_search IS NULL
     OR c.business_name ILIKE '%' || p_search || '%'
     OR c.contact_person ILIKE '%' || p_search || '%'
     OR c.phone ILIKE '%' || p_search || '%'
     OR c.email ILIKE '%' || p_search || '%'
  ORDER BY c.business_name
  LIMIT 20;
END;
$$;
