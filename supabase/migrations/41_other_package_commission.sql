-- 41_other_package_commission.sql
-- Add an "Other" core package with custom setup/monthly fees and free-form term.
-- Closer (field_agent / cpc / admin / non-owner): 10% setup, 20% monthly.
-- Owner: 25% setup, 37% monthly.
-- Monthly base = monthly_retainer * term_months (same convention as ignite/accelerate/dominate).
--
-- This migration was applied via mcp__Supabase__apply_migration on 2026-06-21.
-- The full SQL is captured in the corresponding migration row in supabase_migrations.schema_migrations.
--
-- It does three things:
--   1. jsonb_set on system_settings.commission_rates to add packages.other = {owner:{...}, closer:{...}}
--   2. CREATE OR REPLACE close_sale  — accepts package='other', emits setup_commission + retainer_commission
--   3. CREATE OR REPLACE _compute_sale_commissions — mirrors the 'other' branch for live preview
--
-- See the applied function bodies in pg_proc / Supabase Studio for the canonical SQL.

update public.system_settings
   set value = jsonb_set(
         value,
         '{packages,other}',
         '{"owner":{"setup_pct":25,"monthly_pct":37},"closer":{"setup_pct":10,"monthly_pct":20}}'::jsonb,
         true
       )
 where key = 'commission_rates';
