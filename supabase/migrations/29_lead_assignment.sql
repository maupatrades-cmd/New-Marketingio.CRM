-- 29_lead_assignment.sql
-- Phase 3 PR 1: lead_assignment_history table, assign_lead RPC, RLS.
-- DO NOT APPLY until owner has reviewed and approved this file.
--
-- Design notes:
--   • SET LOCAL pattern: the RPC writes the optional reassignment reason into
--     a session-local GUC ("app.reassign_reason") before the UPDATE so the
--     BEFORE UPDATE trigger can read it without adding a transient column to leads.
--   • from_user_id is nullable — first assignment has no prior holder.
--   • No-op guard in RPC: if assigned_to already equals p_to_user_id, return early.
--   • notify-lead-assigned Edge Function call is a TODO (Phase 3 PR 2).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. lead_assignment_history
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.lead_assignment_history (
  id            bigserial primary key,
  lead_id       uuid        not null references public.leads(id) on delete cascade,
  from_user_id  uuid        references auth.users(id),   -- nullable: no prior holder on first assignment
  to_user_id    uuid        not null references auth.users(id),
  assigned_by   uuid        not null references auth.users(id),
  assigned_at   timestamptz not null default now(),
  reason        text
);

create index if not exists lead_assignment_history_lead_id_idx
  on public.lead_assignment_history (lead_id, assigned_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. BEFORE UPDATE trigger — write history row when assigned_to changes
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.record_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  -- Only act when assigned_to actually changes.
  if NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to then
    return NEW;
  end if;

  -- Pick up the optional reason passed via SET LOCAL by assign_lead RPC.
  v_reason := nullif(trim(current_setting('app.reassign_reason', true)), '');

  insert into public.lead_assignment_history (
    lead_id, from_user_id, to_user_id, assigned_by, reason
  ) values (
    NEW.id,
    OLD.assigned_to,           -- null on first assignment
    NEW.assigned_to,
    NEW.assigned_by,           -- set by assign_lead before the UPDATE fires
    v_reason
  );

  return NEW;
end $$;

drop trigger if exists trg_record_lead_assignment on public.leads;

create trigger trg_record_lead_assignment
  before update of assigned_to on public.leads
  for each row
  execute function public.record_lead_assignment();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. assign_lead RPC
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.assign_lead(
  p_lead_id    uuid,
  p_to_user_id uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller        uuid := auth.uid();
  v_current       uuid;
  v_was_reassign  boolean;
  v_assignee_ok   boolean;
begin
  -- 1. Caller must be owner or admin.
  if not public.has_role(v_caller, array['owner','admin']) then
    raise exception 'Insufficient privilege — owner or admin required'
      using errcode = '42501';
  end if;

  -- 2. Validate assignee: must exist in auth.users AND have at least one role.
  select exists (
    select 1 from auth.users u
    where u.id = p_to_user_id
      and exists (select 1 from public.user_roles r where r.user_id = u.id)
  ) into v_assignee_ok;

  if not v_assignee_ok then
    raise exception 'Invalid assignee — user not found or has no role'
      using errcode = '22023';
  end if;

  -- 3. Read current assignee.
  select assigned_to into v_current
    from public.leads
    where id = p_lead_id;

  if not found then
    raise exception 'Lead not found'
      using errcode = 'P0002';
  end if;

  -- 4. No-op guard: already assigned to the same person.
  if v_current = p_to_user_id then
    return jsonb_build_object(
      'ok', true,
      'lead_id', p_lead_id,
      'assignee_id', p_to_user_id,
      'was_reassignment', false,
      'noop', true
    );
  end if;

  v_was_reassign := v_current is not null;

  -- 5. Pass reason to trigger via session-local GUC before the UPDATE fires.
  perform set_config('app.reassign_reason', coalesce(p_reason, ''), true);

  -- 6. UPDATE leads — trigger writes history row using NEW.assigned_by.
  update public.leads
     set assigned_to  = p_to_user_id,
         assigned_by  = v_caller,
         assigned_at  = now()
   where id = p_lead_id;

  -- 7. TODO Phase 3 PR 2: call notify-lead-assigned Edge Function here.
  --    payload: { lead_id: p_lead_id, assignee_id: p_to_user_id, assigner_id: v_caller }

  return jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'assignee_id', p_to_user_id,
    'was_reassignment', v_was_reassign
  );
end $$;

grant execute on function public.assign_lead(uuid, uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS on lead_assignment_history
-- ────────────────────────────────────────────────────────────────────────────

alter table public.lead_assignment_history enable row level security;

-- Owner + admin see every row.
create policy "owner_admin_see_all_assignment_history"
  on public.lead_assignment_history
  for select
  using (public.has_role(auth.uid(), array['owner','admin']));

-- Everyone else sees only rows where they are the sender or receiver.
create policy "user_sees_own_assignment_history"
  on public.lead_assignment_history
  for select
  using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
  );
