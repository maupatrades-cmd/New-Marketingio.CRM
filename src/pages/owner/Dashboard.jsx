import { useQuery } from '@tanstack/react-query';
import {
  Users, Briefcase, Receipt, Wallet, Activity, AlertTriangle, TrendingUp, CheckCircle2,
  Zap,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { supabase } from '../../lib/supabase.js';

const fmtZar = (n) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
    .format(Number(n || 0));

function Kpi({ icon: Icon, label, value, gradient = false }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between text-soft">
        <Icon size={18} />
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <div className={`font-display text-3xl ${gradient ? 'text-gradient' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['owner_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_owner_dashboard');
      if (error) throw error;
      return data;
    },
  });

  const toolkitQ = useQuery({
    queryKey: ['owner-toolkit-aggregate'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_get_toolkit_aggregate');
      if (error) return null;
      return data?.ok ? data : null;
    },
  });

  if (isLoading) {
    return <div className="text-soft">Loading dashboard…</div>;
  }
  if (error) {
    return (
      <div className="card p-6">
        <p className="mb-2 flex items-center gap-2 text-brandred">
          <AlertTriangle size={18}/> Dashboard error
        </p>
        <p className="text-sm">{error.message}</p>
        <p className="mt-3 text-xs text-soft">
          If this says "Owner or admin role required", run <code>supabase/migrations/06_grant_owner.sql</code> in Supabase.
        </p>
      </div>
    );
  }

  const k = data?.kpis ?? {};
  const rev = data?.revenue_by_month ?? [];
  const pipeline = data?.pipeline_by_stage ?? {};
  const tasks = data?.open_tasks ?? [];
  const team = data?.team_kpis_this_month ?? [];

  const pipelineRows = Object.entries(pipeline).map(([stage, n]) => ({ stage, n }));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Owner Dashboard</span>
          </h1>
          <p className="text-sm text-soft">Live operational snapshot. Updates every 30s.</p>
        </div>
        <p className="text-xs text-soft">Generated {new Date(data?.generated_at).toLocaleString()}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Users}         label="Active Clients"        value={k.active_clients ?? 0} />
        <Kpi icon={Activity}      label="Onboarding"            value={k.onboarding_clients ?? 0} gradient />
        <Kpi icon={Briefcase}     label="Open Deals"            value={k.open_deals ?? 0} />
        <Kpi icon={CheckCircle2}  label="Closed-Won This Month" value={k.closed_won_this_month ?? 0} gradient />
        <Kpi icon={TrendingUp}    label="MRR"                   value={fmtZar(k.mrr_zar)} gradient />
        <Kpi icon={Receipt}       label="Outstanding Invoices"  value={k.outstanding_invoices ?? 0} />
        <Kpi icon={Wallet}        label="Pending Commissions"   value={fmtZar(k.pending_commissions)} gradient />
        <Kpi icon={AlertTriangle} label="Overdue Tasks"         value={k.overdue_tasks ?? 0} />
      </section>

      {toolkitQ.data && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg flex items-center gap-2"><Zap size={16} className="text-brandred" /> Toolkit Usage</h2>
            <span className="text-[10px] uppercase tracking-widest text-soft">My Business toolkit</span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-soft mb-1">Clients using</p>
              <p className="font-display text-2xl text-white">{toolkitQ.data.clients_using ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-soft mb-1">Total customers tracked</p>
              <p className="font-display text-2xl text-gradient">{toolkitQ.data.total_customers ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-soft mb-1">Bookings this month</p>
              <p className="font-display text-2xl text-white">{toolkitQ.data.bookings_this_month ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-soft mb-1">Top user</p>
              <p className="font-display text-lg text-white truncate">{toolkitQ.data.top_user?.business_name ?? '—'}</p>
              <p className="text-xs text-soft">{toolkitQ.data.top_user?.customer_count ?? 0} customers</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display text-lg">Revenue — last 6 months</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={rev}>
                <CartesianGrid stroke="#22356B" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#A9B6D6" fontSize={12}/>
                <YAxis stroke="#A9B6D6" fontSize={12}/>
                <Tooltip contentStyle={{ background: '#0B1C3F', border: '1px solid #22356B', color: '#fff' }}/>
                <Line type="monotone" dataKey="setup_zar" stroke="#FFC83D" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="mrr_zar"   stroke="#FF3142" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-display text-lg">Pipeline by stage</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={pipelineRows}>
                <CartesianGrid stroke="#22356B" strokeDasharray="3 3" />
                <XAxis dataKey="stage" stroke="#A9B6D6" fontSize={11}/>
                <YAxis stroke="#A9B6D6" fontSize={12}/>
                <Tooltip contentStyle={{ background: '#0B1C3F', border: '1px solid #22356B', color: '#fff' }}/>
                <Bar dataKey="n" fill="#FF3142"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-display text-lg">Open tasks</h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-soft">Nothing in the queue. Nice.</p>
          ) : (
            <ul className="divide-y divide-darkbg-border">
              {tasks.map(t => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p>{t.title}</p>
                    <p className="text-xs text-soft">{t.client_name} · {t.assigned_to_name ?? 'unassigned'}</p>
                  </div>
                  <span className="rounded-full border border-darkbg-border bg-darkbg-900/60 px-2 py-0.5 text-xs uppercase tracking-widest text-soft">
                    {t.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-display text-lg">Team KPIs · this month</h2>
          {team.length === 0 ? (
            <p className="text-sm text-soft">No commissions logged yet this month.</p>
          ) : (
            <ul className="divide-y divide-darkbg-border">
              {team.map(row => (
                <li key={row.staff_id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p>{row.staff_name}</p>
                    <p className="text-xs uppercase tracking-widest text-soft">{row.staff_role}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-brandred">{fmtZar(row.commission_total)}</p>
                    <p className="text-xs text-soft">{row.deals_closed} deals</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
