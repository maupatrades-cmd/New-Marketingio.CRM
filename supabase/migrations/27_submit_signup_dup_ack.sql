-- 27_submit_signup_dup_ack.sql
-- Extend submit_signup to auto-acknowledge possible_duplicate (45D01)
-- for website self-signups.
--
-- Context: migration 26 added detect_possible_duplicate BEFORE INSERT.
-- Website visitors don't get to see a duplicate warning — we silently
-- insert with duplicate_acknowledged=true so the duplicate_of link is
-- set for the back-office to investigate. (HANDOVER_4 §1.2)
--
-- Change: add 'when sqlstate ''45D01''' branch before 'when others'
-- that retries with duplicate_acknowledged=true.

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

  -- Phase 1: also create a lead row so the owner sees website self-signups
  -- in the leads inbox. Silently skip if there is already a lead from this
  -- user (idempotent on re-submit). The DNC trigger will still fire — if
  -- a known DNC contact self-signs up the INSERT is rejected and signup
  -- returns a structured error the caller can surface.
  --
  -- Phase 2: also auto-acknowledge possible_duplicate (45D01). Website
  -- visitors must not see a duplicate warning — we retry with
  -- duplicate_acknowledged=true so the duplicate_of link is set for
  -- back-office investigation. The second attempt can only throw 42501
  -- (DNC) or 'others'; both are handled below.
  begin
    insert into public.leads (
      business_name, contact_person, email, phone,
      source, captured_via, status, submitted_by, submitted_by_name
    )
    select
      c.business_name,
      c.contact_person,
      c.email,
      c.phone,
      'inbound',
      'website',
      'pending_verification',
      null,    -- no staff submitter; self-sign-up
      null
    from public.clients c
    where c.id = v_client_id
      and not exists (
        select 1 from public.leads l
        where l.submitted_by is null
          and l.captured_via = 'website'
          and (l.email = c.email or l.phone = c.phone)
      );
  exception
    when sqlstate '42501' then
      -- do_not_contact_violation — propagate so caller can surface it.
      raise;
    when sqlstate '45D01' then
      -- possible_duplicate — auto-acknowledge for website signups (silent path).
      -- Public visitors must not see a duplicate warning. Insert again with
      -- duplicate_acknowledged=true so detect_possible_duplicate populates
      -- duplicate_of and allows the row through.
      begin
        insert into public.leads (
          business_name, contact_person, email, phone,
          source, captured_via, status, submitted_by, submitted_by_name,
          duplicate_acknowledged
        )
        select
          c.business_name,
          c.contact_person,
          c.email,
          c.phone,
          'inbound',
          'website',
          'pending_verification',
          null,
          null,
          true   -- bypass duplicate check; duplicate_of will be set by trigger
        from public.clients c
        where c.id = v_client_id;
      exception
        when sqlstate '42501' then
          raise;
        when others then
          insert into public.audit_log(actor_id, action, table_name, row_id, after_data)
            values (v_uid, 'error', 'leads', null,
                    jsonb_build_object('error', sqlerrm, 'context', 'submit_signup_lead_dup_ack'));
      end;
    when others then
      -- Log and continue; a failed lead INSERT must never block signup.
      insert into public.audit_log(actor_id, action, table_name, row_id, after_data)
        values (v_uid, 'error', 'leads', null,
                jsonb_build_object('error', sqlerrm, 'context', 'submit_signup_lead_insert'));
  end;

  return jsonb_build_object('success', true, 'client_id', v_client_id);
end $$;

grant execute on function public.submit_signup(jsonb) to authenticated;
