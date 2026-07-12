-- 42_debit_day_full_month.sql
-- Loosen debit_day from {1,15} to any day 1..31 on deals and deal_debit_amendments.
-- stamp_deal_contract_dates and request_debit_day_change updated to clamp to
-- last-day-of-month so e.g. day=31 in Feb resolves to 28/29.

alter table public.deals drop constraint if exists deals_debit_day_check;
alter table public.deals add constraint deals_debit_day_check
  check (debit_day is null or (debit_day between 1 and 31));

alter table public.deal_debit_amendments drop constraint if exists deal_debit_amendments_old_debit_day_check;
alter table public.deal_debit_amendments add constraint deal_debit_amendments_old_debit_day_check
  check (old_debit_day between 1 and 31);

alter table public.deal_debit_amendments drop constraint if exists deal_debit_amendments_new_debit_day_check;
alter table public.deal_debit_amendments add constraint deal_debit_amendments_new_debit_day_check
  check (new_debit_day between 1 and 31);

-- See pg_proc for the updated request_debit_day_change and stamp_deal_contract_dates
-- function bodies (applied via apply_migration on 2026-06-21). They:
--   * accept p_debit_day in [1..31]
--   * clamp first-invoice/next-cycle date to the last valid day of the target month
