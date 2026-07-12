import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, Calendar, DollarSign, Clock, Plus, StickyNote, TrendingUp, TrendingDown, Mail } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { getIndustryConfig } from '../../../constants/industryConfig.js';
import MascotGuide from '../../../components/MascotGuide.jsx';

const fmtZar = (n) => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = (curr, prev) => {
  if (!prev) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
};

function Stat({ icon: Icon, label, value, curr, prev, suffix }) {
  const p = curr != null && prev != null ? pct(curr, prev) : null;
  const up = p != null && p >= 0;
  return (
    <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-2 text-gray-500">
        <Icon size={18} />
        <span className="text-[10px] uppercase tracking-widest font-semibold">{label}</span>
      </div>
      <div className="font-display text-2xl text-[#0B2143]">{value}{suffix}</div>
      {p != null && (
        <div className={`mt-1 flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {p > 0 ? '+' : ''}{p}% vs last month
        </div>
      )}
    </div>
  );
}

export default function BizDashboard() {
  const dashQ = useQuery({
    queryKey: ['biz-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('biz_get_dashboard');
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  if (dashQ.isLoading) {
    return <div className="py-12"><MascotGuide phase="thinking" size={100} message="Loading your business..." position="inline" /></div>;
  }
  if (dashQ.error) {
    return <div className="py-12"><MascotGuide phase="sad" size={100} message={dashQ.error.message} position="inline" /></div>;
  }

  const d = dashQ.data ?? {};
  const s = d.stats ?? {};
  const cfg = getIndustryConfig(d.industry);
  const top = d.top_customer;
  const next = d.next_booking;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-[#0B2143]">My Business</h1>
        <p className="text-sm text-gray-500 mt-1">{cfg.label} · your customers, bookings, notes — all in one place.</p>
      </header>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link to="/client/my-business/customers" className="inline-flex items-center gap-2 rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition">
          <Plus size={16} /> Add {cfg.customerLabel}
        </Link>
        <Link to="/client/my-business/bookings/new" className="inline-flex items-center gap-2 rounded-xl bg-[#0B2143] text-white px-4 py-2 text-sm font-semibold hover:bg-[#061638] transition">
          <Plus size={16} /> {cfg.bookingVerb}
        </Link>
        <Link to="/client/my-business/notes" className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 text-[#0B2143] px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition">
          <StickyNote size={16} /> Notes
        </Link>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Users}     label={`${cfg.customerLabel}s`} value={s.total_customers ?? 0} curr={s.new_this_month} prev={s.new_last_month} />
        <Stat icon={Calendar}  label={`${cfg.bookingLabel}s this month`} value={s.bookings_this_month ?? 0} curr={s.bookings_this_month} prev={s.bookings_last_month} />
        <Stat icon={DollarSign} label="Revenue this month" value={fmtZar(s.revenue_this_month)} curr={Number(s.revenue_this_month || 0)} prev={Number(s.revenue_last_month || 0)} />
        <Stat icon={Clock}     label="Today" value={s.today_bookings ?? 0} />
      </div>

      {/* Next up + Top customer */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Next up</h3>
          {next ? (
            <Link to={`/client/my-business/bookings/${next.id}`} className="block group">
              <p className="font-display text-lg text-[#0B2143] group-hover:text-red-500 transition">{next.customer_name || 'Unknown customer'}</p>
              <p className="text-sm text-gray-500 mt-1">{new Date(next.booking_date).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
              {Number(next.amount) > 0 && <p className="text-sm font-semibold text-emerald-600 mt-1">{fmtZar(next.amount)}</p>}
            </Link>
          ) : (
            <p className="text-sm text-gray-400">No upcoming {cfg.bookingLabel.toLowerCase()}s. <Link to="/client/my-business/bookings/new" className="text-red-500 font-semibold">Add one →</Link></p>
          )}
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Top {cfg.customerLabel.toLowerCase()}</h3>
          {top ? (
            <Link to={`/client/my-business/customers/${top.id}`} className="block group">
              <p className="font-display text-lg text-[#0B2143] group-hover:text-red-500 transition">{top.full_name}</p>
              <p className="text-sm text-gray-500 mt-1">{top.total_bookings} bookings · {fmtZar(top.total_spent)} spent</p>
            </Link>
          ) : (
            <p className="text-sm text-gray-400">No {cfg.customerLabel.toLowerCase()}s yet.</p>
          )}
        </div>
      </div>

      {/* Recent bookings */}
      <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Recent {cfg.bookingLabel.toLowerCase()}s</h3>
          <Link to="/client/my-business/bookings" className="text-xs text-red-500 font-semibold">See all →</Link>
        </div>
        {(d.recent_bookings || []).length === 0 ? (
          <p className="text-sm text-gray-400">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(d.recent_bookings || []).map(b => (
              <li key={b.id}>
                <Link to={`/client/my-business/bookings/${b.id}`} className="flex items-center justify-between py-3 group">
                  <div>
                    <p className="text-sm font-semibold text-[#0B2143] group-hover:text-red-500 transition">{b.customer_name || 'Unknown'}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{new Date(b.booking_date).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#0B2143]">{fmtZar(b.amount)}</p>
                    <p className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">{b.status}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Email stats */}
      <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5 flex items-center gap-4">
        <Mail className="text-gray-400" size={24} />
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-[#0B2143]">{s.welcome_emails_sent ?? 0}</span> welcome emails sent ·
          <span className="font-semibold text-[#0B2143] ml-1">{s.confirmations_sent ?? 0}</span> booking confirmations sent
        </div>
      </div>
    </div>
  );
}
