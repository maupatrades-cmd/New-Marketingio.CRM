-- 26_lead_phase2.sql
-- Lead Lifecycle Phase 2 — duplicate detection, attribution-from-auth,
-- qualification RPC.
--
-- Sections:
--   1) Columns:
--        submitted_by_role text
--        assigned_by uuid references profiles(id)
--        duplicate_acknowledged boolean not null default false
--        duplicate_of uuid references leads(id) on delete set null
--   2) Trigger enforce_public_link_attribution()  — BEFORE INSERT
--   3) Trigger detect_possible_duplicate()        — BEFORE INSERT
--        soft-error SQLSTATE = '45D01' (locked in HANDOVER_4 §3)
--   4) Trigger populate_submitted_by_role()       — BEFORE INSERT
--        highest-privilege role wins: owner > admin > field_agent > cpc > customer
--   5) RPC qualify_lead(...)                      — SECURITY DEFINER
--        verify / needs_clarification / rejected with R87 accrual gate

-- =========================================================================
-- 1. Columns
-- =========================================================================
alter table public.leads
  add column if not exists submitted_by_role     text,
  add column if not exists assigned_by           uuid references public.profiles(id),
  add column if not exists duplicate_acknowledged boolean not null default false,
  add column if not exists duplicate_of          uuid references public.leads(id) on delete set null;

-- Phone+email composite — used by detect_possible_duplicate's existence probe.
-- Per-column indexes from migration 23 cover the OR-branches individually,
-- but a composite helps the planner when both are present.
create index if not exists leads_phone_email_idx
  on public.leads (phone, email);

comment on column public.leads.submitted_by_role     is 'Captured at insert from user_roles. Never from a UI default. NULL for public-link captures (attribution comes from referrer_name/contact).';
comment on column public.leads.assigned_by           is 'Who triggered the assignment. UI ships in Phase 3.';
comment on column public.leads.duplicate_acknowledged is 'TRUE when capturer explicitly chose "Capture anyway" past the duplicate warning.';
comment on column public.leads.duplicate_of          is 'Soft link to the matched lead when detect_possible_duplicate fired and was acknowledged.';

-- =========================================================================
-- 2. enforce_public_link_attribution — BEFORE INSERT.
-- Closes the gap where a malformed request slips past public-lead-submit
-- and leaves an unattributable row in the table.
-- =========================================================================
create or replace function public.enforce_public_link_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.captured_via = 'public_link'
     and new.submitted_by is null
     and (
       new.referrer_name is null or trim(new.referrer_name) = ''
       or new.referrer_contact is null or trim(new.referrer_contact) = ''
     )
  then
    raise exception 'attribution_unknown: public-link captures require referrer_name and referrer_contact'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_public_link_attribution on public.leads;
create trigger trg_enforce_public_link_attribution
  before insert on public.leads
  for each row execute function public.enforce_public_link_attribution();

-- =========================================================================
-- 3. detect_possible_duplicate — BEFORE INSERT.
-- Soft error (SQLSTATE 45D01) on first hit; caller can re-submit with
-- duplicate_acknowledged=true to bypass and have duplicate_of populated.
-- =========================================================================
create or replace function public.detect_possible_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched record;
begin
  -- Skip when we have nothing to match on.
  if (new.phone is null or trim(new.phone) = '')
     and (new.email is null or trim(new.email) = '')
  then
    return new;
  end if;

  select id, business_name, submitted_by_name, created_at
    into matched
    from public.leads
   where (
           (new.phone is not null and trim(new.phone) <> '' and phone = new.phone)
        or (new.email is not null and trim(new.email) <> '' and lower(email) = lower(new.email))
        )
   order by created_at asc
   limit 1;

  if matched.id is null then
    return new;
  end if;

  -- Caller acknowledged the warning — record the link and allow.
  if new.duplicate_acknowledged is true then
    new.duplicate_of := matched.id;
    return new;
  end if;

  -- Soft error. errdetail carries the matched row so callers can render
  -- the confirmation dialog without a second round trip. Public-link
  -- callers MUST strip business_name + submitted_by_name before showing
  -- this to the public (see public-lead-submit edge function).
  raise exception 'possible_duplicate'
    using errcode = '45D01',
          detail  = jsonb_build_object(
            'matched_lead_id',       matched.id,
            'matched_business_name', matched.business_name,
            'matched_capturer_name', matched.submitted_by_name,
            'matched_at',            matched.created_at
          )::text;
end $$;

drop trigger if exists trg_detect_possible_duplicate on public.leads;
-- Runs AFTER enforce_do_not_contact (no ordering needed in PG — both are
-- BEFORE INSERT, distinct triggers; PG fires them alphabetically by trigger
-- name. The DNC check is the hard gate and is named trg_enforce_dnc which
-- sorts before trg_detect_*; that ordering is fine.)
create trigger trg_detect_possible_duplicate
  before insert on public.leads
  for each row execute function public.detect_possible_duplicate();

-- =========================================================================
-- 4. populate_submitted_by_role — BEFORE INSERT.
-- Resolves the role from user_roles (highest privilege wins) so the form
-- can never lie about who captured. NULL submitted_by means public-link
-- and we leave submitted_by_role NULL.
-- =========================================================================
create or replace function public.populate_submitted_by_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved text;
begin
  if new.submitted_by is null then
    return new;
  end if;

  -- DO NOT CHANGE THIS RE-RESOLUTION — security-critical.
  -- Even if submitted_by_role is already set by an upstream caller, we always
  -- re-resolve from user_roles. This is intentional: it prevents a client or
  -- a future code path from lying about the capturer's role by passing
  -- submitted_by_role in the INSERT payload. The DB is the single source of
  -- truth for role attribution. Removing this "optimization" would reintroduce
  -- the field_agent label bug fixed in migration 24.
  select role into resolved
    from public.user_roles
   where user_id = new.submitted_by
   order by case role
              when 'owner'       then 1
              when 'admin'       then 2
              when 'field_agent' then 3
              when 'cpc'         then 4
              when 'customer'    then 5
              else 99
            end
   limit 1;

  if resolved is null then
    raise exception 'attribution_unknown: no role row for submitter %', new.submitted_by
      using errcode = '42501';
  end if;

  new.submitted_by_role := resolved;
  return new;
