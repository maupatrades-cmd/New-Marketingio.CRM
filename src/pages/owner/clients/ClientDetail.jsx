import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Users, Calendar, DollarSign, Mail, Zap, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { getIndustryConfig } from '../../../constants/industryConfig.js';

const fmtZar = (n) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(n || 0));

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'toolkit',  label: 'Toolkit' },
];

export default function OwnerClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState('overview');

  const clientQ = useQuery({
    queryKey: ['owner-client', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, business_name, contact_person, email, phone, industry, status, package, created_at')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const toolkitQ = useQuery({
    queryKey: ['owner-client-toolkit', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_get_client_toolkit_stats', { p_client_id: id });
      if (error) throw error;
      return data;
    },
  });

  if (clientQ.isLoading) return <div className="text-soft">Loading client…</div>;
  if (clientQ.error || !clientQ.data) return <div className="text-soft">Client not found.</div>;

  const c = clientQ.data;
  const cfg = getIndustryConfig(c.industry);
  const tk = toolkitQ.data ?? {};

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <button onClick={() => nav('/owner/clients')} className="rounded-full p-2 hover:bg-white/5 transition text-soft">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-3xl text-gradient truncate">{c.business_name}</h1>
          <p className="text-sm text-soft mt-1">{c.contact_person || '—'} · {c.industry || 'no industry'} · {c.status}</p>
        </div>
        {tk.power_user && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brandred/20 text-brandred px-3 py-1 text-xs font-semibold">
            <Sparkles size={12} /> Power user
          </span>
        )}
      </header>

      <div className="flex gap-2 border-b border-darkbg-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === t.key ? 'border-brandred text-white' : 'border-transparent text-soft hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-widest text-soft mb-3">Contact</p>
            <p className="text-sm mb-1"><span className="text-soft">Person: </span>{c.contact_person || '—'}</p>
            <p className="text-sm mb-1"><span className="text-soft">Email: </span>{c.email || '—'}</p>
            <p className="text-sm mb-1"><span className="text-soft">Phone: </span>{c.phone || '—'}</p>
          </div>
          <div className="card p-5">
            <p className="text-[10px] uppercase tracking-widest text-soft mb-3">Account</p>
            <p className="text-sm mb-1"><span className="text-soft">Package: </span>{c.package || '—'}</p>
            <p className="text-sm mb-1"><span className="text-soft">Industry: </span>{cfg.label}</p>
            <p className="text-sm mb-1"><span className="text-soft">Since: </span>{new Date(c.created_at).toLocaleDateString('en-ZA')}</p>
          </div>
        </section>
      )}

      {tab === 'toolkit' && (
        <section className="space-y-4">
          {toolkitQ.isLoading ? (
            <p className="text-soft">Loading toolkit stats…</p>
          ) : tk.customers === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-soft">This client hasn't started using their My Business toolkit yet.</p>
              <p className="text-xs text-soft mt-2">Once they add customers and bookings, stats will appear here.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Kpi icon={Users}       label={`${cfg.customerLabel}s tracked`} value={tk.customers ?? 0} />
                <Kpi icon={Calendar}    label={`${cfg.bookingLabel}s this month`} value={tk.bookings_this_month ?? 0} />
                <Kpi icon={DollarSign}  label="Revenue this month" value={fmtZar(tk.revenue_this_month)} />
                <Kpi icon={Mail}        label="Emails sent" value={(tk.welcome_emails_sent ?? 0) + (tk.confirmations_sent ?? 0)} />
              </div>
              {tk.top_customer && (
                <div className="card p-5">
                  <p className="text-[10px] uppercase tracking-widest text-soft mb-3">Top {cfg.customerLabel.toLowerCase()}</p>
                  <p className="font-display text-xl text-white">{tk.top_customer.full_name}</p>
                  <p className="text-sm text-soft mt-1">{tk.top_customer.total_bookings} bookings · {fmtZar(tk.top_customer.total_spent)} spent</p>
                </div>
              )}
              {tk.last_activity_at && (
                <p className="text-xs text-soft">Last activity: {new Date(tk.last_activity_at).toLocaleString('en-ZA')}</p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between text-soft">
        <Icon size={18} />
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <div className="font-display text-3xl text-white">{value}</div>
    </div>
  );
}
