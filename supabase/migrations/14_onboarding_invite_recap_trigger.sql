-- Onboarding invite + recap email: fires automatically after every
-- closed_won deal.
--
-- Trigger maps deals.discovery (snake_case) to the template's camelCase
-- profile keys, computes the outstanding list (missing logo, missing
-- contract/storefront attachments), and POSTs to the send-email Edge
-- Function via pg_net.http_post.
--
-- pg_net is async by design — the email request never blocks the deal
-- commit. If Resend fails, the response is logged to net._http_response
-- and the deal still saves cleanly.

create or replace function public.fire_onboarding_invite_recap()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_client      public.clients;
  v_outstanding text[] := array[]::text[];
  v_profile     jsonb;
  v_business_name text;
  v_email       text;
begin
  if new.stage != 'closed_won' then return new; end if;

  select * into v_client from public.clients where id = new.client_id;
  if v_client.id is null then return new; end if;
  v_email := v_client.email;
  v_business_name := v_client.business_name;
  if v_email is null or v_email = '' then return new; end if;

  if v_client.logo_url is null or v_client.logo_url = '' then
    v_outstanding := array_append(v_outstanding, 'Logo file');
  end if;
  if not exists (select 1 from public.attachments
                  where deal_id = new.id and type = 'signed_contract') then
    v_outstanding := array_append(v_outstanding, 'Signed contract upload');
  end if;
  if not exists (select 1 from public.attachments
                  where client_id = v_client.id and type = 'storefront') then
    v_outstanding := array_append(v_outstanding, 'Storefront / business photo');
  end if;

  -- Map deals.discovery -> template camelCase profile keys.
  v_profile := jsonb_build_object(
    'businessDoes',    new.discovery->>'biz_does',
    'idealCustomers',  new.discovery->>'ideal_customer',
    'goal',            new.discovery->>'goal',
    'differentiator',  new.discovery->>'differentiator',
    'location',        new.discovery->>'location',
    'howFound',        new.discovery->>'how_found',
    'socials',         new.discovery->>'socials_existing',
    'competitor',      new.discovery->>'competitor',
    'busiest',         new.discovery->>'busy_times',
    'priceRange',      new.discovery->>'price_range',
    'whatsapp',        coalesce(new.discovery->>'biz_whatsapp', v_client.whatsapp_number),
    'avoid',           new.discovery->>'avoid',
    'brandAssets',     new.discovery->>'brand_ready'
  );

  perform net.http_post(
    url     := 'https://yyrzppuntgtvurnnksfc.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cnpwcHVudGd0dnVybm5rc2ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NjgwODYsImV4cCI6MjA5NzA0NDA4Nn0.DDKKh6JZGPN4MOH7VizvrjZkK0smFnKPjGkImyDYdek'
    ),
    body    := jsonb_build_object(
      'template', 'onboarding_invite_recap',
      'to',       v_email,
      'payload',  jsonb_build_object(
        'businessName', v_business_name,
        'profile',      v_profile,
        'outstanding',  to_jsonb(v_outstanding)
      )
    )
  );

  return new;
end $$;

drop trigger if exists deals_onboarding_recap on public.deals;
create trigger deals_onboarding_recap
  after insert on public.deals
  for each row execute function public.fire_onboarding_invite_recap();
