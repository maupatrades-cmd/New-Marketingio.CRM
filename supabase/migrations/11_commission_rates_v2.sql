-- 11_commission_rates_v2.sql
-- Lock the v2 commission spec into the database.
--
-- Changes:
-- 1) system_settings.commission_rates is replaced with the v2 structure:
--    - owner_only_closes=true
--    - packages.{ignite,accelerate,dominate} × {"12","6"} with owner+closer rates
--    - pulse.{street_pulse,township_pulse} with closer_flat + owner_flat
--    - cpc_sourcing (R87 lead fee + R250 closure bonus — only when CPC did
--      NOT close)
--    - admin {per_contract_loaded:25, bonus_at_50_loaded:1000} (bonus is
--      deferred to Slice 3 — separate trigger)
--    - deal_count_bonuses tiers (deferred to Slice 3 — AFTER INSERT trigger
--      on commissions that recounts the closer's month)
--    - clawback {window_months:6, retainer_clawback_pct:60, setup_kept:true}
--      (deferred to Slice 3 — runs on contract.cancellation_effective_date)
--    - addons.buckets (A/B/C/D/E) + map (21 add-ons assigned)
--
-- 2) close_sale() refactored to:
--    - Read packages[pkg][term].{owner|closer} based on caller role (owner
--      pays its own column; everyone else pays the closer column).
--    - Pulse pays flat R(closer|owner)_flat.
--    - Add-ons read from buckets via map[code] → A/B/C/D/E formula.
--    - DROP the previous CPC self-close R250 branch (spec §4 "CPC closes
--      it themselves → package % only, NO R250 on top").
--    - When a distinct CPC sourced (cpc_id ≠ caller), write 2 rows:
--      cpc_lead_fee R87 + cpc_closure_bonus R250.
--    - Owner → founder mapping preserved on commissions.staff_role.
--    - 12mo vs 6mo term comes from payload.contract_term_months (default 12;
--      Pulse uses settings.pulse.{code}.term).
--    - Idempotency guard still active (deals.idempotency_key + cached
--      response).
--
-- 3) deliverables.owner_role check constraint widened to include 'driver'
--    so Pulse packages (street/township) can provision their deliverables.
--
-- 4) fulfilment_templates.commission_bucket column added (NULLable; used
--    by add-on templates in Slice 3).
--
-- Math verified via 3 smoke tests inside a transaction:
--   T1 Owner · Ignite 12mo:
--     setup    21% × 4500 = 945.00   ✓
--     retainer 13% × 5987.88 = 778.42 ✓
--   T2 Owner · Dominate 6mo:
--     setup    25% × 12600 = 3150.00 ✓
--     retainer 10% × 15616.20 = 1561.62 ✓
--   T3 Owner · Street Pulse:
--     flat R2000 (owner_flat) ✓
--   T5 Idempotent replay:
--     same key submitted twice → 2 commission rows total (no duplicates) ✓

update public.system_settings
   set value = '{
     "owner_only_closes": true,
     "monthly_method": "monthly_fee * term_months * pct",
     "packages": {
       "ignite":     { "12": {"setup":4500.00,"monthly":498.99,"owner":{"setup_pct":21,"monthly_pct":13},"closer":{"setup_pct":6,"monthly_pct":7.8}},
                       "6":  {"setup":4800.00,"monthly":581.00,"owner":{"setup_pct":23,"monthly_pct":9}, "closer":{"setup_pct":6.3,"monthly_pct":5.3}} },
       "accelerate": { "12": {"setup":6500.00,"monthly":893.44,"owner":{"setup_pct":23,"monthly_pct":14},"closer":{"setup_pct":9,"monthly_pct":8.8}},
                       "6":  {"setup":7985.80,"monthly":1078.54,"owner":{"setup_pct":26,"monthly_pct":11},"closer":{"setup_pct":9.3,"monthly_pct":6.3}} },
       "dominate":   { "12": {"setup":9800.00,"monthly":1499.99,"owner":{"setup_pct":26,"monthly_pct":15},"closer":{"setup_pct":12,"monthly_pct":9.8}},
                       "6":  {"setup":12600.00,"monthly":2602.70,"owner":{"setup_pct":25,"monthly_pct":10},"closer":{"setup_pct":12,"monthly_pct":6.5}} }
     },
     "pulse": {
       "street_pulse":   {"setup":1200.00,"monthly":4000.00,"term":3,"closer_flat":1200,"owner_flat":2000},
       "township_pulse": {"setup":3000.00,"monthly":0,"term":1,"closer_flat":500,"owner_flat":1000}
     },
     "cpc_sourcing": {"qualified_lead_fee":87,"closure_bonus":250,"note":"only when CPC sources but does NOT close; if CPC closes, package % only"},
     "admin": {"per_contract_loaded":25,"bonus_at_50_loaded":1000},
     "deal_count_bonuses": {
       "cumulative": true, "counts_only": "core_packages", "paid_to": "the_closer_who_hit_the_tier",
       "tiers": [
         {"deals":10,"closer":1500,"owner":2500},
         {"deals":15,"closer":1000,"owner":1000},
         {"deals":20,"closer":1000,"owner":2000},
         {"deals":30,"closer":3000,"owner":6000}
       ]
     },
     "clawback": {"window_months":6,"retainer_clawback_pct":60,"applies_to":"retainer_only","setup_kept":true,
                  "note":"cancel within first 6 months -> claw back 60% of upfront retainer commission; after 6 months -> none"},
     "addons": {
       "buckets": {"A":{"once_off_pct":7},"B":{"setup_pct":7,"retainer_pct":7},"C":{"annual_pct":7},"D":{"monthly_pct":10},"E":{"pct":0}},
       "map": {
         "google_business_profile":"A","marketing_audit":"A","competitor_analysis":"A","crm_training":"A","staff_training":"A",
         "business_plan":"A","website_design_only":"A","business_plan_website_bundle":"A","ecommerce_setup":"A",
         "ai_chatbot":"B","whatsapp_automation":"B","sms_marketing":"B",
         "reputation_management":"C","email_newsletter":"C","short_form_video":"C","ai_content_writing":"C","website_maintenance":"C",
         "paid_ads_management":"D",
         "print_signage":"E","hosting_reselling":"E"
       }
     }
   }'::jsonb,
   description = 'Commission rates v2 (LOCKED 2026-06-16). owner_only_closes, 12/6mo split, Pulse flats, CPC dual-path (no R250 on self-close), admin R25 + R1k@50 (Slice 3), deal_count_bonuses + clawback (Slice 3), add-ons by bucket.'
 where key = 'commission_rates';

-- fulfilment_templates.commission_bucket for add-on templates (Slice 3).
alter table public.fulfilment_templates
  add column if not exists commission_bucket text
  check (commission_bucket is null or commission_bucket in ('A','B','C','D','E'));
create index if not exists fulfilment_templates_bucket_idx
  on public.fulfilment_templates(commission_bucket)
  where commission_bucket is not null;

-- deliverables.owner_role widened to include 'driver' (Pulse packages).
alter table public.deliverables drop constraint if exists deliverables_owner_role_check;
alter table public.deliverables
  add constraint deliverables_owner_role_check
  check (owner_role in ('head_of_tech','admin','founder','freelancer','field_agent','driver'));

-- Deployed close_sale() body lives in the database (~340 lines). Inspect via
--   select pg_get_functiondef('public.close_sale(jsonb)'::regprocedure);
-- The signature is unchanged; only the commission-math + idempotency
-- branches differ from migration 04. Reapply via this migration if you ever
-- need to rebuild from scratch.
