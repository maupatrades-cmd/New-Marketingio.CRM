-- ============================================================================
-- Round 5 · Item 41 — storefront photo support on clients
-- ----------------------------------------------------------------------------
-- The post-sale-orchestrator email surfaces "Storefront / business photo" as
-- an outstanding item until we have one on file. Round 5 adds the field to
-- the client's Onboarding form (Section 4 "Your brand assets"). Storing the
-- URL directly on the client keeps the update path identical to logo_url —
-- goes through client_self_update, no new RPC needed, no attachments-table
-- INSERT permission to grant.
--
-- Idempotent + safe to re-apply.
-- ============================================================================

alter table public.clients
  add column if not exists storefront_photo_url text;

-- ----------------------------------------------------------------------------
-- Extend client_self_update to accept the new key. Whitelist model is
-- preserved — clients still can't touch package/pricing/status/lifecycle
-- fields.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.client_self_update(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_client_id     uuid;
  v_deal_id       uuid;
  v_existing_disc jsonb;
  v_new_disc      jsonb;
  v_client_keys   text[] := array[
    'business_name','contact_person','phone','whatsapp_number',
    'website','address','industry','gmaps_url','socials','logo_url',
    'storefront_photo_url',
    'brand_colors','brand_fonts','tone_of_voice','languages',
    'words_to_avoid','posting_preference','google_account_email',
    'facebook_page_url','instagram_handle','tiktok_handle','twitter_handle',
    'preferred_call_time','onboarding_notes','brand_assets_urls',
    'trading_name','registration_number','vat_number',
    'employee_count','years_in_business'
  ];
  v_disc_keys     text[] := array[
    'biz_does','ideal_customer','goal','differentiator','brand_ready',
    'location','avoid','socials_existing','how_found','competitor',
    'busy_times','price_range','biz_whatsapp'
  ];
  v_client_patch  jsonb := '{}'::jsonb;
  v_disc_patch    jsonb := '{}'::jsonb;
  v_k             text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into v_client_id from public.clients where client_user_id = auth.uid() limit 1;
  if v_client_id is null then raise exception 'no_client_for_user'; end if;

  foreach v_k in array v_client_keys loop
    if p_payload ? v_k then v_client_patch := v_client_patch || jsonb_build_object(v_k, p_payload->v_k); end if;
  end loop;

  if p_payload ? 'discovery' and jsonb_typeof(p_payload->'discovery') = 'object' then
    foreach v_k in array v_disc_keys loop
      if (p_payload->'discovery') ? v_k then
        v_disc_patch := v_disc_patch || jsonb_build_object(v_k, (p_payload->'discovery')->v_k);
      end if;
    end loop;
  end if;

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
           storefront_photo_url = coalesce(v_client_patch->>'storefront_photo_url', c.storefront_photo_url),
           socials          = coalesce(v_client_patch->'socials',           c.socials),
           brand_colors     = coalesce(v_client_patch->>'brand_colors',     c.brand_colors),
           brand_fonts      = coalesce(v_client_patch->>'brand_fonts',      c.brand_fonts),
           tone_of_voice    = coalesce(v_client_patch->>'tone_of_voice',    c.tone_of_voice),
           languages        = coalesce(v_client_patch->>'languages',        c.languages),
           words_to_avoid   = coalesce(v_client_patch->>'words_to_avoid',   c.words_to_avoid),
           posting_preference = coalesce(v_client_patch->>'posting_preference', c.posting_preference),
           google_account_email = coalesce(v_client_patch->>'google_account_email', c.google_account_email),
           facebook_page_url = coalesce(v_client_patch->>'facebook_page_url', c.facebook_page_url),
           instagram_handle = coalesce(v_client_patch->>'instagram_handle', c.instagram_handle),
           tiktok_handle    = coalesce(v_client_patch->>'tiktok_handle',    c.tiktok_handle),
           twitter_handle   = coalesce(v_client_patch->>'twitter_handle',   c.twitter_handle),
           preferred_call_time = coalesce(v_client_patch->>'preferred_call_time', c.preferred_call_time),
           onboarding_notes = coalesce(v_client_patch->>'onboarding_notes', c.onboarding_notes),
           brand_assets_urls = coalesce(v_client_patch->'brand_assets_urls', c.brand_assets_urls),
           trading_name     = coalesce(v_client_patch->>'trading_name',     c.trading_name),
           registration_number = coalesce(v_client_patch->>'registration_number', c.registration_number),
           vat_number       = coalesce(v_client_patch->>'vat_number',       c.vat_number),
           employee_count   = coalesce((v_client_patch->>'employee_count')::integer, c.employee_count),
           years_in_business = coalesce((v_client_patch->>'years_in_business')::integer, c.years_in_business),
           updated_at       = now()
     where c.id = v_client_id;
  end if;

  if v_disc_patch <> '{}'::jsonb then
    select id, coalesce(discovery, '{}'::jsonb)
      into v_deal_id, v_existing_disc
      from public.deals
     where client_id = v_client_id
     order by (stage = 'closed_won') desc, created_at desc
     limit 1;
    if v_deal_id is not null then
      v_new_disc := v_existing_disc || v_disc_patch;
      update public.deals set discovery = v_new_disc, updated_at = now() where id = v_deal_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'client_id', v_client_id, 'deal_id', v_deal_id,
    'client_keys', (select array_agg(key) from jsonb_object_keys(v_client_patch) as t(key)),
    'disc_keys',   (select array_agg(key) from jsonb_object_keys(v_disc_patch)   as t(key))
  );
end $function$;

revoke all on function public.client_self_update(jsonb) from public, anon;
grant execute on function public.client_self_update(jsonb) to authenticated;
