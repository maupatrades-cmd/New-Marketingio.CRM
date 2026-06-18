import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, Inbox as InboxIcon, Loader2, MailOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import { markNotificationRead, markAllNotificationsRead, NOTIF_QUERY_KEY } from '../../components/NotificationBell.jsx';

function whenLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

export default function Inbox() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'

  const { data, isLoading } = useQuery({
    queryKey: ['inbox', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_notifications')
        .select('id, notification_type, title, body, action_url, related_entity_type, related_entity_id, is_read, read_at, created_at')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    return filter === 'unread' ? rows.filter(n => !n.is_read) : rows;
  }, [data, filter]);

  const unreadCount = useMemo(() => (data ?? []).filter(n => !n.is_read).length, [data]);

  async function openRow(n) {
    if (!n.is_read) {
      const { error } = await markNotificationRead(n.id);
      if (!error) {
        queryClient.invalidateQueries({ queryKey: ['inbox', user.id] });
        queryClient.invalidateQueries({ queryKey: NOTIF_QUERY_KEY(user.id) });
      }
    }
    if (n.action_url) {
      if (n.action_url.startsWith('http')) {
        try {
          const u = new URL(n.action_url);
          if (u.origin === window.location.origin) navigate(u.pathname + u.search + u.hash);
          else window.location.assign(n.action_url);
        } catch { window.location.assign(n.action_url); }
      } else {
        navigate(n.action_url);
      }
    }
  }

  async function onMarkAllRead() {
    if (!user || unreadCount === 0) return;
    const { error } = await markAllNotificationsRead(user.id);
    if (error) toast.error(`Couldn't mark all read: ${error.message}`);
    else {
      toast.success(`Marked ${unreadCount} as read`);
      queryClient.invalidateQueries({ queryKey: ['inbox', user.id] });
      queryClient.invalidateQueries({ queryKey: NOTIF_QUERY_KEY(user.id) });
    }
  }

  if (isLoading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 size={28} className="animate-spin text-soft" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Communication</p>
          <h1 className="font-display text-3xl text-gradient">Inbox</h1>
          <p className="mt-1 text-sm text-soft">Sales, payments, and system updates land here in real time.</p>
        </div>
        <button
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="inline-flex items-center gap-2 rounded-full border border-darkbg-border bg-darkbg-800/60 px-4 py-2 text-sm text-white transition hover:bg-darkbg-800 disabled:opacity-40"
        >
          <CheckCheck size={14} /> Mark all read
        </button>
      </header>

      <div className="flex items-center gap-2">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
          All <span className="ml-1 text-xs text-soft">({(data ?? []).length})</span>
        </FilterPill>
        <FilterPill active={filter === 'unread'} onClick={() => setFilter('unread')}>
          Unread <span className="ml-1 text-xs text-soft">({unreadCount})</span>
        </FilterPill>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-12 text-center">
          <InboxIcon size={28} className="mx-auto text-soft" />
          <p className="mt-3 font-display text-lg text-white">
            {filter === 'unread' ? 'No unread notifications' : 'Nothing yet'}
          </p>
          <p className="mt-1 text-sm text-soft">When a sale logs or a payment lands, you'll see it here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-darkbg-border overflow-hidden rounded-2xl border border-darkbg-border bg-darkbg-800/50">
          {filtered.map(n => (
            <li key={n.id}>
              <button
                onClick={() => openRow(n)}
                className={`flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-darkbg-900/40 ${n.is_read ? '' : 'bg-darkbg-900/30'}`}
              >
                <span className={`mt-1.5 inline-block h-2.5 w-2.5 flex-none rounded-full ${n.is_read ? 'bg-darkbg-border' : 'bg-brandred'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`truncate text-sm ${n.is_read ? 'text-soft' : 'font-semibold text-white'}`}>{n.title}</p>
                    <span className="flex-none text-[10px] uppercase tracking-widest text-soft">{whenLabel(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-soft">{n.body}</p>}
                  <p className="mt-2 text-[10px] uppercase tracking-widest text-soft/70">{n.notification_type.replaceAll('_', ' ')}</p>
                </div>
                {n.action_url && <MailOpen size={16} className="mt-2 flex-none text-soft" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm transition ${active
        ? 'border-brandred bg-brandred/15 text-white'
        : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'}`}
    >
      {children}
    </button>
  );
}
