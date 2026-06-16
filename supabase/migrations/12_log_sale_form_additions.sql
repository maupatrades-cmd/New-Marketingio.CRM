-- Schema additions to support the Log Sale form spec (Slice 2).
-- All additive — nothing existing is broken.

-- deliverables.is_custom: flag for custom deliverables added on the form.
-- Custom deliverables do NOT affect price or commission. They route to
-- head_of_tech and get phase='setup' with a +14 day default due date.
alter table public.deliverables
  add column if not exists is_custom boolean not null default false;
create index if not exists deliverables_is_custom_idx
  on public.deliverables(is_custom) where is_custom = true;

-- deals.* — captured on Step 4 of the form and persisted on submit.
alter table public.deals
  add column if not exists brief             text,
  add column if not exists brand_notes       text,
  add column if not exists discovery         jsonb,
  add column if not exists expected_start_date date;

-- clients.* — richer Step 1 fields (all optional).
alter table public.clients
  add column if not exists whatsapp_number text,
  add column if not exists website         text,
  add column if not exists socials         jsonb,
  add column if not exists gmaps_url       text,
  add column if not exists logo_url        text;

-- attachments — uploads attached to deals AFTER the sale commits.
-- Rule: the sale never blocks on an upload. File uploads happen async
-- after close_sale returns; failures retry; the deal is intact regardless.
-- Sensitive attachments (client_id type) are RLS-gated to owner/admin
-- only and must be stored encrypted in Supabase Storage with a
-- restricted bucket policy.
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid references public.deals(id)   on delete cascade,
  client_id    uuid references public.clients(id) on delete cascade,
  type         text not null check (type in (
                 'signed_contract','client_id','logo','storefront','other')),
  storage_path text not null,
  filename     text,
  size_bytes   integer,
  mime_type    text,
  is_sensitive boolean not null default false,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists attachments_deal_idx   on public.attachments(deal_id);
create index if not exists attachments_client_idx on public.attachments(client_id);

alter table public.attachments enable row level security;
drop policy if exists attachments_read on public.attachments;
create policy attachments_read on public.attachments for select using (
  case when is_sensitive
       then (public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin'))
       else (uploaded_by = auth.uid()
             or exists (select 1 from public.clients c
                          where c.id = attachments.client_id
                            and c.client_user_id = auth.uid())
             or public.has_role(auth.uid(),'owner')
             or public.has_role(auth.uid(),'admin'))
  end
);
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert with check (
  public.has_role(auth.uid(),'owner') or public.has_role(auth.uid(),'admin')
  or public.has_role(auth.uid(),'field_agent') or public.has_role(auth.uid(),'cpc')
);
