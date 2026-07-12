-- ══════════════════════════════════════════════════════════════════════════════
-- BRICK LI4.2 — New-lead submission notifications
-- When any staff member submits a lead, notify all owners + admins
-- via client_notifications (bell) so they land in Inbox + My Day.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Extend notification_type constraint to include new types from LI1 + this brick
ALTER TABLE public.client_notifications
  DROP CONSTRAINT client_notifications_notification_type_check;

ALTER TABLE public.client_notifications
  ADD CONSTRAINT client_notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY[
    -- legacy types
    'deliverable_ready','invoice_issued','invoice_overdue','payment_received',
    'payment_failed','message_received','contract_to_sign','report_ready',
    'onboarding_step_complete','onboarding_submission','lead_pending_verification',
    'client_cancelled','system_update','sale_logged','upsell_added',
    'opportunity_closed','hot_lead','lead_assigned',
    -- v1 milestone names
    'lead_milestone_qualified','lead_milestone_contacted','lead_milestone_meeting',
    'lead_milestone_deal','lead_milestone_won','lead_milestone_lost','lead_milestone_cold',
    -- v2 milestone names
    'lead_milestone_qualified_verified','lead_milestone_qualified_clarify',
    'lead_milestone_qualified_reject','lead_milestone_deal_created',
    'lead_milestone_sale_won','lead_milestone_sale_lost',
    -- LI1 ticket types
    'lead_ticket_opened','lead_ticket_actioned','lead_ticket_confirmed',
    'lead_ticket_auto_confirmed','lead_ticket_disputed','lead_ticket_reassigned',
    'lead_overwhelmed',
    -- LI4 automated types
    'closure_bonus_earned','closure_bonus_due',
    -- this brick
    'new_lead_submitted'
  ]));

-- 2. Trigger function — fires on INSERT on leads
CREATE OR REPLACE FUNCTION trg_notify_new_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_submitter_name text;
  v_title          text;
  v_body           text;
BEGIN
  -- Get submitter display name
  SELECT full_name INTO v_submitter_name FROM profiles WHERE id = NEW.submitted_by;

  v_title := '📋 New lead submitted: ' || COALESCE(NEW.business_name, 'Unknown');
  v_body  := 'Submitted by ' || COALESCE(v_submitter_name, 'a team member')
             || CASE WHEN NEW.phone IS NOT NULL THEN ' · ' || NEW.phone ELSE '' END
             || CASE WHEN NEW.lead_temperature IS NOT NULL
                     THEN ' · ' || initcap(NEW.lead_temperature)
                     ELSE '' END;

  -- Notify all owners and admins
  INSERT INTO client_notifications (
    recipient_user_id, notification_type, title, body,
    related_entity_type, related_entity_id, action_url
  )
  SELECT
    ur.user_id,
    'new_lead_submitted',
    v_title,
    v_body,
    'lead',
    NEW.id,
    '/owner/leads/' || NEW.id || '/inbox'
  FROM user_roles ur
  WHERE ur.role IN ('owner', 'admin')
    AND ur.user_id <> COALESCE(NEW.submitted_by, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_lead ON leads;
CREATE TRIGGER trg_notify_new_lead
  AFTER INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION trg_notify_new_lead();

-- 3. Smoke guard
DO $$
BEGIN
  ASSERT (SELECT to_regprocedure('public.trg_notify_new_lead()') IS NOT NULL),
    'trg_notify_new_lead function missing';
  ASSERT (SELECT COUNT(*) FROM information_schema.triggers
          WHERE trigger_name = 'trg_notify_new_lead'
            AND event_object_table = 'leads') = 1,
    'trg_notify_new_lead trigger not attached to leads';
END $$;
