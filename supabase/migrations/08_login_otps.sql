-- 08_login_otps.sql
-- Email-OTP table for the second step of password sign-in.
-- Writes happen via the login-otp Edge Function using service-role.
-- No client reads.

create table if not exists public.login_otps (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  attempts    smallint not null default 0,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists login_otps_email_idx on public.login_otps(email, created_at desc);
create index if not exists login_otps_expires_idx on public.login_otps(expires_at);

alter table public.login_otps enable row level security;

drop policy if exists login_otps_no_read on public.login_otps;
create policy login_otps_no_read on public.login_otps for select using (false);
