-- 64_pipeline_insights_rpc.sql
-- get_pipeline_insights(): analytics panel for the deal pipeline.
-- Returns a single JSONB object with:
--   stage_funnel        — count of deals currently in each working stage
--   avg_days_per_stage  — average days a deal spends in each stage (from deal_stage_history)
--   stage_conversion    — % of deals that exited a stage via forward move (vs closed_lost)
--   win_loss            — closed_won / closed_lost counts + win_rate for rolling 90 days
--   monthly_won         — won count per month for the last 6 months
-- Role guard: owner / admin / head_of_tech only (field_agent / cpc see their own deals).

CREATE OR REPLACE FUNCTION public.get_pipeline_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role          text;
  v_uid           uuid := auth.uid();

  -- stage funnel
  v_funnel        jsonb;
  -- avg days per stage
  v_avg_days      jsonb;
  -- stage conversion rates
  v_conversion    jsonb;
  -- win/loss rolling 90d
  v_win_loss      jsonb;
  -- monthly won (last 6 months)
  v_monthly_won   jsonb;

  v_won_90        integer;
  v_lost_90       integer;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = v_uid LIMIT 1;

  -- ── 1. Stage funnel (active working deals) ────────────────────────────────
  SELECT jsonb_object_agg(stage, cnt)
  INTO   v_funnel
  FROM (
    SELECT stage, count(*) AS cnt
    FROM   deals
    WHERE  pipeline_phase = 'working'
      AND  stage NOT IN ('closed_won','closed_lost')
      AND  (v_role IN ('owner','admin','head_of_tech')
            OR closer_id = v_uid
            OR cpc_id    = v_uid)
    GROUP  BY stage
  ) t;

  -- ── 2. Average days per stage (from history) ─────────────────────────────
  SELECT jsonb_object_agg(to_stage, round(avg_d))
  INTO   v_avg_days
  FROM (
    SELECT to_stage,
           avg(EXTRACT(epoch FROM (entered_at - LAG(entered_at) OVER (PARTITION BY deal_id ORDER BY entered_at))) / 86400) AS avg_d
    FROM   deal_stage_history
    GROUP  BY to_stage
    HAVING avg(EXTRACT(epoch FROM (entered_at - LAG(entered_at) OVER (PARTITION BY deal_id ORDER BY entered_at))) / 86400) IS NOT NULL
  ) t;

  -- ── 3. Stage conversion rate (forward exits / total exits per from_stage) ─
  SELECT jsonb_object_agg(from_stage, round((forward_exits::numeric / NULLIF(total_exits,0)) * 100))
  INTO   v_conversion
  FROM (
    SELECT
      from_stage,
      count(*) FILTER (WHERE to_stage NOT IN ('closed_lost')) AS forward_exits,
      count(*)                                                 AS total_exits
    FROM   deal_stage_history
    WHERE  from_stage IS NOT NULL
      AND  from_stage NOT IN ('closed_won','closed_lost')
    GROUP  BY from_stage
  ) t;

  -- ── 4. Win / loss — rolling 90 days ──────────────────────────────────────
  SELECT
    count(*) FILTER (WHERE stage = 'closed_won')  INTO v_won_90
  FROM deals
  WHERE updated_at >= CURRENT_TIMESTAMP - interval '90 days'
    AND stage IN ('closed_won','closed_lost')
    AND (v_role IN ('owner','admin','head_of_tech') OR closer_id = v_uid OR cpc_id = v_uid);

  SELECT count(*) FILTER (WHERE stage = 'closed_lost') INTO v_lost_90
  FROM deals
  WHERE updated_at >= CURRENT_TIMESTAMP - interval '90 days'
    AND stage IN ('closed_won','closed_lost')
    AND (v_role IN ('owner','admin','head_of_tech') OR closer_id = v_uid OR cpc_id = v_uid);

  v_win_loss := jsonb_build_object(
    'won',      COALESCE(v_won_90,  0),
    'lost',     COALESCE(v_lost_90, 0),
    'win_rate', CASE WHEN COALESCE(v_won_90,0) + COALESCE(v_lost_90,0) = 0 THEN 0
                     ELSE round((v_won_90::numeric / (v_won_90 + v_lost_90)) * 100)
                END
  );

  -- ── 5. Monthly won — last 6 months ───────────────────────────────────────
  SELECT jsonb_object_agg(mo, cnt)
  INTO   v_monthly_won
  FROM (
    SELECT to_char(date_trunc('month', updated_at), 'Mon YY') AS mo,
           count(*) AS cnt
    FROM   deals
    WHERE  stage = 'closed_won'
      AND  updated_at >= date_trunc('month', CURRENT_DATE) - interval '5 months'
      AND  (v_role IN ('owner','admin','head_of_tech') OR closer_id = v_uid OR cpc_id = v_uid)
    GROUP  BY date_trunc('month', updated_at)
    ORDER  BY date_trunc('month', updated_at)
  ) t;

  RETURN jsonb_build_object(
    'stage_funnel',       COALESCE(v_funnel,       '{}'),
    'avg_days_per_stage', COALESCE(v_avg_days,     '{}'),
    'stage_conversion',   COALESCE(v_conversion,   '{}'),
    'win_loss',           COALESCE(v_win_loss,      '{"won":0,"lost":0,"win_rate":0}'),
    'monthly_won',        COALESCE(v_monthly_won,   '{}')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pipeline_insights() TO authenticated;
