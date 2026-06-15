-- 01_foundation.sql
-- Marketing iO CRM — foundation: roles, profiles, audit log, signup hook.
-- Idempotent. Safe to re-run.

create extension if not exists "pgcrypto";

-- =========================================================================
-- ROLE ENUM
-- Carry-over rule (HANDOVER §5.4): commission code maps owner -> founder
-- when writing Commission.staff_role. The app-level role enum keeps 'owner'.
-- =========================================================================
do $$ begin
  create type public.app_role as enum (
    'owner', 'admin', 'field_agent', 'cpc', 'head_of_tech', 'driver', 'client'
  );
exception when duplicate_object then null; end $$;

-- =========================================================================
-- PROFILES — mirror of auth.users for joins + public name display
-- =========================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text unique not null,
  full_name    text,
  phone        text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(email);

-- =========================================================================
-- USER ROLES — separate table; many users * many roles in theory,
-- in practice we treat first role as primary.
-- =========================================================================
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references auth.users(id),
  granted_at  timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_id_idx on public.user_roles(user_id);
create index if not exists user_roles_role_idx on public.user_roles(role);

-- =========================================================================
-- has_role() — SECURITY DEFINER so RLS policies can reference it without
-- recursive policy evaluation. STABLE so it's cached within a statement.
-- =========================================================================
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles
  where user_id = auth.uid()
  order by case role
    when 'owner' then 1
    when 'admin' then 2
    when 'head_of_tech' then 3
    when 'field_agent' then 4
    when 'cpc' then 5
    when 'driver' then 6
    when 'client' then 7
  end
  limit 1;
$$;

-- =========================================================================
-- AUDIT LOG — every business table attaches the generic trigger below.
-- =========================================================================
create table if not exists public.audit_log (
  id           bigserial primary key,
  table_name   text not null,
  row_id       text,
  action       text not null check (action in ('INSERT','UPDATE','DELETE')),
  actor_id     uuid,
  before_data  jsonb,
  after_data   jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_table_row_idx on public.audit_log(table_name, row_id);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id, created_at desc);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id text;
begin
  if (tg_op = 'DELETE') then
    v_row_id := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'key', to_jsonb(old)->>'code');
    insert into public.audit_log(table_name, row_id, action, actor_id, before_data, after_data)
    values (tg_table_name, v_row_id, 'DELETE', auth.uid(), to_jsonb(old), null);
    return old;
  elsif (tg_op = 'UPDATE') then
    v_row_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'key', to_jsonb(new)->>'code');
    insert into public.audit_log(table_name, row_id, action, actor_id, before_data, after_data)
    values (tg_table_name, v_row_id, 'UPDATE', auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  else
    v_row_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'key', to_jsonb(new)->>'code');
    insert into public.audit_log(table_name, row_id, action, actor_id, before_data, after_data)
    values (tg_table_name, v_row_id, 'INSERT', auth.uid(), null, to_jsonb(new));
    return new;
  end if;
end $$;

-- =========================================================================
-- handle_new_user — fires after auth.users insert; mirrors into profiles.
-- Role assignment happens explicitly via grant-role SQL (06_grant_owner.sql)
-- or via UI later.
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger helper
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- =========================================================================
-- RLS — profiles + user_roles
-- =========================================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (
    id = auth.uid()
    or public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.has_role(auth.uid(), 'owner'));

drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles
  for select using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'admin')
  );

drop policy if exists user_roles_owner_write on public.user_roles;
create policy user_roles_owner_write on public.user_roles
  for all using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

drop policy if exists audit_log_owner_read on public.audit_log;
create policy audit_log_owner_read on public.audit_log
  for select using (
    public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'admin')
  );

-- Attach audit trigger to foundation tables.
drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function public.audit_trigger();
