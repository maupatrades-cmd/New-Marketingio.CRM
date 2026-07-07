import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, ArrowRight, Calendar, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'In Progress' },
  { key: 'review',    label: 'Ready for Review' },
  { key: 'delivered', label: 'Delivered' },
];

// Client-visible status pill copy — matches the deliverables_status_check
// values (see migration 93 trigger for the same mapping).
const STATUS_TONE = {
  in_progress:              { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',       label: 'In progress',      progress: 40 },
  awaiting_client:          { cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', label: 'Ready for review', progress: 70 },
  client_reviewing:         { cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', label: 'Under review',     progress: 75 },
  client_requested_changes: { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',    label: 'Changes requested', progress: 50 },
  changes_requested:        { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',    label: 'Changes requested', progress: 50 },
  client_rejected:          { cls: 'bg-red-50 text-red-700 ring-1 ring-red-200',          label: 'Rejected',          progress: 40 },
  approved:                 { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Approved',       progress: 95 },
  deemed_approved:          { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Approved',       progress: 95 },
  completed:                { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Delivered',      progress: 100 },
  delivered:                { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Delivered',      progress: 100 },
  submitted:                { cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', label: 'Awaiting review',   progress: 70 },
  not_started:              { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',      label: 'Not started',       progress: 10 },
  blocked:                  { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',      label: 'On hold',           progress: 25 },
};

const REVIEW_STATUSES     = new Set(['awaiting_client','client_reviewing','submitted']);
const DELIVERED_STATUSES  = new Set(['completed','delivered','approved','deemed_approved']);

export default function ClientDeliverables() {
  const [tab, setTab] = useState('all');
  const listQ = useQuery({
    queryKey: ['my-deliverables-all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_deliverables', { p_status: 'all' });
      if (error) throw error;
      return data ?? [];
    },
  });
  const all = listQ.data ?? [];

  const reviewCount = all.filter(d => REVIEW_STATUSES.has(d.status)).length;

  const rows = useMemo(() => {
    if (tab === 'active')    return all.filter(d => !DELIVERED_STATUSES.has(d.status) && !REVIEW_STATUSES.has(d.status));
    if (tab === 'review')    return all.filter(d => REVIEW_STATUSES.has(d.status));
    if (tab === 'delivered') return all.filter(d => DELIVERED_STATUSES.has(d.status));
    return all;
  }, [all, tab]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Deliverables</h1>
        <p className="text-sm text-gray-500 mt-1">Track everything the team is building for you.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1 w-fit flex-wrap">
        {TABS.map(t => {
          const badge = t.key === 'review' ? reviewCount : 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
                    className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      tab === t.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-[#0B2143]'
                    }`}>
              {t.label}
              {badge > 0 && tab !== t.key && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] bg-blue-500 text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {listQ.isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <MascotGuide phase="thinking" size={80} message="Fetching your deliverables..." position="inline" />
        </div>
      )}
      {listQ.isError && !listQ.isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <MascotGuide phase="sad" size={80} message={listQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
        </div>
      )}
      {!listQ.isLoading && !listQ.isError && rows.length === 0 && (
        <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
          <MascotGuide phase="guide" size={80}
            message={all.length === 0
              ? "No deliverables yet — they'll appear here as the team starts building."
              : `No ${tab === 'all' ? '' : tab + ' '}deliverables.`}
            position="inline" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map(d => {
          const tone = STATUS_TONE[d.status] ?? { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200', label: d.status, progress: 20 };
          const thumb = Array.isArray(d.file_urls) && d.file_urls.length > 0 ? d.file_urls[0] : null;
          const isImage = thumb && /\.(jpe?g|png|gif|webp|svg)$/i.test(thumb);
          const isDelivered = DELIVERED_STATUSES.has(d.status);
          return (
            <Link key={d.id} to={`/client/deliverables/${d.id}`}
                  className="group rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4 hover:shadow-md hover:border-red-300 transition-all duration-200">
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

              {/* Progress bar */}
              <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className={`h-1.5 rounded-full transition-all duration-500 ${
                  isDelivered ? 'bg-emerald-500' : 'bg-[#E2293B]'
                }`} style={{ width: `${tone.progress}%` }} />
              </div>

              {d.due_date && !isDelivered && (
                <p className="mt-2 text-[11px] text-gray-500 flex items-center gap-1">
                  <Calendar size={10} /> Due {new Date(d.due_date).toLocaleDateString('en-ZA')}
                </p>
              )}
              {d.approved_date && isDelivered && (
                <p className="mt-2 text-[11px] text-emerald-600 flex items-center gap-1">
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
