-- 30_notification_type_lead_assigned.sql
-- Add 'lead_assigned' to client_notifications_notification_type_check.
-- Required by notify-lead-assigned EF (Phase 3 PR 2).

alter table public.client_notifications
  drop constraint client_notifications_notification_type_check;

alter table public.client_notifications
  add constraint client_notifications_notification_type_check
  check (notification_type = any (array[
    'deliverable_ready','invoice_issued','invoice_overdue','payment_received',
    'payment_failed','message_received','contract_to_sign','report_ready',
    'onboarding_step_complete','onboarding_submission','lead_pending_verification',
    'client_cancelled','system_update','sale_logged','upsell_added',
    'opportunity_closed','hot_lead','lead_assigned'
  ]));
