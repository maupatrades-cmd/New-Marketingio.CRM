-- Enable realtime stream on client_notifications so the bell can react
-- to inserts the moment they land (no polling). RLS still scopes reads
-- to recipient_user_id = auth.uid() via the existing notif_read policy,
-- so a client subscribing only sees their own inserts.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname    = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'client_notifications'
  ) then
    alter publication supabase_realtime add table public.client_notifications;
  end if;
end $$;
