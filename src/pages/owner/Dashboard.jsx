import { useQuery } from '@tanstack/react-query';
import {
  Users, Briefcase, Receipt, Wallet, Activity, AlertTriangle, TrendingUp, CheckCircle2,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { supabase } from '../../lib/supabase.js';

const fmtZar = (n) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(n || 0));

function Kpi({ icon: Icon, label, value, accent = 'cyan', suffix }) {
  const glow = accent === 'pink' ? 'glow-pink' : 'glow-cyan';
  const color = accent === 'pink' ? 'text-synth-accent' : 'text-synth-primary';
  return (
    <div className={`card p-5 ${glow}`}>
      <div className="mb-3 flex items-center justify-between text-synth-muted">
        <Icon size={18} />
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <div className={`font-display text-3xl ${color}`}>{value}{suffix && <span className="ml-1 text-base text-synth-muted">{suffix}</span>}</div>
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

  if (isLoading) {
    return <div className="text-synth-muted">Loading dashboard…</div>;
  }
  if (error) {
    return (
      <div className="card p-6 text-rose-300">
        <p className="mb-2 flex items-center gap-2"><AlertTriangle size={18}/> Dashboard error</p>
        <p className="text-sm">{error.message}</p>
        <p className="mt-3 text-xs text-synth-muted">
          If this says "Owner or admin role required", run <code>06_grant_owner.sql</code> in Supabase.
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
          <h1 className="font-display text-3xl">Owner Dashboard</h1>
          <p className="text-sm text-synth-muted">Live operational snapshot. Updates every 30s.</p>
        </div>
        <p className="text-xs text-synth-muted">Generated {new Date(data?.generated_at).toLocaleString()}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Users}       label="Active Clients"        value={k.active_clients ?? 0} />
        <Kpi icon={Activity}    label="Onboarding"            value={k.onboarding_clients ?? 0} accent="pink"/>
        <Kpi icon={Briefcase}   label="Open Deals"            value={k.open_deals ?? 0} />
        <Kpi icon={CheckCircle2}label="Closed-Won This Month" value={k.closed_won_this_month ?? 0} accent="pink"/>
        <Kpi icon={TrendingUp}  label="MRR"                   value={fmtZar(k.mrr_zar)} />
        <Kpi icon={Receipt}     label="Outstanding Invoices"  value={k.outstanding_invoices ?? 0} accent="pink"/>
        <Kpi icon={Wallet}      label="Pending Commissions"   value={fmtZar(k.pending_commissions)} />
        <Kpi icon={AlertTriangle} label="Overdue Tasks"       value={k.overdue_tasks ?? 0} accent="pink"/>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display text-lg">Revenue — last 6 months</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={rev}>
                <CartesianGrid stroke="#2a1450" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#8676ad" fontSize={12}/>
                <YAxis stroke="#8676ad" fontSize={12}/>
                <Tooltip contentStyle={{ background: '#13062a', border: '1px solid #2a1450' }}/>
                <Line type="monotone" dataKey="setup_zar" stroke="#00ffff" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="mrr_zar"   stroke="#ff00aa" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-display text-lg">Pipeline by stage</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={pipelineRows}>
                <CartesianGrid stroke="#2a1450" strokeDasharray="3 3" />
                <XAxis dataKey="stage" stroke="#8676ad" fontSize={11}/>
                <YAxis stroke="#8676ad" fontSize={12}/>
                <Tooltip contentStyle={{ background: '#13062a', border: '1px solid #2a1450' }}/>
                <Bar dataKey="n" fill="#00ffff"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-display text-lg">Open tasks</h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-synth-muted">Nothing in the queue. Nice.</p>
          ) : (
            <ul className="divide-y divide-synth-line">
              {tasks.map(t => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p>{t.title}</p>
                    <p className="text-xs text-synth-muted">{t.client_name} · {t.assigned_to_name ?? 'unassigned'}</p>
                  </div>
                  <span className="rounded-full border border-synth-line bg-synth-bg/60 px-2 py-0.5 text-xs uppercase tracking-wider text-synth-muted">
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
            <p className="text-sm text-synth-muted">No commissions logged yet this month.</p>
          ) : (
            <ul className="divide-y divide-synth-line">
              {team.map(row => (
                <li key={row.staff_id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p>{row.staff_name}</p>
                    <p className="text-xs uppercase tracking-wider text-synth-muted">{row.staff_role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-synth-primary">{fmtZar(row.commission_total)}</p>
                    <p className="text-xs text-synth-muted">{row.deals_closed} deals</p>
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
