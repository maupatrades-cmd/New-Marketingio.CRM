-- 44_allow_other_package_deals_contracts.sql
-- Extend deals.package and contracts.package CHECK constraints to accept 'other'.

alter table public.deals drop constraint if exists deals_package_check;
alter table public.deals add constraint deals_package_check
  check (package = any (array['ignite','accelerate','dominate','street_pulse','township_pulse','other','none']));

alter table public.contracts drop constraint if exists contracts_package_check;
alter table public.contracts add constraint contracts_package_check
  check (package = any (array['ignite','accelerate','dominate','street_pulse','township_pulse','other','add_on']));
