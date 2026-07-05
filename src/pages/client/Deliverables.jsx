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
  in_progress:       { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',       label: 'In progress' },
  submitted:         { cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', label: 'Awaiting review' },
  awaiting_client:   { cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', label: 'Awaiting review' },
  client_reviewing:  { cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', label: 'Under review' },
  changes_requested: { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',    label: 'Changes requested' },
  approved:          { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Approved' },
  delivered:         { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Delivered' },
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
        <h1 className="font-display text-2xl text-[#0B2143]">Deliverables</h1>
        <p className="text-sm text-gray-500 mt-1">Track everything the team is building for you.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    tab === t.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-[#0B2143]'
                  }`}>{t.label}</button>
        ))}
      </div>

      {listQ.isLoading && <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-400" /></div>}
      {!listQ.isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-8 text-center text-gray-500">Nothing here yet.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map(d => {
          const tone = STATUS_TONE[d.status] ?? { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200', label: d.status };
          const thumb = Array.isArray(d.file_urls) && d.file_urls.length > 0 ? d.file_urls[0] : null;
          const isImage = thumb && /\.(jpe?g|png|gif|webp|svg)$/i.test(thumb);
          return (
            <Link key={d.id} to={`/client/deliverables/${d.id}`}
                  className="group rounded-xl border border-gray-100 bg-white shadow-sm p-4 hover:shadow-md hover:border-red-300 transition-all duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {isImage ? (
                    <img src={thumb} alt="" className="h-12 w-12 rounded object-cover bg-white shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-gray-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0B2143] truncate">{d.title}</p>
                    {d.product && <p className="text-xs text-gray-500 mt-0.5">{d.product}</p>}
                    <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${tone.cls}`}>
                      {tone.label}
                    </span>
                  </div>
                </div>
                <ArrowRight size={16} className="text-gray-500 group-hover:text-[#0B2143] transition shrink-0" />
              </div>
              {d.due_date && (
                <p className="mt-3 text-[11px] text-gray-500 flex items-center gap-1">
                  <Calendar size={10} /> Due {new Date(d.due_date).toLocaleDateString('en-ZA')}
                </p>
              )}
              {d.approved_date && (
                <p className="mt-1 text-[11px] text-emerald-600 flex items-center gap-1">
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
