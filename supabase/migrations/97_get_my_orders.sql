-- Migration 97: get_my_orders — client-portal Orders page source.
--
-- Returns every deal for the caller's client (including add-ons and
-- upsells), newest first, so the /client/orders page can render real
-- history instead of an empty state.

create or replace function public.get_my_orders()
returns table (
  id uuid, package text, add_on_name text, deal_type text, stage text,
  setup_fee numeric, monthly_retainer numeric, source text, is_upsell boolean,
  created_at timestamptz
)
language plpgsql security definer set search_path to 'public'
as $$
declare v_cid uuid;
begin
  select cl.id into v_cid from clients cl where cl.client_user_id = auth.uid();
  if v_cid is null then raise exception 'not_a_client'; end if;
  return query
  select d.id, d.package, d.add_on_name, d.deal_type, d.stage,
         d.setup_fee, d.monthly_retainer, d.source, d.is_upsell, d.created_at
  from deals d
  where d.client_id = v_cid
  order by d.created_at desc;
end; $$;

revoke all on function public.get_my_orders() from public, anon;
grant execute on function public.get_my_orders() to authenticated;
