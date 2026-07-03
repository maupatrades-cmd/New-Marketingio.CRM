-- Migration 83: Onboarding System — schema + RPCs
-- New columns on clients for brand assets, account access, content prefs, availability
-- New columns on client_onboarding for form link tracking
-- Updated client_self_update whitelist
-- New RPCs: get_onboarding_forms_list, send_onboarding_form_link,
--           get_onboarding_submission_detail, mark_onboarding_trigger, update_onboarding_notes

-- 1. Clients table extensions
ALTER TABLE clients ADD COLUMN IF NOT EXISTS brand_colors text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS brand_fonts text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tone_of_voice text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS languages text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS words_to_avoid text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS posting_preference text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_account_email text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_page_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_handle text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok_handle text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_call_time text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_notes text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS brand_assets_urls jsonb DEFAULT '[]'::jsonb;

-- 2. client_onboarding form link tracking
ALTER TABLE client_onboarding ADD COLUMN IF NOT EXISTS form_link_sent_at timestamptz;
ALTER TABLE client_onboarding ADD COLUMN IF NOT EXISTS form_link_sent_count int DEFAULT 0;

-- 3-7. RPCs applied directly to live DB (client_self_update updated, 5 new RPCs created)
-- See _compute_sale_commissions pattern: all applied via execute_sql in session.
