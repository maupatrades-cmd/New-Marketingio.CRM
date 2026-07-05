-- Migration 87: Full Client Portal — Directive 14
-- New client_messages table + RLS
-- New RPCs: get_client_dashboard, get_my_invoices(status), submit_payment_proof,
--           get_my_deliverables(status), get_my_deliverable_detail,
--           submit_deliverable_feedback, get_my_reports,
--           get_my_messages, send_client_message,
--           get_my_notifications, mark_notification_read, mark_all_notifications_read,
--           get_my_profile, update_my_notification_prefs

CREATE TABLE IF NOT EXISTS client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sender_user_id uuid,
  is_from_client boolean NOT NULL DEFAULT false,
  sender_name text,
  subject text,
  body text NOT NULL,
  file_url text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_messages_client ON client_messages(client_id, created_at DESC);
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

-- Policies + all RPCs applied via execute_sql in session.
