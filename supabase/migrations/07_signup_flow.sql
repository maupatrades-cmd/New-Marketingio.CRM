-- 07_signup_flow.sql
-- Extends public.clients to carry full multi-step signup data, plus an RPC
-- the new user calls on the final step to persist everything atomically.

alter table public.clients
  add column if not exists mobile_number text,
  add column if not exists signup_data jsonb,
  add column if not exists popia_consent_given boolean not null default false,
  add column if not exists popia_consent_at timestamptz,
  add column if not exists signup_completed_steps integer;

create or replace function public.submit_signup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_client_id uuid;
  v_full_name text;
  v_popia     boolean := coalesce((payload->>'popia_consent')::boolean, false);
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_full_name := nullif(trim(payload->>'full_name'), '');

  update public.profiles
    set full_name = coalesce(v_full_name, full_name),
        phone     = coalesce(payload->>'mobile_number', phone)
    where id = v_uid;

  -- Reuse an existing client tied to this user if any (idempotent step 5 retry).
  select id into v_client_id
    from public.clients
    where client_user_id = v_uid
    limit 1;

  if v_client_id is null then
    insert into public.clients (
      business_name, contact_person, email, phone, address, industry,
      status, source, client_user_id, created_by,
      mobile_number, signup_data,
      popia_consent_given, popia_consent_at, signup_completed_steps
    )
    values (
      coalesce(nullif(payload->>'business_name',''), v_full_name, 'New Client'),
      v_full_name,
      payload->>'email',
      payload->>'mobile_number',
      nullif(concat_ws(', ',
        nullif(payload->>'street_address',''),
        nullif(payload->>'city',''),
        nullif(payload->>'province','')
      ), ''),
      payload->>'industry',
      'lead',
      'inbound',
      v_uid, v_uid,
      payload->>'mobile_number',
      payload->'signup_data',
      v_popia,
      case when v_popia then now() else null end,
      coalesce((payload->>'completed_steps')::int, 5)
    )
    returning id into v_client_id;
  else
    update public.clients
      set business_name           = coalesce(nullif(payload->>'business_name',''), business_name),
          contact_person          = coalesce(v_full_name, contact_person),
          email                   = coalesce(payload->>'email', email),
          phone                   = coalesce(payload->>'mobile_number', phone),
          mobile_number           = coalesce(payload->>'mobile_number', mobile_number),
          industry                = coalesce(payload->>'industry', industry),
          signup_data             = coalesce(payload->'signup_data', signup_data),
          popia_consent_given     = v_popia or popia_consent_given,
          popia_consent_at        = case when v_popia and popia_consent_at is null then now() else popia_consent_at end,
          signup_completed_steps  = greatest(coalesce(signup_completed_steps,0), coalesce((payload->>'completed_steps')::int, 5))
      where id = v_client_id;
  end if;

  insert into public.client_activity_log(
    client_id, client_name, actor_id, actor_role,
    event_type, event_category, event_summary, event_metadata
  )
  select
    v_client_id, c.business_name, v_uid, 'client',
    'signup_completed', 'account',
    format('%s completed signup', coalesce(v_full_name, c.business_name)),
    payload
  from public.clients c where c.id = v_client_id;

  return jsonb_build_object('success', true, 'client_id', v_client_id);
end $$;

grant execute on function public.submit_signup(jsonb) to authenticated;
