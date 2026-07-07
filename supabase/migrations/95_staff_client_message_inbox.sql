-- Migration 95: staff-side client message inbox RPCs (Directive 18 Part 3)
--
-- reply_to_client_message already exists (session-scoped work earlier
-- today). Two new reads let a staff inbox render a threads-list on the
-- left and the selected thread on the right, with mark-read on open:
--
--   get_client_message_threads() → one row per client that has ever
--     sent a message, with the latest message preview + unread count.
--     Ordered by most-recent message.
--   get_client_thread_messages(client_id) → all messages for one client
--     in chronological order. Marks any unread client→staff messages
--     read as a side-effect (staff opening the thread = "seen").
--
-- Both are staff-only (user_roles gate).

create or replace function public.get_client_message_threads()
returns table (
  client_id                uuid,
  client_name              text,
  logo_url                 text,
  last_message_body        text,
  last_message_at          timestamptz,
  last_message_from_client boolean,
  unread_count             bigint,
  total_messages           bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from user_roles where user_id = auth.uid()) then
    raise exception 'access_denied_staff_only';
  end if;

  return query
  with latest as (
    select distinct on (cm.client_id)
           cm.client_id,
           cm.body            as last_body,
           cm.created_at      as last_at,
           cm.is_from_client  as last_from_client
    from client_messages cm
    order by cm.client_id, cm.created_at desc
  )
  select
    l.client_id,
    c.business_name        as client_name,
    c.logo_url,
    l.last_body            as last_message_body,
    l.last_at              as last_message_at,
    l.last_from_client     as last_message_from_client,
    (select count(*) from client_messages cm2
      where cm2.client_id = l.client_id and cm2.is_from_client = true and cm2.is_read = false)
      as unread_count,
    (select count(*) from client_messages cm2 where cm2.client_id = l.client_id)
      as total_messages
  from latest l
  join clients c on c.id = l.client_id
  order by l.last_at desc;
end;
$$;

revoke all on function public.get_client_message_threads() from public, anon;
grant execute on function public.get_client_message_threads() to authenticated;

create or replace function public.get_client_thread_messages(p_client_id uuid)
returns table (
  id             uuid,
  sender_name    text,
  body           text,
  subject        text,
  file_url       text,
  is_from_client boolean,
  is_read        boolean,
  created_at     timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from user_roles where user_id = auth.uid()) then
    raise exception 'access_denied_staff_only';
  end if;

  -- Opening the thread = staff has seen the client's unread messages.
  update client_messages
     set is_read = true
   where client_id = p_client_id
     and is_from_client = true
     and is_read = false;

  return query
  select cm.id, cm.sender_name, cm.body, cm.subject, cm.file_url,
         cm.is_from_client, cm.is_read, cm.created_at
  from client_messages cm
  where cm.client_id = p_client_id
  order by cm.created_at asc;
end;
$$;

revoke all on function public.get_client_thread_messages(uuid) from public, anon;
grant execute on function public.get_client_thread_messages(uuid) to authenticated;
