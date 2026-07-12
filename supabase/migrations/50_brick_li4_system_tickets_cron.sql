-- ══════════════════════════════════════════════════════════════════════════════
-- BRICK LI4 — System tickets, automation, cron schedules
-- - going_cold scanner   (daily): fires when assigned lead is silent 7+ days
-- - hot_alert trigger    (immediate): fires when lead_temperature flips to 'hot'
-- - R250 closure bonus   (immediate): fires when deal hits closed_won + both fees
-- - auto_confirm cron schedule
-- - going_cold cron schedule
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Idempotency column on deals ────────────────────────────────────────────
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS closure_bonus_fired_at timestamptz;

-- ── 2. System ticket helper ───────────────────────────────────────────────────
-- Inserts a system-generated ticket without going through RPC (SECURITY DEFINER
-- bypasses RLS). Uses the *owner* user_id as from_user_id since system tickets
-- need a valid auth.users reference.
CREATE OR REPLACE FUNCTION _system_lead_ticket(
  p_lead_id       uuid,
  p_type_code     text,
  p_to_user_id    uuid,
  p_subject       text,
  p_body          text,
  p_priority      text DEFAULT 'normal',
  p_related_deal_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id          uuid;
  v_from_user   uuid;
BEGIN
  -- Pick any owner as the system sender (first one found)
  SELECT user_id INTO v_from_user FROM user_roles
    WHERE role = 'owner' ORDER BY user_id LIMIT 1;
  IF v_from_user IS NULL THEN
    RAISE WARNING 'No owner found — system ticket skipped for lead %', p_lead_id;
    RETURN NULL;
  END IF;

  INSERT INTO lead_tickets (
    lead_id, ticket_type_code, from_user_id, to_user_id,
    subject, body, priority, system_generated, related_deal_id
  ) VALUES (
    p_lead_id, p_type_code, v_from_user, p_to_user_id,
    p_subject, p_body, p_priority, true, p_related_deal_id
  ) RETURNING id INTO v_id;

  IF p_to_user_id IS NOT NULL THEN
    INSERT INTO client_notifications (
      recipient_user_id, notification_type, title, body, action_url
    ) VALUES (
      p_to_user_id, 'lead_ticket_opened',
      '🤖 ' || p_subject, COALESCE(p_body,''),
      '/owner/leads/' || p_lead_id || '/inbox'
    );
  END IF;

  RETURN v_id;
END;
$$;

-- ── 3. Going-cold scanner ─────────────────────────────────────────────────────
-- Fires a system 'going_cold' ticket on any assigned lead with no activity for
-- 7+ days, directed at the assignee, copied to owner. Skips leads with an
-- already-open going_cold ticket so we don't spam.
CREATE OR REPLACE FUNCTION scan_going_cold_leads()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lead     record;
  v_count    int := 0;
  v_threshold timestamptz := now() - interval '7 days';
BEGIN
  FOR v_lead IN
    SELECT l.id, l.business_name, l.assigned_to,
           COALESCE(l.last_activity_at, l.created_at) AS last_seen
    FROM leads l
    WHERE l.assigned_to IS NOT NULL
      AND l.status NOT IN ('rejected','converted','cancelled')
      AND COALESCE(l.last_activity_at, l.created_at) < v_threshold
      AND NOT EXISTS (
        SELECT 1 FROM lead_tickets lt
        WHERE lt.lead_id = l.id
          AND lt.ticket_type_code = 'going_cold'
          AND lt.status IN ('open','actioned')
      )
  LOOP
    PERFORM _system_lead_ticket(
      v_lead.id, 'going_cold', v_lead.assigned_to,
      '🥶 Going cold: ' || COALESCE(v_lead.business_name,'Lead'),
      'No activity on this lead for 7+ days. Last activity: '
        || to_char(v_lead.last_seen, 'DD Mon YYYY HH24:MI')
        || '. Reach out, close it, or pause the lead.',
      'high'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── 4. Hot-lead alert trigger ─────────────────────────────────────────────────
-- When lead_temperature flips TO 'hot', fire a system hot_alert ticket to the
-- assignee (or owner if unassigned) — only once per transition.
CREATE OR REPLACE FUNCTION trg_lead_hot_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_recipient uuid;
BEGIN
  IF NEW.lead_temperature = 'hot'
     AND COALESCE(OLD.lead_temperature,'') <> 'hot' THEN

    v_recipient := COALESCE(NEW.assigned_to,
      (SELECT user_id FROM user_roles WHERE role='owner' ORDER BY user_id LIMIT 1));

    -- Avoid duplicate alerts within the same day
    IF NOT EXISTS (
      SELECT 1 FROM lead_tickets
      WHERE lead_id = NEW.id
        AND ticket_type_code = 'hot_alert'
        AND created_at > now() - interval '24 hours'
    ) THEN
      PERFORM _system_lead_ticket(
        NEW.id, 'hot_alert', v_recipient,
        '🔥 Hot lead: ' || COALESCE(NEW.business_name,'Lead'),
        'This lead just turned HOT. Strike while the iron is hot — call or visit today.',
        'urgent'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_hot_alert ON leads;
CREATE TRIGGER trg_lead_hot_alert
  AFTER UPDATE OF lead_temperature ON leads
  FOR EACH ROW EXECUTE FUNCTION trg_lead_hot_alert();

-- ── 5. R250 closure bonus trigger ─────────────────────────────────────────────
-- Q1 decision: R250 auto-fires when deal hits closed_won + setup_fee_cleared
-- + first_debit_cleared. Idempotent via closure_bonus_fired_at.
CREATE OR REPLACE FUNCTION trg_deal_closure_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lead_assignee uuid;
  v_owner_id      uuid;
  v_business      text;
BEGIN
  IF NEW.stage = 'closed_won'
     AND COALESCE(NEW.setup_fee_cleared, false)
     AND COALESCE(NEW.first_debit_cleared, false)
     AND NEW.closure_bonus_fired_at IS NULL THEN

    -- Mark fired (idempotent)
    NEW.closure_bonus_fired_at := now();

    -- Find lead assignee + business name
    SELECT assigned_to, business_name INTO v_lead_assignee, v_business
    FROM leads WHERE id = NEW.lead_id;

    SELECT user_id INTO v_owner_id FROM user_roles
      WHERE role = 'owner' ORDER BY user_id LIMIT 1;

    -- Notify the lead assignee (the closer earning the R250)
    IF v_lead_assignee IS NOT NULL THEN
      INSERT INTO client_notifications (
        recipient_user_id, notification_type, title, body, action_url
      ) VALUES (
        v_lead_assignee, 'closure_bonus_earned',
        '💰 R250 closure bonus earned',
        'Setup fee + first debit cleared on ' || COALESCE(v_business,'a client')
          || '. Your R250 closer bonus has been logged.',
        '/owner/leads/' || NEW.lead_id || '/inbox'
      );
    END IF;

    -- Notify owner for payout queue
    IF v_owner_id IS NOT NULL AND v_owner_id <> v_lead_assignee THEN
      INSERT INTO client_notifications (
        recipient_user_id, notification_type, title, body, action_url
      ) VALUES (
        v_owner_id, 'closure_bonus_due',
        '💰 R250 closure bonus due to be paid',
        COALESCE(v_business,'A client')
          || ' fully cleared. R250 owed to assigned closer.',
        '/owner/leads/' || NEW.lead_id || '/inbox'
      );
    END IF;

    -- Log a system ticket on the lead for the paper trail
    IF NEW.lead_id IS NOT NULL THEN
      PERFORM _system_lead_ticket(
        NEW.lead_id, 'help_close', v_lead_assignee,
        '💰 R250 closure bonus earned: ' || COALESCE(v_business,'Lead'),
        'Setup fee + first debit cleared. R250 closer bonus has been logged for payout.',
        'normal', NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_closure_bonus ON deals;
CREATE TRIGGER trg_deal_closure_bonus
  BEFORE UPDATE OF stage, setup_fee_cleared, first_debit_cleared ON deals
  FOR EACH ROW EXECUTE FUNCTION trg_deal_closure_bonus();

-- ── 6. Cron schedules ─────────────────────────────────────────────────────────
-- Unschedule existing first so re-running this migration doesn't duplicate
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_confirm_stale_tickets') THEN
    PERFORM cron.unschedule('auto_confirm_stale_tickets');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scan_going_cold_leads') THEN
    PERFORM cron.unschedule('scan_going_cold_leads');
  END IF;
END $$;

-- Auto-confirm actioned tickets aged 7+ days, daily at 02:00 UTC
SELECT cron.schedule(
  'auto_confirm_stale_tickets',
  '0 2 * * *',
  $$SELECT public.auto_confirm_stale_tickets();$$
);

-- Scan for going-cold leads daily at 06:00 UTC (08:00 SAST — morning briefing)
SELECT cron.schedule(
  'scan_going_cold_leads',
  '0 6 * * *',
  $$SELECT public.scan_going_cold_leads();$$
);

-- ── 7. Smoke guard ────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT to_regprocedure('public.scan_going_cold_leads()')   IS NOT NULL), 'scan_going_cold_leads missing';
  ASSERT (SELECT to_regprocedure('public._system_lead_ticket(uuid,text,uuid,text,text,text,uuid)') IS NOT NULL), '_system_lead_ticket missing';
  ASSERT (SELECT COUNT(*) FROM cron.job WHERE jobname IN ('auto_confirm_stale_tickets','scan_going_cold_leads')) = 2,
    'cron jobs not registered';
  ASSERT (SELECT 1 FROM information_schema.columns
          WHERE table_name='deals' AND column_name='closure_bonus_fired_at') IS NOT NULL,
    'closure_bonus_fired_at missing on deals';
END $$;
