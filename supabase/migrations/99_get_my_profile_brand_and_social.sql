-- Migration 99: get_my_profile now returns brand + social + assets +
-- uses _pick_best_deal for the deal field.
--
-- Powers the Directive 19 Part 8 Profile sections (brand colours,
-- brand fonts, tone of voice, languages, words to avoid, Facebook /
-- Instagram / TikTok / Google account, brand assets gallery).
--
-- The `deal` subquery also switches from ORDER BY created_at DESC LIMIT 1
-- to _pick_best_deal(v_cid) so upsell add-ons with package='none' don't
-- clobber the client's real core package in the Profile "Package" row.

create or replace function public.get_my_profile()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_cid uuid; v_r jsonb;
begin
  select id into v_cid from clients where client_user_id = auth.uid();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  select jsonb_build_object('ok', true,
    'client', (select jsonb_build_object(
      'id', c.id, 'business_name', c.business_name, 'contact_person', c.contact_person,
      'email', c.email, 'phone', c.phone, 'whatsapp_number', c.whatsapp_number,
      'website', c.website, 'address', c.address, 'logo_url', c.logo_url,
      'brand_colors', c.brand_colors, 'brand_fonts', c.brand_fonts,
      'tone_of_voice', c.tone_of_voice, 'languages', c.languages,
      'words_to_avoid', c.words_to_avoid,
      'facebook_page_url', c.facebook_page_url, 'instagram_handle', c.instagram_handle,
      'tiktok_handle', c.tiktok_handle, 'google_account_email', c.google_account_email,
      'brand_assets_urls', c.brand_assets_urls,
      'created_at', c.created_at)
      from clients c where c.id = v_cid),
    'deal', (select jsonb_build_object('package', d.package, 'stage', d.stage)
      from deals d where d.id = _pick_best_deal(v_cid)),
    'preferences', (select row_to_json(np)::jsonb from notification_preferences np where np.user_id = auth.uid())
  ) into v_r;
  return v_r;
end; $$;
