import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Bell, CheckCircle2, Receipt, Package, FileSignature, BarChart3, Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const TYPE_ICON = {
  invoice: Receipt, deliverable: Package, contract: FileSignature,
  report: BarChart3, system: Info,
};

export default function ClientNotifications() {
  const qc = useQueryClient();
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

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  const rows = listQ.data ?? [];
  const unread = rows.filter(n => !n.is_read).length;

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

      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-8 text-center text-gray-500">
          <Bell size={24} className="mx-auto mb-2" />
          No notifications yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(n => {
            const Icon = TYPE_ICON[n.notification_type] ?? Info;
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
                      {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
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
