-- 10_welcome_images_bucket.sql
-- Public-read storage bucket for AI-generated welcome-email hero images.
-- Layout: welcome-images/welcome/<client_id>.png
-- Created and written by the generate-welcome-image Edge Function (service
-- role bypasses RLS). Email clients read via the public URL.

insert into storage.buckets (id, name, public)
values ('welcome-images', 'welcome-images', true)
on conflict (id) do update set public = excluded.public;

-- Public read for the bucket so the hero <img src=...> in emails resolves.
drop policy if exists welcome_images_public_read on storage.objects;
create policy welcome_images_public_read on storage.objects
  for select using (bucket_id = 'welcome-images');
