-- Migration 62 — Batch 1 fixes + Auth layer + Pipeline Phase 1 schema
-- Covers:
--   BUG #2  : head_of_tech added to leads_read + deals_read RLS
--   AUTH-1A : 7 new columns on profiles
--   AUTH-1B : login_attempts + user_devices tables
--   PIPE1   : deals extensions + deal_stage_history + pipeline_phase trigger

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG #2 — leads_read + deals_read RLS: include head_of_tech
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop and recreate leads SELECT policy to include head_of_tech
DROP POLICY IF EXISTS leads_read ON leads;
CREATE POLICY leads_read ON leads FOR SELECT
  USING (
    -- owner/admin/head_of_tech see all leads
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('owner','admin','head_of_tech')
    )
    OR
    -- field_agent/cpc see leads assigned to them or submitted by them
    assigned_to = auth.uid()
    OR submitted_by = auth.uid()
  );

-- Drop and recreate deals SELECT policy to include head_of_tech
DROP POLICY IF EXISTS deals_read ON deals;
CREATE POLICY deals_read ON deals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('owner','admin','head_of_tech')
    )
    OR closer_id = auth.uid()
    OR cpc_id    = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTH-1A — Extend profiles with auth/security columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS popia_consent_given    boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS popia_consent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS popia_consent_version  text,
  ADD COLUMN IF NOT EXISTS welcome_seen_at        timestamptz,
  ADD COLUMN IF NOT EXISTS force_logout_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_sign_in_at        timestamptz,
  ADD COLUMN IF NOT EXISTS suspicious_login_detected_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTH-1B — login_attempts table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_attempts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  email_attempted     text        NOT NULL,
  attempt_method      text        NOT NULL
    CHECK (attempt_method IN ('otp_request','otp_verify','magic_link','recovery')),
  outcome             text        NOT NULL
    CHECK (outcome IN ('success','invalid_code','expired','rate_limited','locked_out','unknown_email')),
  ip_address          inet,
  user_agent          text,
  device_fingerprint  text,
  location_country    text,
  location_city       text,
  is_new_device       boolean     DEFAULT false,
  is_suspicious       boolean     DEFAULT false,
  suspicious_reasons  text[],
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx
  ON login_attempts (email_attempted, created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_user_idx
  ON login_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx
  ON login_attempts (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_suspicious_idx
  ON login_attempts (is_suspicious, created_at DESC)
  WHERE is_suspicious = true;

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY login_attempts_self ON login_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY login_attempts_managers ON login_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('owner','admin','head_of_tech')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTH-1B — user_devices table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_devices (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint  text        NOT NULL,
  device_name         text,
  user_agent          text,
  first_seen_at       timestamptz DEFAULT now(),
  last_seen_at        timestamptz,
  is_trusted          boolean     DEFAULT false,
  revoked_at          timestamptz,
  UNIQUE (user_id, device_fingerprint)
);

ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_devices_self ON user_devices FOR ALL
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — Extend deals for pipeline phases
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS contract_loaded_date   date,
  ADD COLUMN IF NOT EXISTS onboarding_complete_date date,
  ADD COLUMN IF NOT EXISTS pipeline_phase         text
    CHECK (pipeline_phase IN ('foundation','working','loading','active','archived')),
  ADD COLUMN IF NOT EXISTS probability            integer DEFAULT 20
    CHECK (probability BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS estimated_value_zar    numeric(14,2)
    GENERATED ALWAYS AS (
      COALESCE(setup_fee, 0) + COALESCE(monthly_retainer, 0) * 6
    ) STORED,
  ADD COLUMN IF NOT EXISTS lost_at                timestamptz,
  ADD COLUMN IF NOT EXISTS won_by_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill pipeline_phase for existing rows
UPDATE deals SET pipeline_phase =
  CASE
    WHEN stage IN ('closed_lost')          THEN 'archived'
    WHEN stage IN ('closed_won')
      AND onboarding_complete_date IS NOT NULL THEN 'active'
    WHEN stage = 'closed_won'              THEN 'loading'
    ELSE                                        'working'
  END
WHERE pipeline_phase IS NULL;

-- Indexes for kanban queries
CREATE INDEX IF NOT EXISTS deals_pipeline_phase_idx
  ON deals (pipeline_phase, updated_at DESC)
  WHERE pipeline_phase IN ('foundation','working','loading');

CREATE INDEX IF NOT EXISTS deals_closer_phase_idx
  ON deals (closer_id, pipeline_phase)
  WHERE closer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS deals_cpc_phase_idx
  ON deals (cpc_id, pipeline_phase)
  WHERE cpc_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — deal_stage_history (append-only audit)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deal_stage_history (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                 uuid        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage              text,
  to_stage                text        NOT NULL,
  from_phase              text,
  to_phase                text,
  changed_by              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_role         text,
  duration_in_prev_stage  interval,
  notes                   text,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_stage_history_deal_idx
  ON deal_stage_history (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_stage_history_user_idx
  ON deal_stage_history (changed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_stage_history_funnel_idx
  ON deal_stage_history (from_stage, to_stage);

ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_stage_history_read ON deal_stage_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('owner','admin','head_of_tech')
    )
    OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_id
        AND (d.closer_id = auth.uid() OR d.cpc_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — pipeline_phase trigger (auto-maintains denormalised column)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION compute_pipeline_phase(
  p_stage                   text,
  p_onboarding_complete_date date,
  p_setup_fee_cleared_date  date DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_stage = 'closed_lost' THEN RETURN 'archived'; END IF;
  IF p_stage = 'closed_won' THEN
    IF p_onboarding_complete_date IS NOT NULL THEN RETURN 'active'; END IF;
    RETURN 'loading';
  END IF;
  RETURN 'working';
END;
$$;

CREATE OR REPLACE FUNCTION trg_deals_pipeline_phase()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.pipeline_phase := compute_pipeline_phase(
    NEW.stage,
    NEW.onboarding_complete_date,
    NEW.setup_fee_cleared_date
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_pipeline_phase_trigger ON deals;
CREATE TRIGGER deals_pipeline_phase_trigger
  BEFORE INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION trg_deals_pipeline_phase();

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — Stage probability defaults per stage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION stage_default_probability(p_stage text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_stage
    WHEN 'new_lead'        THEN 5
    WHEN 'contacted'       THEN 20
    WHEN 'qualified'       THEN 40
    WHEN 'proposal_sent'   THEN 60
    WHEN 'negotiation'     THEN 80
    WHEN 'closed_won'      THEN 100
    WHEN 'closed_lost'     THEN 0
    ELSE 20
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — get_my_pipeline RPC (role-aware, CPC hides rands)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_pipeline(
  p_phase text DEFAULT NULL
)
RETURNS TABLE (
  id                  uuid,
  client_id           uuid,
  client_name         text,
  deal_type           text,
  package             text,
  add_on_name         text,
  stage               text,
  pipeline_phase      text,
  probability         integer,
  setup_fee           numeric,
  monthly_retainer    numeric,
  estimated_value_zar numeric,
  closer_id           uuid,
  closer_name         text,
  cpc_id              uuid,
  source              text,
  notes               text,
  contract_loaded_date date,
  onboarding_complete_date date,
  created_at          timestamptz,
  updated_at          timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;

  IF v_role = 'cpc' THEN
    RETURN QUERY
    SELECT
      d.id, d.client_id, d.client_name, d.deal_type, d.package, d.add_on_name,
      d.stage, d.pipeline_phase, d.probability,
      NULL::numeric AS setup_fee,
      NULL::numeric AS monthly_retainer,
      NULL::numeric AS estimated_value_zar,
      d.closer_id, d.closer_name, d.cpc_id, d.source, d.notes,
      d.contract_loaded_date, d.onboarding_complete_date,
      d.created_at, d.updated_at
    FROM deals d
    WHERE d.cpc_id = auth.uid()
      AND d.pipeline_phase <> 'archived'
      AND (p_phase IS NULL OR d.pipeline_phase = p_phase)
    ORDER BY d.updated_at DESC;

  ELSIF v_role IN ('field_agent') THEN
    RETURN QUERY
    SELECT
      d.id, d.client_id, d.client_name, d.deal_type, d.package, d.add_on_name,
      d.stage, d.pipeline_phase, d.probability,
      d.setup_fee, d.monthly_retainer, d.estimated_value_zar,
      d.closer_id, d.closer_name, d.cpc_id, d.source, d.notes,
      d.contract_loaded_date, d.onboarding_complete_date,
      d.created_at, d.updated_at
    FROM deals d
    WHERE d.closer_id = auth.uid()
      AND d.pipeline_phase <> 'archived'
      AND (p_phase IS NULL OR d.pipeline_phase = p_phase)
    ORDER BY d.updated_at DESC;

  ELSE
    -- owner / admin / head_of_tech see all non-archived
    RETURN QUERY
    SELECT
      d.id, d.client_id, d.client_name, d.deal_type, d.package, d.add_on_name,
      d.stage, d.pipeline_phase, d.probability,
      d.setup_fee, d.monthly_retainer, d.estimated_value_zar,
      d.closer_id, d.closer_name, d.cpc_id, d.source, d.notes,
      d.contract_loaded_date, d.onboarding_complete_date,
      d.created_at, d.updated_at
    FROM deals d
    WHERE d.pipeline_phase <> 'archived'
      AND (p_phase IS NULL OR d.pipeline_phase = p_phase)
    ORDER BY d.updated_at DESC;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — advance_deal_stage RPC (state machine + history + phase update)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION advance_deal_stage(
  p_deal_id   uuid,
  p_new_stage text,
  p_notes     text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role     text;
  v_deal     deals%ROWTYPE;
  v_from     text;
  v_changed_at timestamptz;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;

  SELECT * INTO v_deal FROM deals WHERE id = p_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_not_found'; END IF;

  v_from := v_deal.stage;

  -- State machine validation
  IF NOT (
    (v_from = 'new_lead'       AND p_new_stage IN ('contacted','closed_lost')) OR
    (v_from = 'contacted'      AND p_new_stage IN ('qualified','closed_lost')) OR
    (v_from = 'qualified'      AND p_new_stage IN ('proposal_sent','closed_lost')) OR
    (v_from = 'proposal_sent'  AND p_new_stage IN ('negotiation','qualified','closed_lost')) OR
    (v_from = 'negotiation'    AND p_new_stage IN ('closed_won','closed_lost'))
  ) THEN
    RAISE EXCEPTION 'invalid_stage_transition: % → %', v_from, p_new_stage;
  END IF;

  -- Access control: owner/admin/head_of_tech or the deal's closer
  IF v_role NOT IN ('owner','admin','head_of_tech') AND v_deal.closer_id != auth.uid() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Compute duration in previous stage
  SELECT COALESCE(
    (SELECT created_at FROM deal_stage_history
     WHERE deal_id = p_deal_id ORDER BY created_at DESC LIMIT 1),
    v_deal.created_at
  ) INTO v_changed_at;

  -- Record history
  INSERT INTO deal_stage_history (
    deal_id, from_stage, to_stage,
    from_phase, to_phase,
    changed_by, changed_by_role,
    duration_in_prev_stage, notes
  ) VALUES (
    p_deal_id, v_from, p_new_stage,
    v_deal.pipeline_phase,
    compute_pipeline_phase(p_new_stage, v_deal.onboarding_complete_date, v_deal.setup_fee_cleared_date),
    auth.uid(), v_role,
    now() - v_changed_at,
    p_notes
  );

  -- Update deal (trigger auto-updates pipeline_phase + probability)
  UPDATE deals SET
    stage       = p_new_stage,
    probability = stage_default_probability(p_new_stage),
    lost_at     = CASE WHEN p_new_stage = 'closed_lost' THEN now() ELSE lost_at END,
    updated_at  = now()
  WHERE id = p_deal_id;

  RETURN jsonb_build_object('ok', true, 'from', v_from, 'to', p_new_stage);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — mark_deal_lost RPC (requires reason)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_deal_lost(
  p_deal_id   uuid,
  p_reason    text,
  p_notes     text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role  text;
  v_deal  deals%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'lost_reason_required';
  END IF;

  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
  SELECT * INTO v_deal FROM deals WHERE id = p_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_not_found'; END IF;

  IF v_role NOT IN ('owner','admin','head_of_tech') AND v_deal.closer_id != auth.uid() THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  INSERT INTO deal_stage_history (
    deal_id, from_stage, to_stage, from_phase, to_phase,
    changed_by, changed_by_role, notes
  ) VALUES (
    p_deal_id, v_deal.stage, 'closed_lost', v_deal.pipeline_phase, 'archived',
    auth.uid(), v_role, p_reason || COALESCE(': ' || p_notes, '')
  );

  UPDATE deals SET
    stage       = 'closed_lost',
    probability = 0,
    lost_reason = p_reason,
    lost_at     = now(),
    updated_at  = now()
  WHERE id = p_deal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — mark_contract_loaded RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_contract_loaded(
  p_deal_id     uuid,
  p_storage_path text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'permission_denied'; END IF;

  UPDATE deals SET
    contract_loaded_date = CURRENT_DATE,
    updated_at           = now()
  WHERE id = p_deal_id AND stage = 'closed_won';

  IF NOT FOUND THEN RAISE EXCEPTION 'deal_not_found_or_not_closed_won'; END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — get_pipeline_forecast RPC (canonical formula)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_pipeline_forecast(
  p_period_start date DEFAULT date_trunc('month', CURRENT_DATE)::date,
  p_period_end   date DEFAULT (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role          text;
  v_pipeline      numeric := 0;
  v_weighted      numeric := 0;
  v_closed        numeric := 0;
  v_closed_count  integer := 0;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;

  IF v_role = 'cpc' THEN
    RETURN jsonb_build_object('hidden', true);
  END IF;

  SELECT
    COALESCE(SUM(estimated_value_zar), 0),
    COALESCE(SUM(estimated_value_zar * probability / 100.0), 0)
  INTO v_pipeline, v_weighted
  FROM deals
  WHERE pipeline_phase IN ('working','loading')
    AND stage NOT IN ('closed_won','closed_lost')
    AND (
      v_role IN ('owner','admin','head_of_tech')
      OR closer_id = auth.uid()
    );

  SELECT
    COALESCE(SUM(estimated_value_zar), 0),
    COUNT(*)
  INTO v_closed, v_closed_count
  FROM deals
  WHERE stage = 'closed_won'
    AND closed_won_at BETWEEN p_period_start AND p_period_end + interval '1 day'
    AND (
      v_role IN ('owner','admin','head_of_tech')
      OR closer_id = auth.uid()
    );

  RETURN jsonb_build_object(
    'pipeline_value',   round(v_pipeline, 2),
    'weighted_forecast', round(v_weighted, 2),
    'closed_value',     round(v_closed, 2),
    'closed_count',     v_closed_count,
    'period_start',     p_period_start,
    'period_end',       p_period_end
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — get_deal_stage_history RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_deal_stage_history(p_deal_id uuid)
RETURNS TABLE (
  id                    uuid,
  from_stage            text,
  to_stage              text,
  from_phase            text,
  to_phase              text,
  changed_by            uuid,
  changed_by_role       text,
  duration_in_prev_stage interval,
  notes                 text,
  created_at            timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;

  -- Access: manager sees all; closer/cpc sees own deal
  IF v_role NOT IN ('owner','admin','head_of_tech') THEN
    IF NOT EXISTS (
      SELECT 1 FROM deals
      WHERE id = p_deal_id AND (closer_id = auth.uid() OR cpc_id = auth.uid())
    ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  END IF;

  RETURN QUERY
  SELECT h.id, h.from_stage, h.to_stage, h.from_phase, h.to_phase,
         h.changed_by, h.changed_by_role, h.duration_in_prev_stage,
         h.notes, h.created_at
  FROM deal_stage_history h
  WHERE h.deal_id = p_deal_id
  ORDER BY h.created_at ASC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — reopen_deal RPC (owner only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reopen_deal(
  p_deal_id      uuid,
  p_target_stage text DEFAULT 'negotiation'
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role text;
  v_deal deals%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
  IF v_role != 'owner' THEN RAISE EXCEPTION 'permission_denied: owner only'; END IF;

  SELECT * INTO v_deal FROM deals WHERE id = p_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'deal_not_found'; END IF;
  IF v_deal.stage != 'closed_lost' THEN
    RAISE EXCEPTION 'can_only_reopen_closed_lost_deals';
  END IF;

  INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, from_phase, to_phase, changed_by, changed_by_role, notes)
  VALUES (p_deal_id, 'closed_lost', p_target_stage, 'archived', 'working', auth.uid(), v_role, 'Reopened by owner');

  UPDATE deals SET
    stage       = p_target_stage,
    probability = stage_default_probability(p_target_stage),
    lost_at     = NULL,
    lost_reason = NULL,
    updated_at  = now()
  WHERE id = p_deal_id;

  RETURN jsonb_build_object('ok', true, 'reopened_to', p_target_stage);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPE1 — convert_lead_to_deal RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION convert_lead_to_deal(
  p_lead_id     uuid,
  p_quick_close boolean DEFAULT false,
  p_notes       text    DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role   text;
  v_lead   leads%ROWTYPE;
  v_deal_id uuid;
  v_stage  text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
  IF v_role NOT IN ('owner','admin','head_of_tech','field_agent','cpc') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
  IF v_lead.verification_status != 'verified' THEN
    RAISE EXCEPTION 'lead_must_be_verified_before_converting';
  END IF;
  IF v_lead.deal_id IS NOT NULL THEN
    RAISE EXCEPTION 'lead_already_converted';
  END IF;

  v_stage := CASE WHEN p_quick_close THEN 'negotiation' ELSE 'contacted' END;

  INSERT INTO deals (
    client_name, deal_type, stage, pipeline_phase, probability,
    closer_id, closer_name, cpc_id, source, notes,
    created_at, updated_at
  )
  SELECT
    v_lead.business_name,
    'new_business',
    v_stage,
    compute_pipeline_phase(v_stage, NULL, NULL),
    stage_default_probability(v_stage),
    COALESCE(v_lead.assigned_to, auth.uid()),
    (SELECT full_name FROM profiles WHERE id = COALESCE(v_lead.assigned_to, auth.uid())),
    v_lead.cpc_id,
    v_lead.source,
    p_notes,
    now(), now()
  RETURNING id INTO v_deal_id;

  -- Link lead to deal
  UPDATE leads SET deal_id = v_deal_id, status = 'converted', updated_at = now()
  WHERE id = p_lead_id;

  -- Seed stage history
  INSERT INTO deal_stage_history (deal_id, to_stage, to_phase, changed_by, changed_by_role, notes)
  VALUES (v_deal_id, v_stage, compute_pipeline_phase(v_stage, NULL, NULL), auth.uid(), v_role, 'Converted from lead');

  RETURN jsonb_build_object('ok', true, 'deal_id', v_deal_id, 'stage', v_stage);
END;
$$;
