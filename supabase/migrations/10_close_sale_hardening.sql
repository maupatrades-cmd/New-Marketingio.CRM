-- 10_close_sale_hardening.sql
-- Three pre-slice-2 hardening fixes for close_sale():
--
-- 1) IDEMPOTENCY GUARD — a double-tap from a flaky connection no longer
--    creates two deals + double commissions. We add a unique-keyed
--    column and persist the original response so a replay returns it
--    verbatim with `idempotent_replay: true`.
--
-- 2) ADD-ON COMMISSION FROM SETTINGS — previously the add_on branch
--    wrote `commission_amount = setup_fee` (100% payout, oops). Now it
--    multiplies setup_fee by add_on_setup_pct and monthly_retainer ×
--    term by add_on_retainer_pct, both keys in
--    system_settings.commission_rates (10% defaults). Owner can change
--    without a deploy.
--
-- 3) MISSING FULFILMENT TEMPLATE IS NON-FATAL — for core_package deals
--    when the template lookup misses, we now log a
--    `deliverables_skipped` activity_log row instead of failing
--    silently. Deal + commissions + contract + onboarding + tasks +
--    activity log all still commit; only deliverables are skipped.

alter table public.deals
  add column if not exists idempotency_key   uuid,
  add column if not exists close_sale_response jsonb;

create unique index if not exists deals_idempotency_key_unique
  on public.deals(idempotency_key)
  where idempotency_key is not null;

-- Add-on rates baked into system_settings (idempotent — owner can edit).
update public.system_settings
   set value = value || jsonb_build_object(
     'add_on_setup_pct',    coalesce(value->'add_on_setup_pct',    to_jsonb(10)),
     'add_on_retainer_pct', coalesce(value->'add_on_retainer_pct', to_jsonb(10))
   )
 where key = 'commission_rates';

-- See deployed close_sale() in supabase/functions or via
--   select pg_get_functiondef('public.close_sale(jsonb)'::regprocedure);
-- for the full body. The signature is unchanged; only the add-on
-- branch + idempotency guard + template-miss logging are new.
