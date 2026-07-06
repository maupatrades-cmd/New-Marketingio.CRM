import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, Receipt, Package, FileSignature, BarChart3, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const TYPE_ICON = { invoice: Receipt, deliverable: Package, contract: FileSignature, report: BarChart3, system: Info };

export default function ClientActivity() {
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ['my-activity'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_notifications', { p_limit: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });
  const markAll = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('mark_all_notifications_read'); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-activity'] }); qc.invalidateQueries({ queryKey: ['my-notifications'] }); qc.invalidateQueries({ queryKey: ['client-dashboard'] }); },
  });
  const readOne = useMutation({
    mutationFn: async (id) => { await supabase.rpc('mark_notification_read', { p_id: id }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-activity'] }); qc.invalidateQueries({ queryKey: ['my-notifications'] }); },
  });

  if (listQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-16">
      <MascotGuide phase="thinking" size={80} message="Fetching your activity..." position="inline" />
    </div>
  );
  if (listQ.isError) return (
    <div className="flex flex-col items-center justify-center py-16">
      <MascotGuide phase="sad" size={80} message={listQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );
  const rows = listQ.data ?? [];
  const unread = rows.filter(n => !n.is_read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">Activity</h1>
          <p className="text-sm text-gray-500 mt-1">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        {unread > 0 && (
          <button onClick={() => markAll.mutate()} disabled={markAll.isPending}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#0B2143] transition">
            <CheckCircle2 size={12} /> Mark all read
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
          <MascotGuide phase="guide" size={80} message="Nothing to show yet — activity will appear here as things happen." position="inline" />
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(n => {
            const Icon = TYPE_ICON[n.notification_type] ?? Info;
            const Wrapper = n.action_url ? Link : 'div';
            const props = n.action_url ? { to: n.action_url, onClick: () => !n.is_read && readOne.mutate(n.id) } : { onClick: () => !n.is_read && readOne.mutate(n.id) };
            return (
              <li key={n.id}>
                <Wrapper {...props} className={`block rounded-xl border p-3 cursor-pointer transition ${n.is_read ? 'border-gray-100 bg-white hover:bg-gray-50' : 'border-red-200 bg-red-50/60 hover:border-red-300'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${n.is_read ? 'bg-gray-100 text-gray-400' : 'bg-red-100 text-red-600'}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#0B2143]">{n.title}</p>
                        {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                      </div>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('en-ZA')}</p>
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
