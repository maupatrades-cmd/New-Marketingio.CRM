-- Migration 48: Security RPCs
-- check_password_not_reused, record_password_change, log_login_attempt,
-- get_lockout_status, request_account_deletion, cancel_account_deletion,
-- set_security_questions, get_security_questions_status,
-- recover_account, verify_security_answers,
-- consume_emergency_lockdown_token,
-- process_pending_deletions, sweep_user_lockouts

create or replace function public.check_password_not_reused(p_new_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare
  rec record;
begin
  for rec in
    select pw_hash from public.profile_password_history
    where user_id = auth.uid()
    order by changed_at desc
    limit 5
  loop
    if extensions.crypt(p_new_password, rec.pw_hash) = rec.pw_hash then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.record_password_change(p_new_password text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  insert into public.profile_password_history (user_id, pw_hash)
  values (auth.uid(), extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)));

  delete from public.profile_password_history
  where user_id = auth.uid()
    and changed_at not in (
      select changed_at from public.profile_password_history
      where user_id = auth.uid()
      order by changed_at desc
      limit 5
    );

  insert into public.audit_log (table_name, row_id, action, actor_id, after_data)
  values ('profile_password_history', auth.uid()::text, 'password_changed', auth.uid(),
          jsonb_build_object('changed_at', now()));
end;
$$;

