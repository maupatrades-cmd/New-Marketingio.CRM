-- Migration 96: allow client_portal_checkout as a deals.source value.
--
-- client_self_purchase (migration 92) creates deals with
-- source='client_portal_checkout' so the CRM can distinguish self-serve
-- portal purchases from staff-driven sales in reports, and the RPC's
-- 5-minute idempotency guard keys on that exact string. Was rejected
-- by deals_source_check on the live DB.

alter table public.deals drop constraint if exists deals_source_check;
alter table public.deals add constraint deals_source_check
  check (source = any (array[
    'cpc_outbound'::text,
    'field_agent_direct'::text,
    'fnc_referral'::text,
    'inbound'::text,
    'referral'::text,
    'client_portal_checkout'::text,
    'other'::text
  ]));