end $$;

drop trigger if exists trg_populate_submitted_by_role on public.leads;
create trigger trg_populate_submitted_by_role
  before insert on public.leads
  for each row execute function public.populate_submitted_by_role();

-- =========================================================================
-- 5. qualify_lead RPC.
-- Owner/admin only. Narrow updates. Side-effects:
--   - verified:           status, verified_by, verified_date, warm_lead_criteria, lead_temperature
--                         + CPC R87 accrual gate
--   - needs_clarification: status, warm_lead_criteria, lead_temperature, notes-append
--   - rejected:           status, rejection_reason, warm_lead_criteria, lead_temperature
-- Writes audit_log rows for the decision and (separately) the R87 accrual.
-- =========================================================================
create or replace function public.qualify_lead(
  p_lead_id          uuid,
  p_decision         text,
  p_criteria_checked jsonb,
  p_temperature      text,
  p_note             text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_lead  record;
  v_r87_accrued boolean := false;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not (public.has_role(v_actor, 'owner') or public.has_role(v_actor, 'admin')) then
    raise exception 'forbidden: owner/admin only' using errcode = '42501';
  end if;

  if p_decision not in ('verified','needs_clarification','rejected') then
    raise exception 'invalid_decision: %', p_decision using errcode = '22023';
  end if;

  if p_temperature is not null and p_temperature not in ('cold','warm','hot') then
    raise exception 'invalid_temperature: %', p_temperature using errcode = '22023';
  end if;

  if p_decision = 'rejected' and (p_note is null or trim(p_note) = '') then
    raise exception 'rejection_reason_required' using errcode = '22023';
  end if;

  if p_decision = 'needs_clarification' and (p_note is null or trim(p_note) = '') then
    raise exception 'clarification_note_required' using errcode = '22023';
  end if;

  select id, source, submitted_by, cpc_r87_paid, notes
    into v_lead
    from public.leads
   where id = p_lead_id
   for update;

  if v_lead.id is null then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  -- Narrow updates per decision. Never blob-write the whole row.
  if p_decision = 'verified' then
    update public.leads
       set status              = 'verified',
           verified_by         = v_actor,
           verified_date       = current_date,
           warm_lead_criteria  = p_criteria_checked,
           lead_temperature    = coalesce(p_temperature, lead_temperature),
           updated_at          = now()
     where id = p_lead_id;

    -- CPC R87 accrual gate (idempotent via cpc_r87_paid flag).
    if v_lead.source = 'cpc_outbound'
       and v_lead.submitted_by is not null
       and public.has_role(v_lead.submitted_by, 'cpc')
       and v_lead.cpc_r87_paid = false
    then
      update public.leads
         set cpc_r87_paid = true,
             updated_at   = now()
       where id = p_lead_id;

      insert into public.audit_log (actor_id, action, table_name, row_id, after_data)
      values (
        v_actor,
        'cpc_r87_accrued',
        'leads',
        p_lead_id,
        jsonb_build_object(
          'cpc_user_id', v_lead.submitted_by,
          'amount',      87,
          'lead_id',     p_lead_id
        )
      );
      v_r87_accrued := true;
    end if;

  elsif p_decision = 'needs_clarification' then
    update public.leads
       set status             = 'pending_verification',
           warm_lead_criteria = p_criteria_checked,
           lead_temperature   = coalesce(p_temperature, lead_temperature),
           notes              = coalesce(notes || E'\n\n', '') ||
                                '[' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] needs_clarification: ' || p_note,
           updated_at         = now()
     where id = p_lead_id;

  elsif p_decision = 'rejected' then
    update public.leads
       set status             = 'rejected',
           rejection_reason   = p_note,
           warm_lead_criteria = p_criteria_checked,
           lead_temperature   = coalesce(p_temperature, lead_temperature),
           updated_at         = now()
     where id = p_lead_id;
  end if;

  -- Decision audit (always written, separate from the R87 row above).
  insert into public.audit_log (actor_id, action, table_name, row_id, after_data)
  values (
    v_actor,
    'lead_qualified',
    'leads',
    p_lead_id,
    jsonb_build_object(
      'decision',         p_decision,
      'criteria_checked', p_criteria_checked,
      'temperature',      p_temperature,
      'note',             p_note,
      'r87_accrued',      v_r87_accrued
    )
  );

  return jsonb_build_object(
    'ok',            true,
    'lead_id',       p_lead_id,
    'decision',      p_decision,
    'r87_accrued',   v_r87_accrued
  );
end $$;

revoke all on function public.qualify_lead(uuid, text, jsonb, text, text) from public;
grant execute on function public.qualify_lead(uuid, text, jsonb, text, text) to authenticated;

comment on function public.qualify_lead is
  'Owner/admin RPC. Decision in (verified|needs_clarification|rejected). Narrow updates only. Gates CPC R87 accrual via leads.cpc_r87_paid flag (idempotent). Audit_log rows: lead_qualified (always), cpc_r87_accrued (when gate passes).';
