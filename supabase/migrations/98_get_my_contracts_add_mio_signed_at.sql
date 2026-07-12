-- Migration 98: expose mio_signed_at + popia_signed on get_my_contracts.
--
-- The client-portal Contracts page (Directive 19 Part 3) now renders
-- a "MiO counter-signed" chip alongside the client's own signed_at,
-- and the contract detail's verification scanner (Part 4) reads the
-- same fields. drop-recreate is required because add-a-column would
-- change the return signature.

drop function if exists public.get_my_contracts();

create or replace function public.get_my_contracts()
returns table (
  id                uuid,
  status            text,
  package           text,
  document_url      text,
  client_signed_at  timestamptz,
  mio_signed_at     timestamptz,
  popia_signed      boolean,
  created_at        timestamptz,
  signing_url       text
)
language plpgsql security definer set search_path to 'public'
as $$
declare v_client_id uuid;
begin
  select cl.id into v_client_id from clients cl where cl.client_user_id = auth.uid();
  return query
  select c.id, c.status, d.package, c.document_url,
         c.client_signed_at, c.mio_signed_at, c.popia_signed,
         c.created_at,
         case when c.signing_token is not null
                  and (c.signing_token_expires_at is null or c.signing_token_expires_at > now())
              then 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app/sign/' || c.signing_token
              else null end
  from contracts c join deals d on d.id = c.deal_id
  where d.client_id = v_client_id
  order by c.created_at desc;
end; $$;

revoke all on function public.get_my_contracts() from public, anon;
grant execute on function public.get_my_contracts() to authenticated;
