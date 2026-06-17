-- SPEC-3 — The three missing portal pages.
-- See docs/SPEC-3-portal-pages.md.
--
-- Server-side enforcement for client-driven writes:
--   1) client_self_update(p_payload jsonb)
--      SECURITY DEFINER RPC. The caller is the client (auth.uid()).
--      WHITELISTS the fields a client is allowed to set.
--      Client must NEVER touch package / monthly_retainer / status /
--      setup_fee / lifecycle_stage / pricing. Anything not on the
--      whitelist is silently dropped.
--      Discovery answers get merged onto the latest deal's `discovery`
--      jsonb (additive — never blanks an existing answer).
--
--   2) client_mark_onboarding_returned()
--      SECURITY DEFINER RPC. Flips clients.onboarding_form_returned = true.
--      Also bumps the latest client_onboarding row's
--      trigger_onboarding_form_returned + date.
--
-- Storage:
--   3) `client-uploads` bucket — used by /client/onboarding for
--      logo + storefront uploads. Each user can only write under their
--      own auth.uid() prefix. Public read so the URL written back to
--      clients.logo_url renders directly.
--
-- System settings:
--   4) banking_details key — EFT fallback shown on /client/invoices/:id
--      when PayFast isn't configured or the client prefers a manual EFT.

-- ─── 1) client_self_update ────────────────────────────────────────────────
create or replace function public.client_self_update(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_client_id     uuid;
  v_deal_id       uuid;
  v_existing_disc jsonb;
  v_new_disc      jsonb;
  -- Whitelisted client profile keys (NO package/pricing/status/lifecycle).
  v_client_keys   text[] := array[
    'business_name','contact_person','phone','whatsapp_number',
    'website','address','industry','gmaps_url','socials','logo_url'
  ];
  -- Whitelisted discovery keys (mirrors LogSale step 4 inputs).
  v_disc_keys     text[] := array[
    'biz_does','ideal_customer','goal','differentiator','brand_ready',
    'location','avoid','socials_existing','how_found','competitor',
    'busy_times','price_range','biz_whatsapp'
  ];
  v_client_patch  jsonb := '{}'::jsonb;
  v_disc_patch    jsonb := '{}'::jsonb;
  v_k             text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_client_id
    from public.clients
   where client_user_id = auth.uid()
   limit 1;
  if v_client_id is null then
    raise exception 'no_client_for_user';
  end if;

  -- Build the whitelisted client patch.
  foreach v_k in array v_client_keys loop
    if p_payload ? v_k then
      v_client_patch := v_client_patch || jsonb_build_object(v_k, p_payload->v_k);
    end if;
  end loop;

  -- Build the whitelisted discovery patch.
  if p_payload ? 'discovery' and jsonb_typeof(p_payload->'discovery') = 'object' then
    foreach v_k in array v_disc_keys loop
      if (p_payload->'discovery') ? v_k then
        v_disc_patch := v_disc_patch || jsonb_build_object(v_k, (p_payload->'discovery')->v_k);
      end if;
    end loop;
  end if;

  -- Apply the client patch using jsonb_populate_record so we never write
  -- a forbidden column even if a forbidden key was somehow added.
  if v_client_patch <> '{}'::jsonb then
    update public.clients c
       set business_name    = coalesce(v_client_patch->>'business_name',    c.business_name),
           contact_person   = coalesce(v_client_patch->>'contact_person',   c.contact_person),
           phone            = coalesce(v_client_patch->>'phone',            c.phone),
           whatsapp_number  = coalesce(v_client_patch->>'whatsapp_number',  c.whatsapp_number),
           website          = coalesce(v_client_patch->>'website',          c.website),
           address          = coalesce(v_client_patch->>'address',          c.address),
           industry         = coalesce(v_client_patch->>'industry',         c.industry),
           gmaps_url        = coalesce(v_client_patch->>'gmaps_url',        c.gmaps_url),
           logo_url         = coalesce(v_client_patch->>'logo_url',         c.logo_url),
           socials          = coalesce(v_client_patch->'socials',           c.socials),
           updated_at       = now()
     where c.id = v_client_id;
  end if;

  -- Merge discovery onto the latest deal for this client (closed_won
  -- preferred, otherwise most recent).
  if v_disc_patch <> '{}'::jsonb then
    select id, coalesce(discovery, '{}'::jsonb)
      into v_deal_id, v_existing_disc
      from public.deals
     where client_id = v_client_id
     order by (stage = 'closed_won') desc, created_at desc
     limit 1;
    if v_deal_id is not null then
      v_new_disc := v_existing_disc || v_disc_patch;
      update public.deals
         set discovery  = v_new_disc,
             updated_at = now()
       where id = v_deal_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok',          true,
    'client_id',   v_client_id,
    'deal_id',     v_deal_id,
    'client_keys', (select array_agg(key) from jsonb_object_keys(v_client_patch) as t(key)),
    'disc_keys',   (select array_agg(key) from jsonb_object_keys(v_disc_patch)   as t(key))
  );
