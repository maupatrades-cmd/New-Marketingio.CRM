-- FIX A: get_my_pipeline — probability is smallint in deals (RPC declared integer),
-- causing "structure of query does not match function result type" 400 errors.
-- Also include setup_fee_cleared / lost_reason / lead_id which Pipeline.jsx renders.
DROP FUNCTION IF EXISTS public.get_my_pipeline(text);

CREATE OR REPLACE FUNCTION public.get_my_pipeline(p_phase text DEFAULT NULL::text)
 RETURNS TABLE(
   id uuid, client_id uuid, client_name text, deal_type text, package text, add_on_name text,
   stage text, pipeline_phase text, probability smallint,
   setup_fee numeric, monthly_retainer numeric, estimated_value_zar numeric,
   closer_id uuid, closer_name text, cpc_id uuid, source text, notes text,
   contract_loaded_date date, onboarding_complete_date date,
   setup_fee_cleared boolean, lost_reason text, lead_id uuid,
   created_at timestamptz, updated_at timestamptz
 )
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
  IF v_role = 'cpc' THEN
    RETURN QUERY SELECT d.id, d.client_id, d.client_name, d.deal_type, d.package, d.add_on_name,
      d.stage, d.pipeline_phase, d.probability, NULL::numeric, NULL::numeric, NULL::numeric,
      d.closer_id, d.closer_name, d.cpc_id, d.source, d.notes,
      d.contract_loaded_date, d.onboarding_complete_date,
      d.setup_fee_cleared, d.lost_reason, d.lead_id, d.created_at, d.updated_at
    FROM deals d
    WHERE d.cpc_id = auth.uid()
      AND d.pipeline_phase <> 'archived'
      AND (p_phase IS NULL OR d.pipeline_phase = p_phase)
    ORDER BY d.updated_at DESC;
  ELSIF v_role = 'field_agent' THEN
    RETURN QUERY SELECT d.id, d.client_id, d.client_name, d.deal_type, d.package, d.add_on_name,
      d.stage, d.pipeline_phase, d.probability, d.setup_fee, d.monthly_retainer,
      (COALESCE(d.setup_fee,0) + COALESCE(d.monthly_retainer,0)*6)::numeric,
      d.closer_id, d.closer_name, d.cpc_id, d.source, d.notes,
      d.contract_loaded_date, d.onboarding_complete_date,
      d.setup_fee_cleared, d.lost_reason, d.lead_id, d.created_at, d.updated_at
    FROM deals d
    WHERE d.closer_id = auth.uid()
      AND d.pipeline_phase <> 'archived'
      AND (p_phase IS NULL OR d.pipeline_phase = p_phase)
    ORDER BY d.updated_at DESC;
  ELSE
    RETURN QUERY SELECT d.id, d.client_id, d.client_name, d.deal_type, d.package, d.add_on_name,
      d.stage, d.pipeline_phase, d.probability, d.setup_fee, d.monthly_retainer,
      (COALESCE(d.setup_fee,0) + COALESCE(d.monthly_retainer,0)*6)::numeric,
      d.closer_id, d.closer_name, d.cpc_id, d.source, d.notes,
      d.contract_loaded_date, d.onboarding_complete_date,
      d.setup_fee_cleared, d.lost_reason, d.lead_id, d.created_at, d.updated_at
    FROM deals d
    WHERE d.pipeline_phase <> 'archived'
      AND (p_phase IS NULL OR d.pipeline_phase = p_phase)
    ORDER BY d.updated_at DESC;
  END IF;
END; $function$;

-- FIX B: close_sale was failing because trigger _notify_deal_closed_won inserts
-- notification types 'sale_closed_won' and 'cpc_closure_bonus_earned' which were
-- not in the client_notifications.notification_type CHECK constraint allow-list.
ALTER TABLE client_notifications DROP CONSTRAINT IF EXISTS client_notifications_notification_type_check;
ALTER TABLE client_notifications ADD CONSTRAINT client_notifications_notification_type_check
CHECK (notification_type = ANY (ARRAY[
  'deliverable_ready','invoice_issued','invoice_overdue','payment_received','payment_failed',
  'message_received','contract_to_sign','report_ready','onboarding_step_complete','onboarding_submission',
  'lead_pending_verification','client_cancelled','system_update','sale_logged','upsell_added',
  'opportunity_closed','hot_lead','lead_assigned',
  'lead_milestone_qualified','lead_milestone_contacted','lead_milestone_meeting','lead_milestone_deal',
  'lead_milestone_won','lead_milestone_lost','lead_milestone_cold','lead_milestone_qualified_verified',
  'lead_milestone_qualified_clarify','lead_milestone_qualified_reject','lead_milestone_deal_created',
  'lead_milestone_sale_won','lead_milestone_sale_lost',
  'lead_ticket_opened','lead_ticket_actioned','lead_ticket_confirmed','lead_ticket_auto_confirmed',
  'lead_ticket_disputed','lead_ticket_reassigned','lead_overwhelmed',
  'closure_bonus_earned','closure_bonus_due','new_lead_submitted',
  'deliverable_status_changed','deliverable_submitted','deliverable_approved','deliverable_changes_requested',
  'deliverable_rejected','deliverable_deemed_approved',
  'obligation_submitted','obligation_verified','obligation_reminder','time_logged',
  'sale_closed_won','cpc_closure_bonus_earned'
]::text[]));

-- FIX C: deals.stage CHECK constraint only allowed legacy stages
-- (new_lead, discovery_visit, proposal_sent, negotiation, closed_won/lost, onboarding).
-- The new 3-phase pipeline state machine moves deals through 'contacted' and
-- 'qualified', which were rejected → advance_deal_stage failed with
-- "deals_stage_check" on every move to those stages. Allow them.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check
CHECK (stage = ANY (ARRAY[
  'new_lead','discovery_visit','contacted','qualified','proposal_sent','negotiation',
  'closed_won','closed_lost','onboarding'
]::text[]));
