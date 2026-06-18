import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

// Two-tone "ding" via Web Audio — no asset to host.
// Respects the localStorage mute preference, fails silently if the
// browser blocks audio (typical before any user gesture; the bell will
// just be silent until the user has clicked something, which they
// always have by the time a notification arrives).
function playDing() {
  try {
    if (localStorage.getItem('mio.notif.muted') === '1') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);          // A5
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.12); // E6
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close().catch(() => {});
  } catch (_) { /* swallow */ }
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const NOTIF_QUERY_KEY = (uid) => ['notifications', uid];

export default function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => typeof window !== 'undefined' && localStorage.getItem('mio.notif.muted') === '1');
  const wrapRef = useRef(null);
  const lastSeenIdRef = useRef(null);

  const { data } = useQuery({
    queryKey: NOTIF_QUERY_KEY(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_notifications')
        .select('id, notification_type, title, body, action_url, related_entity_type, related_entity_id, is_read, created_at')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const unreadCount = useMemo(() => (data ?? []).filter(n => !n.is_read).length, [data]);

  // Realtime: stream inserts for THIS user, play ding, refresh query.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-bell-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'client_notifications',
        filter: `recipient_user_id=eq.${user.id}`,
      }, (payload) => {
        const newId = payload?.new?.id;
        // Guard against the rare double-fire (e.g. tab focus + ws replay).
        if (newId && lastSeenIdRef.current === newId) return;
        lastSeenIdRef.current = newId;
        queryClient.invalidateQueries({ queryKey: NOTIF_QUERY_KEY(user.id) });
        playDing();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  // Click-outside to close the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem('mio.notif.muted', next ? '1' : '0'); } catch (_) { /* swallow */ }
  }

  async function markRead(id) {
    const { error } = await supabase
      .from('client_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) queryClient.invalidateQueries({ queryKey: NOTIF_QUERY_KEY(user.id) });
  }

  async function openNotification(n) {
    setOpen(false);
    if (!n.is_read) await markRead(n.id);
    if (n.action_url) {
      // External absolute URL → window.location; internal → react-router.
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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-darkbg-border bg-darkbg-800/60 text-soft transition hover:text-white"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brandred px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-2xl border border-darkbg-border bg-darkbg-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-darkbg-border px-4 py-3">
            <div>
              <p className="font-display text-sm text-white">Notifications</p>
              <p className="text-xs text-soft">{unreadCount} unread</p>
            </div>
            <button
              onClick={toggleMute}
              className="inline-flex items-center gap-1 rounded-lg border border-darkbg-border bg-darkbg-900/60 px-2 py-1 text-xs text-soft transition hover:text-white"
              title={muted ? 'Sound is off — click to turn on' : 'Sound is on — click to mute'}
            >
              {muted ? <><BellOff size={12}/> Sound off</> : <><Bell size={12}/> Sound on</>}
            </button>
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {(!data || data.length === 0) && (
              <p className="px-4 py-6 text-center text-sm text-soft">Nothing here yet — sales and updates will land here.</p>
            )}
            {(data ?? []).slice(0, 8).map(n => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`flex w-full items-start gap-3 border-b border-darkbg-border/50 px-4 py-3 text-left transition hover:bg-darkbg-900/40 ${n.is_read ? '' : 'bg-darkbg-900/30'}`}
              >
                <span className={`mt-1 inline-block h-2 w-2 flex-none rounded-full ${n.is_read ? 'bg-darkbg-border' : 'bg-brandred'}`} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${n.is_read ? 'text-soft' : 'font-semibold text-white'}`}>{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-soft">{n.body}</p>}
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-soft/70">{timeAgo(n.created_at)} ago</p>
                </div>
                {n.action_url && <ExternalLink size={14} className="mt-1 flex-none text-soft" />}
              </button>
            ))}
          </div>

          <div className="border-t border-darkbg-border bg-darkbg-900/40 px-4 py-2 text-right">
            <Link
              to="/owner/inbox"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-brandred hover:underline"
            >
              See all →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// Mark a single row read by id (used by the Inbox page too).
export async function markNotificationRead(id) {
  return supabase
    .from('client_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
}

// Mark all unread rows for the current user.
export async function markAllNotificationsRead(userId) {
  return supabase
    .from('client_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_user_id', userId)
    .eq('is_read', false);
}

export { NOTIF_QUERY_KEY };