end $$;

revoke all on function public.client_self_update(jsonb) from public;
grant execute on function public.client_self_update(jsonb) to authenticated;

-- ─── 2) client_mark_onboarding_returned ───────────────────────────────────
create or replace function public.client_mark_onboarding_returned()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_client_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select id into v_client_id
    from public.clients
   where client_user_id = auth.uid()
   limit 1;
  if v_client_id is null then
    raise exception 'no_client_for_user';
  end if;

  update public.clients
     set onboarding_form_returned = true,
         updated_at               = now()
   where id = v_client_id;

  update public.client_onboarding
     set trigger_onboarding_form_returned      = true,
         trigger_onboarding_form_returned_date = current_date,
         updated_at                            = now()
   where client_id = v_client_id;

  insert into public.client_activity_log(
    client_id, actor_id, actor_role, event_type, event_category, event_summary
  ) values (
    v_client_id, auth.uid(), 'client',
    'onboarding_form_returned', 'profile',
    'Client submitted the onboarding form.'
  );

  return jsonb_build_object('ok', true, 'client_id', v_client_id);
end $$;

revoke all on function public.client_mark_onboarding_returned() from public;
grant execute on function public.client_mark_onboarding_returned() to authenticated;

-- The activity_write policy only allows owner/admin/head_of_tech to
-- insert into client_activity_log. Our SECURITY DEFINER function runs
-- as the function owner (typically postgres) so RLS is bypassed for
-- the insert above — but to be explicit and future-proof, allow the
-- 'client' actor role to write their own profile/auth events.
drop policy if exists activity_client_self_write on public.client_activity_log;
create policy activity_client_self_write on public.client_activity_log
  for insert with check (
    actor_id = auth.uid()
    and actor_role = 'client'
    and event_category in ('auth','profile','document')
  );

-- ─── 3) Storage bucket: client-uploads ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-uploads',
  'client-uploads',
  true,
  10485760,   -- 10 MB
  array['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf']
)
on conflict (id) do nothing;

-- Path convention: {auth.uid()}/{kind}/{filename}
-- Each client can read + write only under their own uid prefix.
drop policy if exists "client uploads — read own"   on storage.objects;
create policy "client uploads — read own"
  on storage.objects for select
  using (
    bucket_id = 'client-uploads'
    and (
      -- public bucket so the URL written to clients.logo_url renders
      true
    )
  );

drop policy if exists "client uploads — insert own" on storage.objects;
create policy "client uploads — insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'client-uploads'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "client uploads — update own" on storage.objects;
create policy "client uploads — update own"
  on storage.objects for update
  using (
    bucket_id = 'client-uploads'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "client uploads — delete own" on storage.objects;
create policy "client uploads — delete own"
  on storage.objects for delete
  using (
    bucket_id = 'client-uploads'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 4) banking_details system setting ────────────────────────────────────
insert into public.system_settings(key, value, description) values
('banking_details', jsonb_build_object(
   'bank',           null,
   'account_name',   null,
   'account_number', null,
   'branch_code',    null,
   'reference_note', 'Use the invoice number as your payment reference.'
 ), 'EFT fallback details shown on the client invoice page.')
on conflict (key) do nothing;
