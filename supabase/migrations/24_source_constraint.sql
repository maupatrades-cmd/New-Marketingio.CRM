-- Extend leads.source to distinguish owner/admin staff captures from
-- inbound website self-signups (which use 'inbound' via submit_signup).
alter table public.leads
  drop constraint leads_source_check,
  add constraint leads_source_check check (source = any (array[
    'cpc_outbound',
    'field_agent_direct',
    'fnc_referral',
    'inbound',
    'referral',
    'phone_call_to_admin',
    'external_marketer',
    'owner_direct',
    'admin_direct',
    'other'
  ]));

-- Backfill the one mis-attributed owner capture from the smoke test.
update public.leads
set source = 'owner_direct'
where submitted_by = '4f1bccdd-be68-420f-9b7c-233fefaf52c2'
  and source = 'field_agent_direct'
  and created_at > now() - interval '2 hours';
