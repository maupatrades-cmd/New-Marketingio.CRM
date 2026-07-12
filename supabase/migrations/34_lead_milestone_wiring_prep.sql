-- 34_lead_milestone_wiring_prep.sql
-- Phase 3 PR 3: prep for wiring notify-lead-milestone to all call sites.
-- 1. lead_milestones_fired: lifecycle-level idempotency.
-- 2. Extend notification_type constraint with v2 milestone names.
-- 3. Add lead_id (nullable) to deals for lead-to-deal linkage.

create table if not exists public.lead_milestones_fired (
  lead_id   uuid        not null references public.leads(id) on delete cascade,
  milestone text        not null,
  fired_at  timestamptz not null default now(),
  primary key (lead_id, milestone)
);
-- cold v1 behaviour: PK prevents re-fire per lifecycle. If a lead is reassigned
-- and goes cold again under the new assigner, EF skips because the row exists.
-- To re-enable, DELETE the row when assigned_to changes. Deferred to PR 3.5.

alter table public.lead_milestones_fired enable row level security;
create policy "no_client_access" on public.lead_milestones_fired
  using (false) with check (false);

alter table public.client_notifications
  drop constraint client_notifications_notification_type_check;

alter table public.client_notifications
  add constraint client_notifications_notification_type_check
  check (notification_type = any (array[
    'deliverable_ready','invoice_issued','invoice_overdue','payment_received',
    'payment_failed','message_received','contract_to_sign','report_ready',
    'onboarding_step_complete','onboarding_submission','lead_pending_verification',
    'client_cancelled','system_update','sale_logged','upsell_added',
    'opportunity_closed','hot_lead','lead_assigned',
    -- v1 milestone names (kept for backward-compat)
    'lead_milestone_qualified','lead_milestone_contacted','lead_milestone_meeting',
    'lead_milestone_deal','lead_milestone_won','lead_milestone_lost','lead_milestone_cold',
    -- v2 milestone names (new in PR 3)
    'lead_milestone_qualified_verified','lead_milestone_qualified_clarify',
    'lead_milestone_qualified_reject','lead_milestone_deal_created',
    'lead_milestone_sale_won','lead_milestone_sale_lost'
  ]));

alter table public.deals
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

create index if not exists deals_lead_id_idx on public.deals(lead_id);
