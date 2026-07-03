-- Migration 82: Fix add-on commission calculation
-- Bug 1: Bucket C hardcoded 12 months instead of using actual term
-- Bug 2: RPC read 'add_on_term_months' but frontend sends 'contract_term_months'
-- Both fixes already applied to live DB; this migration captures them in source.

-- The full updated _compute_sale_commissions function is tracked in migration 25
-- with these two key changes:
--   1. v_term_months reads contract_term_months first, falls back to add_on_term_months
--   2. Bucket C uses v_term_months instead of hardcoded 12

-- No-op: fixes were applied directly to the live function.
-- This file exists for auditability.
