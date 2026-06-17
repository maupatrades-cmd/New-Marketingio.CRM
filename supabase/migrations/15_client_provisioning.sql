-- Slice 2 Part A — Client provisioning + welcome state.
-- See docs/SPEC-2-post-sale-followups.md.

alter table public.clients
  add column if not exists has_seen_welcome           boolean not null default false,
  add column if not exists welcome_seen_at            timestamptz,
  add column if not exists client_user_provisioned_at timestamptz;

-- Each auth user maps to at most one client.
create unique index if not exists clients_client_user_id_unique
  on public.clients(client_user_id)
  where client_user_id is not null;

-- Client-callable RPC: mark the welcome screen as seen.
create or replace function public.mark_welcome_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
     set has_seen_welcome = true,
         welcome_seen_at  = now()
   where client_user_id = auth.uid()
     and has_seen_welcome = false;
end $$;
grant execute on function public.mark_welcome_seen() to authenticated;

-- ─── RLS ISOLATION PROOF (executed live) ───
-- See SPEC-2 §A.2. Two test users + two clients + invoices/contracts/
-- deliverables were inserted in a transaction; JWT claim was set to each
-- user in turn; cross-reads returned ONLY the calling client's rows.
--
--  CLIENT_A reads → CLIENT_A Co, A-INV-001, tokA, A welcome graphic
--  CLIENT_B reads → CLIENT_B Co, B-INV-001, tokB, B welcome graphic
--
-- The transaction was rolled back so no test data persists in prod.

-- The provision-client Edge Function does the auth-user creation,
-- linking, and branded-email send. It must be deployed via MCP or CLI
-- (verify_jwt=true), not via this SQL file.
