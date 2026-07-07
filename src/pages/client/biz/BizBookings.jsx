import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Check, X, CalendarDays, List } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';
import { getIndustryConfig } from '../../../constants/industryConfig.js';
import MascotGuide from '../../../components/MascotGuide.jsx';

const fmtZar = (n) => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLOR = {
  confirmed:    'bg-emerald-100 text-emerald-700',
  pending:      'bg-amber-100 text-amber-700',
  in_progress:  'bg-blue-100 text-blue-700',
  completed:    'bg-gray-100 text-gray-600',
  cancelled:    'bg-red-100 text-red-700',
  no_show:      'bg-orange-100 text-orange-700',
};

export default function BizBookings() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => (await supabase.rpc('get_client_dashboard')).data,
  });
  const cfg = getIndustryConfig(dashQ.data?.client?.industry);

  const listQ = useQuery({
    queryKey: ['biz-bookings', tab],
    queryFn: async () => {
      const now = new Date();
      let params = { p_status: null, p_from: null, p_to: null, p_customer_id: null, p_limit: 300 };
      if (tab === 'today') {
        const start = new Date(now); start.setHours(0,0,0,0);
        const end = new Date(now); end.setHours(23,59,59,999);
        params.p_from = start.toISOString(); params.p_to = end.toISOString();
      } else if (tab === 'upcoming') {
        params.p_from = now.toISOString();
      } else if (tab === 'completed') {
        params.p_status = 'completed';
      } else if (tab === 'cancelled') {
        params.p_status = 'cancelled';
      }
      const { data, error } = await supabase.rpc('biz_get_bookings', params);
      if (error) throw error;
      return data?.bookings ?? [];
    },
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }) => {
      const { data, error } = await supabase.rpc('biz_update_booking', { p_id: id, p_payload: { status } });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biz-bookings'] }); qc.invalidateQueries({ queryKey: ['biz-dashboard'] }); toast.success('Updated.'); },
    onError: (err) => toast.error(err.message),
  });

  const bookings = (listQ.data ?? []).filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (b.customer_name || '').toLowerCase().includes(q) || JSON.stringify(b.custom_fields || {}).toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">My {cfg.bookingLabel}s</h1>
          <p className="text-sm text-gray-500 mt-1">{bookings.length} shown</p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button onClick={() => setView('list')} className={`px-3 py-2 text-xs font-semibold ${view === 'list' ? 'bg-[#0B2143] text-white' : 'text-gray-500'}`}><List size={14} className="inline mr-1" /> List</button>
            <button onClick={() => setView('cal')} className={`px-3 py-2 text-xs font-semibold ${view === 'cal' ? 'bg-[#0B2143] text-white' : 'text-gray-500'}`}><CalendarDays size={14} className="inline mr-1" /> Week</button>
          </div>
          <button onClick={() => nav('/client/my-business/bookings/new')}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition">
            <Plus size={16} /> {cfg.bookingVerb}
          </button>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${cfg.bookingLabel.toLowerCase()}s...`}
               className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${tab === t.key ? 'bg-[#E2293B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {listQ.isLoading ? (
        <div className="py-12"><MascotGuide phase="thinking" size={80} message={`Loading ${cfg.bookingLabel.toLowerCase()}s...`} position="inline" /></div>
      ) : bookings.length === 0 ? (
        <div className="py-12"><MascotGuide phase="guide" size={100} message={`No ${cfg.bookingLabel.toLowerCase()}s.`} position="inline" /></div>
      ) : view === 'list' ? (
        <ul className="grid gap-3">
          {bookings.map(b => (
            <li key={b.id} className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/client/my-business/bookings/${b.id}`} className="flex-1 min-w-0 group">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#0B2143] group-hover:text-red-500 transition">{b.customer_name || 'Unknown'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${STATUS_COLOR[b.status] || 'bg-gray-100 text-gray-600'}`}>
                      {b.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{new Date(b.booking_date).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                  {b.custom_fields && Object.keys(b.custom_fields).length > 0 && (
                    <p className="text-xs text-gray-600 mt-1 truncate">
                      {Object.entries(b.custom_fields).filter(([, v]) => v && String(v).trim()).slice(0, 2).map(([k, v]) => `${k.replace(/_/g,' ')}: ${v}`).join(' · ')}
                    </p>
                  )}
                </Link>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-emerald-600">{fmtZar(b.amount)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{b.payment_status}</p>
                </div>
              </div>
              {b.status !== 'completed' && b.status !== 'cancelled' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => statusMut.mutate({ id: b.id, status: 'completed' })}
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1">
                    <Check size={12} /> Complete
                  </button>
                  <button onClick={() => statusMut.mutate({ id: b.id, status: 'cancelled' })}
                          className="text-xs font-semibold text-red-500 hover:text-red-600 inline-flex items-center gap-1">
                    <X size={12} /> Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <WeekView bookings={bookings} />
      )}
    </div>
  );
}

function WeekView({ bookings }) {
  const days = [];
  const start = new Date();
  start.setHours(0,0,0,0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    days.push(d);
  }
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map(d => {
        const dayBookings = bookings.filter(b => {
          const bd = new Date(b.booking_date);
          return bd.toDateString() === d.toDateString();
        });
        return (
          <div key={d.toISOString()} className="rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-2 min-h-[120px]">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{d.toLocaleDateString('en-ZA', { weekday: 'short' })}</p>
            <p className="text-lg font-display text-[#0B2143]">{d.getDate()}</p>
            <div className="mt-1 space-y-1">
              {dayBookings.map(b => (
                <Link key={b.id} to={`/client/my-business/bookings/${b.id}`}
                      className={`block rounded-md px-1.5 py-0.5 text-[10px] font-semibold truncate ${STATUS_COLOR[b.status] || 'bg-gray-100 text-gray-600'}`}>
                  {new Date(b.booking_date).toLocaleTimeString('en-ZA', { hour: 'numeric', minute: '2-digit' })} {b.customer_name}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
