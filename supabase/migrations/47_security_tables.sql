-- Migration 47: Security tables
-- profile_password_history, account_deletion_requests, security_questions,
-- emergency_lockdown_tokens, user_lockouts, notification_preferences

create table public.profile_password_history (
  user_id    uuid references auth.users(id) on delete cascade,
  pw_hash    text not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, changed_at)
);
alter table public.profile_password_history enable row level security;

create table public.account_deletion_requests (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade unique,
  cancel_token          uuid not null default gen_random_uuid(),
  requested_at          timestamptz not null default now(),
  scheduled_deletion_at timestamptz not null,
  cancelled_at          timestamptz,
  cancel_reason         text,
  completed_at          timestamptz,
  completion_status     text not null default 'pending'
    check (completion_status in ('pending','cancelled','anonymised'))
);
alter table public.account_deletion_requests enable row level security;
create policy "adr_self_read" on public.account_deletion_requests
  for select using (user_id = auth.uid());
create policy "adr_owner_admin_read" on public.account_deletion_requests
  for select using (
    has_role(auth.uid(),'owner'::app_role) or
    has_role(auth.uid(),'admin'::app_role)
  );

create table public.security_questions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  question_1 text,
  answer_1_hash text,
  question_2 text,
  answer_2_hash text,
  question_3 text,
  answer_3_hash text,
  question_4 text,
  answer_4_hash text,
  set_at     timestamptz,
  updated_at timestamptz
);
alter table public.security_questions enable row level security;

create table public.emergency_lockdown_tokens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  lockdown_token   uuid not null default gen_random_uuid(),
  expires_at       timestamptz not null,
  used_at          timestamptz,
  triggered_action text,
  issued_reason    text,
  created_at       timestamptz not null default now()
);
alter table public.emergency_lockdown_tokens enable row level security;

create table public.user_lockouts (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  failed_attempts       integer not null default 0,
  first_failure_at      timestamptz,
  locked_until          timestamptz,
  unlock_token          uuid,
  unlock_token_expires  timestamptz
);
alter table public.user_lockouts enable row level security;
create policy "lockout_self_read" on public.user_lockouts
  for select using (user_id = auth.uid());
create policy "lockout_owner_read" on public.user_lockouts
  for select using (has_role(auth.uid(),'owner'::app_role));

create table public.notification_preferences (
  user_id                    uuid primary key references auth.users(id) on delete cascade,
  email_invoice_issued       boolean not null default true,
  email_deliverable_ready    boolean not null default true,
  email_monthly_report       boolean not null default true,
  email_payment_received     boolean not null default true,
  updated_at                 timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create policy "notifpref_self" on public.notification_preferences
  for all using (user_id = auth.uid());
