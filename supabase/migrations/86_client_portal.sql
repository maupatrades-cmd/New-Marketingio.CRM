-- Migration 86: Client Portal — public onboarding token + portal RPCs
-- New columns on client_onboarding for token-gated public onboarding
-- New RPCs: get/save/submit_onboarding_by_token, submit_debit_mandate_by_token,
--           get_client_portal_summary, get_my_contracts, get_my_invoices
-- Updated: send_onboarding_form_link now generates token + uses /onboard/:token URL

ALTER TABLE client_onboarding ADD COLUMN IF NOT EXISTS onboarding_token text UNIQUE;
ALTER TABLE client_onboarding ADD COLUMN IF NOT EXISTS onboarding_token_expires_at timestamptz;

-- All RPCs applied via execute_sql in session.
-- Public token RPCs are GRANTed to anon + authenticated.
-- Client portal RPCs use auth.uid() to scope to the current user's client row.