create or replace function public.log_login_attempt(
  p_success        boolean,
  p_ip             text    default null,
  p_user_agent     text    default null,
  p_failure_reason text    default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_log (table_name, row_id, action, actor_id, after_data)
  values (
    'auth_login', auth.uid()::text,
    case when p_success then 'login_success' else 'login_failure' end,
    auth.uid(),
    jsonb_build_object('ip', p_ip, 'user_agent', p_user_agent,
                       'success', p_success, 'failure_reason', p_failure_reason, 'ts', now())
  );

  if p_success then
    update public.user_lockouts
    set failed_attempts = 0, locked_until = null
    where user_id = auth.uid();
  else
    insert into public.user_lockouts (user_id, failed_attempts, first_failure_at)
    values (auth.uid(), 1, now())
    on conflict (user_id) do update
      set failed_attempts  = user_lockouts.failed_attempts + 1,
          first_failure_at = coalesce(user_lockouts.first_failure_at, now()),
          locked_until     = case
            when user_lockouts.failed_attempts + 1 >= 5
            then now() + interval '15 minutes'
            else user_lockouts.locked_until
          end;
  end if;
end;
$$;

create or replace function public.get_lockout_status(p_user_id uuid)
returns table(is_locked boolean, locked_until timestamptz, failed_attempts integer)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  select coalesce(ul.locked_until > now(), false), ul.locked_until, coalesce(ul.failed_attempts, 0)
  from public.user_lockouts ul
  where ul.user_id = p_user_id;
  if not found then
    return query select false, null::timestamptz, 0;
  end if;
end;
$$;

create or replace function public.request_account_deletion()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_token uuid;
begin
  delete from public.account_deletion_requests
  where user_id = auth.uid() and cancelled_at is null and completed_at is null;

  insert into public.account_deletion_requests (user_id, scheduled_deletion_at)
  values (auth.uid(), now() + interval '14 days')
  returning cancel_token into v_token;

  insert into public.audit_log (table_name, row_id, action, actor_id, after_data)
  values ('account_deletion_requests', auth.uid()::text, 'deletion_requested', auth.uid(),
          jsonb_build_object('scheduled_deletion_at', now() + interval '14 days'));

  return v_token;
end;
$$;

create or replace function public.cancel_account_deletion(p_cancel_token uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.account_deletion_requests
  set cancelled_at = now(), completion_status = 'cancelled'
  where cancel_token = p_cancel_token
    and cancelled_at is null and completed_at is null
    and scheduled_deletion_at > now();
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.audit_log (table_name, row_id, action, actor_id, after_data)
    values ('account_deletion_requests', p_cancel_token::text, 'deletion_cancelled', auth.uid(),
            jsonb_build_object('cancel_token', p_cancel_token));
  end if;
  return v_rows > 0;
end;
$$;

create or replace function public.set_security_questions(
  p_q1 text, p_a1 text, p_q2 text, p_a2 text,
  p_q3 text, p_a3 text, p_q4 text, p_a4 text
)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  insert into public.security_questions
    (user_id, question_1, answer_1_hash, question_2, answer_2_hash,
     question_3, answer_3_hash, question_4, answer_4_hash, set_at, updated_at)
  values (
    auth.uid(),
    p_q1, extensions.crypt(lower(trim(p_a1)), extensions.gen_salt('bf', 8)),
    p_q2, extensions.crypt(lower(trim(p_a2)), extensions.gen_salt('bf', 8)),
    p_q3, extensions.crypt(lower(trim(p_a3)), extensions.gen_salt('bf', 8)),
    p_q4, extensions.crypt(lower(trim(p_a4)), extensions.gen_salt('bf', 8)),
    now(), now()
  )
  on conflict (user_id) do update set
    question_1 = excluded.question_1, answer_1_hash = excluded.answer_1_hash,
    question_2 = excluded.question_2, answer_2_hash = excluded.answer_2_hash,
    question_3 = excluded.question_3, answer_3_hash = excluded.answer_3_hash,
    question_4 = excluded.question_4, answer_4_hash = excluded.answer_4_hash,
    set_at = coalesce(security_questions.set_at, now()), updated_at = now();

  insert into public.audit_log (table_name, row_id, action, actor_id)
  values ('security_questions', auth.uid()::text, 'questions_set', auth.uid());
end;
$$;

create or replace function public.get_security_questions_status()
returns table(questions_set boolean, set_at timestamptz, question_1 text, question_2 text, question_3 text, question_4 text)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  select true, sq.set_at, sq.question_1, sq.question_2, sq.question_3, sq.question_4
  from public.security_questions sq where sq.user_id = auth.uid();
  if not found then
    return query select false, null::timestamptz, null::text, null::text, null::text, null::text;
  end if;
end;
$$;

create or replace function public.recover_account(p_email text)
returns table(question_1 text, question_2 text, question_3 text, question_4 text)
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    return query select null::text, null::text, null::text, null::text; return;
  end if;
  return query
  select sq.question_1, sq.question_2, sq.question_3, sq.question_4
  from public.security_questions sq where sq.user_id = v_user_id;
  if not found then
    return query select null::text, null::text, null::text, null::text;
  end if;
end;
$$;

create or replace function public.verify_security_answers(
  p_email text, p_a1 text, p_a2 text, p_a3 text, p_a4 text
)
returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare v_user_id uuid; v_sq record;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then return false; end if;
  select * into v_sq from public.security_questions where user_id = v_user_id;
  if not found then return false; end if;
  if extensions.crypt(lower(trim(p_a1)), v_sq.answer_1_hash) = v_sq.answer_1_hash
     and extensions.crypt(lower(trim(p_a2)), v_sq.answer_2_hash) = v_sq.answer_2_hash
     and extensions.crypt(lower(trim(p_a3)), v_sq.answer_3_hash) = v_sq.answer_3_hash
     and extensions.crypt(lower(trim(p_a4)), v_sq.answer_4_hash) = v_sq.answer_4_hash
  then
    insert into public.audit_log (table_name, row_id, action, actor_id, after_data)
    values ('security_questions', v_user_id::text, 'recovery_verified', v_user_id,
            jsonb_build_object('email', p_email));
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.consume_emergency_lockdown_token(p_token uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_row record;
begin
  select * into v_row from public.emergency_lockdown_tokens
  where lockdown_token = p_token and used_at is null and expires_at > now();
  if not found then return false; end if;
  update public.emergency_lockdown_tokens
  set used_at = now(), triggered_action = 'password_reset_required+global_signout'
  where id = v_row.id;
  insert into public.audit_log (table_name, row_id, action, actor_id, after_data)
  values ('emergency_lockdown_tokens', v_row.user_id::text, 'lockdown_consumed', v_row.user_id,
          jsonb_build_object('token', p_token, 'ts', now()));
  return true;
end;
$$;

create or replace function public.process_pending_deletions()
returns void
language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  for r in
    select adr.id, adr.user_id from public.account_deletion_requests adr
    where adr.scheduled_deletion_at < now()
      and adr.cancelled_at is null and adr.completed_at is null
  loop
    update public.profiles set
      full_name = 'Deleted User', phone = null, residential_address = null,
      emergency_contact_name = null, emergency_contact_phone = null,
      emergency_contact_relationship = null,
      dream_caption = null, dream_details = null, date_of_birth = null
    where id = r.user_id;

    update public.account_deletion_requests
    set completed_at = now(), completion_status = 'anonymised'
    where id = r.id;

    insert into public.audit_log (table_name, row_id, action, actor_id, after_data)
    values ('account_deletion_requests', r.user_id::text, 'account_anonymised', r.user_id,
            jsonb_build_object('completed_at', now()));
  end loop;
end;
$$;

create or replace function public.sweep_user_lockouts()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.user_lockouts set locked_until = null
  where locked_until is not null and locked_until < now();
  update public.user_lockouts set failed_attempts = 0, first_failure_at = null
  where first_failure_at < now() - interval '1 hour' and locked_until is null;
end;
$$;

grant execute on function public.recover_account(text) to anon;
grant execute on function public.verify_security_answers(text,text,text,text,text) to anon;
grant execute on function public.cancel_account_deletion(uuid) to anon;
grant execute on function public.consume_emergency_lockdown_token(uuid) to anon;
