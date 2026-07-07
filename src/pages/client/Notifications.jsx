import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Receipt, Package, FileSignature, BarChart3, MessageCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const FILTERS = [
  { key: 'all',         label: 'All',            match: () => true },
  { key: 'invoice',     label: '💰 Invoices',    match: t => /^(invoice|payment)/.test(t ?? '') },
  { key: 'deliverable', label: '📦 Deliverables', match: t => /^deliverable/.test(t ?? '') },
  { key: 'contract',    label: '📝 Contracts',   match: t => /^contract/.test(t ?? '') },
  { key: 'report',      label: '📊 Reports',     match: t => /^report/.test(t ?? '') },
  { key: 'message',     label: '💬 Messages',    match: t => /message|reply/.test(t ?? '') },
];

function iconForType(t) {
  if (!t) return Info;
  if (/^(invoice|payment)/.test(t)) return Receipt;
  if (/^deliverable/.test(t))       return Package;
  if (/^contract/.test(t))          return FileSignature;
  if (/^report/.test(t))            return BarChart3;
  if (/message|reply/.test(t))      return MessageCircle;
  return Info;
}

export default function ClientNotifications() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');

  const listQ = useQuery({
    queryKey: ['my-notifications-all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_notifications', { p_limit: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const markAllMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_all_notifications_read');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-notifications-all'] });
      qc.invalidateQueries({ queryKey: ['my-notifications'] });
    },
  });

  const readMut = useMutation({
    mutationFn: async (id) => { await supabase.rpc('mark_notification_read', { p_id: id }); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-notifications-all'] });
      qc.invalidateQueries({ queryKey: ['my-notifications'] });
    },
  });

  // Hooks stay above the early returns — see Invoices.jsx notes on
  // React error #310.
  const all = listQ.data ?? [];
  const activeFilter = FILTERS.find(f => f.key === filter) ?? FILTERS[0];
  const rows = useMemo(() => all.filter(n => activeFilter.match(n.notification_type)), [all, activeFilter]);

  if (listQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your notifications..." position="inline" />
    </div>
  );
  if (listQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={listQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );
  const unread = all.filter(n => !n.is_read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        {unread > 0 && (
          <button onClick={() => markAllMut.mutate()} disabled={markAllMut.isPending}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#0B2143] transition">
            <CheckCircle2 size={12} /> Mark all read
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
              filter === f.key
                ? 'bg-[#E2293B] text-white border-[#E2293B]'
                : 'bg-white/60 text-gray-500 border-white/80 hover:border-gray-300'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
          <MascotGuide phase="guide" size={80}
            message={filter === 'all'
              ? "You're all caught up — no notifications yet."
              : `Nothing under ${activeFilter.label}.`}
            position="inline" />
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(n => {
            const Icon = iconForType(n.notification_type);
            const Wrapper = n.action_url ? Link : 'div';
            const wrapperProps = n.action_url
              ? { to: n.action_url, onClick: () => !n.is_read && readMut.mutate(n.id) }
              : { onClick: () => !n.is_read && readMut.mutate(n.id) };
            return (
              <li key={n.id}>
                <Wrapper {...wrapperProps}
                         className={`block rounded-xl border p-3 cursor-pointer transition ${
                           n.is_read
                             ? 'border-gray-100 bg-white hover:bg-gray-50'
                             : 'border-red-200 bg-red-50/60 hover:border-red-300'
                         }`}>
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                      n.is_read ? 'bg-gray-100 text-gray-400' : 'bg-red-100 text-red-600'
                    }`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#0B2143]">{n.title}</p>
                        {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                      </div>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-gray-500 mt-1">{new Date(n.created_at).toLocaleString('en-ZA')}</p>
                    </div>
                  </div>
                </Wrapper>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
