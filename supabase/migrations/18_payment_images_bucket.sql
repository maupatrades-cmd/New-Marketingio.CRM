-- SPEC-4 — Payment success moment: cached AI hero image per invoice.
-- See supabase/functions/_shared/paymentSuccess.ts.
--
-- The payfast-itn webhook calls generate-payment-image after flipping
-- an invoice to paid. The generated PNG is cached at
-- payment-images/payment/<invoice_id>.png so a duplicate webhook never
-- re-runs Gemini, and the URL stays stable for the receipt email.
--
-- Bucket is PUBLIC because the URL is rendered inline by email clients
-- (mostly through their image proxies). The path is keyed by invoice UUID
-- so enumeration would require already knowing the UUID — same threat
-- model as the existing welcome-images bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-images',
  'payment-images',
  true,
  10485760,                  -- 10 MB cap
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;
