-- 28_audit_log_action_freeform.sql
-- The audit_log.action column was constrained to INSERT/UPDATE/DELETE only,
-- but RPCs (qualify_lead, cpc_r87_accrued, future workflow RPCs) write
-- semantic action labels. Drop the check; action becomes free-form text.
-- Existing rows are unaffected.
alter table public.audit_log drop constraint if exists audit_log_action_check;
