import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Package, ArrowRight, Calendar, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'In Progress' },
  { key: 'delivered', label: 'Delivered' },
];

const STATUS_TONE = {
  in_progress:       { cls: 'border-blue-400/40 bg-blue-400/10 text-blue-300',       label: 'In progress' },
  submitted:         { cls: 'border-purple-400/40 bg-purple-400/10 text-purple-300', label: 'Awaiting review' },
  awaiting_client:   { cls: 'border-purple-400/40 bg-purple-400/10 text-purple-300', label: 'Awaiting review' },
  client_reviewing:  { cls: 'border-purple-400/40 bg-purple-400/10 text-purple-300', label: 'Under review' },
  changes_requested: { cls: 'border-amber-400/40 bg-amber-400/10 text-amber-300',    label: 'Changes requested' },
  approved:          { cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', label: 'Approved' },
  delivered:         { cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', label: 'Delivered' },
};

export default function ClientDeliverables() {
  const [tab, setTab] = useState('all');
  const listQ = useQuery({
    queryKey: ['my-deliverables', tab],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_deliverables', { p_status: tab });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-gradient">Deliverables</h1>
        <p className="text-sm text-soft mt-1">Track everything the team is building for you.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-darkbg-800 p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    tab === t.key ? 'bg-brandred text-white' : 'text-soft hover:text-white'
                  }`}>{t.label}</button>
        ))}
      </div>

      {listQ.isLoading && <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-soft" /></div>}
      {!listQ.isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-8 text-center text-soft">Nothing here yet.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map(d => {
          const tone = STATUS_TONE[d.status] ?? { cls: 'border-gray-500/40 bg-gray-500/10 text-gray-300', label: d.status };
          const thumb = Array.isArray(d.file_urls) && d.file_urls.length > 0 ? d.file_urls[0] : null;
          const isImage = thumb && /\.(jpe?g|png|gif|webp|svg)$/i.test(thumb);
          return (
            <Link key={d.id} to={`/client/deliverables/${d.id}`}
                  className="group rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4 hover:border-brandred transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {isImage ? (
                    <img src={thumb} alt="" className="h-12 w-12 rounded object-cover bg-white shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-darkbg-700 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-soft" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{d.title}</p>
                    {d.product && <p className="text-xs text-soft mt-0.5">{d.product}</p>}
                    <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${tone.cls}`}>
                      {tone.label}
                    </span>
                  </div>
                </div>
                <ArrowRight size={16} className="text-soft group-hover:text-white transition shrink-0" />
              </div>
              {d.due_date && (
                <p className="mt-3 text-[11px] text-soft flex items-center gap-1">
                  <Calendar size={10} /> Due {new Date(d.due_date).toLocaleDateString('en-ZA')}
                </p>
              )}
              {d.approved_date && (
                <p className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={10} /> Delivered {new Date(d.approved_date).toLocaleDateString('en-ZA')}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
