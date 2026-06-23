-- ══════════════════════════════════════════════════════════════════════════════
-- BRICK LI4.1 — Merge legacy cold_lead_scan into scan_going_cold_leads
--
-- Legacy check_cold_leads() (mig 33) pushed an external notification via the
-- notify-lead-milestone edge function and gated re-fire via leads.cold_notified_at.
-- The new scan_going_cold_leads() (mig 50) creates an in-app system ticket.
--
-- Merge: extend scan_going_cold_leads to ALSO fire the edge-function push +
-- stamp cold_notified_at, then drop the legacy function and its cron job.
-- leads.cold_notified_at column is kept (referenced by spec docs and consumers).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION scan_going_cold_leads()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lead       record;
  v_count      int := 0;
  v_threshold  timestamptz := now() - interval '7 days';
  v_supa_url   text := current_setting('app.settings.supabase_url',  true);
  v_anon_key   text := current_setting('app.settings.supabase_anon_key', true);
BEGIN
  FOR v_lead IN
    SELECT l.id, l.business_name, l.assigned_to, l.cold_notified_at,
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
    -- In-app system ticket
    PERFORM _system_lead_ticket(
      v_lead.id, 'going_cold', v_lead.assigned_to,
      '🥶 Going cold: ' || COALESCE(v_lead.business_name,'Lead'),
      'No activity on this lead for 7+ days. Last activity: '
        || to_char(v_lead.last_seen, 'DD Mon YYYY HH24:MI')
        || '. Reach out, close it, or pause the lead.',
      'high'
    );

    -- External milestone push (legacy behaviour). Only fire once per cold cycle.
    IF v_lead.cold_notified_at IS NULL
       AND v_supa_url IS NOT NULL AND v_anon_key IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_supa_url || '/functions/v1/notify-lead-milestone',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_anon_key
          ),
          body    := jsonb_build_object(
            'lead_id',   v_lead.id,
            'milestone', 'cold'
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify-lead-milestone push failed for lead %: %', v_lead.id, SQLERRM;
      END;

      UPDATE leads SET cold_notified_at = now() WHERE id = v_lead.id;
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Drop the legacy job + function
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cold_lead_scan') THEN
    PERFORM cron.unschedule('cold_lead_scan');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.check_cold_leads();

-- Smoke
DO $$
BEGIN
  ASSERT (SELECT to_regprocedure('public.check_cold_leads()') IS NULL),
    'check_cold_leads should have been dropped';
  ASSERT (SELECT COUNT(*) FROM cron.job WHERE jobname = 'cold_lead_scan') = 0,
    'legacy cold_lead_scan job should be unscheduled';
  ASSERT (SELECT COUNT(*) FROM cron.job WHERE jobname = 'scan_going_cold_leads') = 1,
    'scan_going_cold_leads job should be scheduled';
END $$;
