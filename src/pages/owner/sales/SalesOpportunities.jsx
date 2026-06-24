import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RefreshCw, TrendingUp, DollarSign, Target, AlertTriangle,
  ChevronRight, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];
const ZAR = (v) => v == null
  ? '—'
  : `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const STAGE_LABEL = {
  new_lead: 'New lead',
  discovery_visit: 'Discovery visit',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal_sent: 'Proposal sent',
  negotiation: 'Negotiation',
};

export default function SalesOpportunities() {
  const { role } = useAuth();
  const navigate = useNavigate();

  const forecastQ = useQuery({
    queryKey: ['pipeline_forecast'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pipeline_forecast');
      if (error) throw error;
      return data;
    },
    enabled: MANAGER_ROLES.includes(role),
    staleTime: 60_000,
  });

  const stalledQ = useQuery({
    queryKey: ['stalled_deals'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('deals')
        .select('id, client_name, stage, closer_name, updated_at')
        .not('stage', 'in', '(closed_won,closed_lost)')
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: MANAGER_ROLES.includes(role),
    staleTime: 60_000,
  });

  const stageChartData = useMemo(() => {
    const rows = forecastQ.data?.by_stage ?? [];
    return rows.map(r => ({
      stage: STAGE_LABEL[r.stage] ?? r.stage,
      stageRaw: r.stage,
      count: r.count,
      sum: Number(r.sum_value || 0),
      weighted: Number(r.weighted_value || 0),
    }));
  }, [forecastQ.data]);

  if (!MANAGER_ROLES.includes(role)) {
    return (
      <div className="card p-8 text-center">
        <h1 className="font-display text-2xl"><span className="text-gradient">Sales Opportunities</span></h1>
        <p className="mt-3 text-soft">Manager-only surface (owner, admin, head of tech).</p>
      </div>
    );
  }

  const f = forecastQ.data;
  const stalledCount = f?.stalled_deals ?? 0;

  async function refresh() {
    const r = await forecastQ.refetch();
    if (r.error) toast.error(r.error.message);
    else toast.success('Forecast refreshed');
    stalledQ.refetch();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Sales Opportunities</span>
          </h1>
          <p className="mt-1 text-sm text-soft">
            Live pipeline forecast · weighted by probability · stalled deals flagged
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={forecastQ.isFetching}
          className="inline-flex items-center gap-2 rounded-xl border border-darkbg-border bg-darkbg-800/60 px-3 py-2 text-sm text-soft transition hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={forecastQ.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {forecastQ.isLoading && <p className="text-soft">Loading forecast…</p>}
      {forecastQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {forecastQ.error?.message || 'Forecast failed to load'}
        </div>
      )}

      {f && (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={TrendingUp} label="Total Open Deals" value={f.total_open_deals} />
            <Kpi icon={DollarSign} label="Total Pipeline Value" value={ZAR(f.total_pipeline_value)} sub="Annualised (setup + 12 × monthly)" />
            <Kpi icon={Target} label="Weighted Forecast" value={ZAR(f.weighted_forecast)} sub="Probability-adjusted" />
            <Kpi
              icon={AlertTriangle}
              label="Stalled Deals"
              value={stalledCount}
              sub="No update in 14+ days"
              tone={stalledCount > 0 ? 'danger' : 'normal'}
            />
          </section>

          <section className="card p-5">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg text-white">By Stage</h2>
              <p className="text-xs text-soft">Weighted value (R)</p>
            </header>
            {stageChartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-soft">No open deals to chart.</p>
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageChartData} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                    <XAxis type="number" stroke="#9aa3b2" tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} fontSize={11} />
                    <YAxis type="category" dataKey="stage" stroke="#9aa3b2" width={120} fontSize={12} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ background: '#11141c', border: '1px solid #232838', borderRadius: 8, fontSize: 12 }}
                      formatter={(_, __, p) => {
                        const r = p.payload;
                        return [
                          <span key="x">{ZAR(r.weighted)} weighted · {ZAR(r.sum)} total · {r.count} deal{r.count !== 1 ? 's' : ''}</span>,
                          'Stage',
                        ];
                      }}
                    />
                    <Bar dataKey="weighted" radius={[0, 6, 6, 0]}>
                      {stageChartData.map((_, i) => (
                        <Cell key={i} fill="#e63946" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="card p-5">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg text-white">By Closer</h2>
              <p className="text-xs text-soft">Ranked by weighted forecast</p>
            </header>
            {(!f.by_closer || f.by_closer.length === 0) ? (
              <p className="py-6 text-center text-sm text-soft">No open deals.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-darkbg-border text-left text-xs uppercase tracking-widest text-soft">
                      <th className="py-2 pr-4">Closer</th>
                      <th className="py-2 pr-4">Open Count</th>
                      <th className="py-2 pr-4">Weighted Value</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.by_closer.map(c => (
                      <tr key={c.closer_id ?? c.closer_name ?? Math.random()}
                          className="border-b border-darkbg-border/40 transition hover:bg-darkbg-900/40">
                        <td className="py-2 pr-4">
                          {c.closer_id ? (
                            <Link
                              to={`/owner/sales/opportunities/closer/${c.closer_id}`}
                              className="font-medium text-white hover:text-brandred"
                            >
                              {c.closer_name || 'Unassigned'}
                            </Link>
                          ) : (
                            <span className="text-soft">{c.closer_name || 'Unassigned'}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-soft">{c.open_count}</td>
                        <td className="py-2 pr-4 text-white">{ZAR(c.weighted_value)}</td>
                        <td className="py-2 text-right">
                          {c.closer_id && (
                            <Link to={`/owner/sales/opportunities/closer/${c.closer_id}`}
                                  className="inline-flex items-center text-xs text-soft hover:text-white">
                              View <ChevronRight size={14}/>
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="space-y-3">
        <header>
          <h2 className="font-display text-lg text-white">Stalled Deals</h2>
          <p className="text-xs text-soft">No activity for 14+ days — re-engage or close-lost</p>
        </header>
        {stalledQ.isLoading && <p className="text-soft text-sm">Loading…</p>}
        {stalledQ.data && stalledQ.data.length === 0 && (
          <p className="card p-4 text-center text-sm text-soft">Nothing stalled — pipeline is moving.</p>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(stalledQ.data ?? []).map(d => (
            <button
              key={d.id}
              onClick={() => navigate('/owner/sales')}
              className="card border-l-4 border-brandred bg-darkbg-800/60 p-4 text-left transition hover:bg-darkbg-800"
            >
              <p className="font-display text-sm text-white">{d.client_name}</p>
              <p className="mt-0.5 text-xs text-soft">{STAGE_LABEL[d.stage] ?? d.stage} · {d.closer_name || 'Unassigned'}</p>
              <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-brandred">
                <Clock size={11}/> Last update {daysSince(d.updated_at)} days ago
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }) {
  const danger = tone === 'danger';
  return (
    <div className={`card p-4 ${danger ? 'border border-brandred/40 bg-brandred/5' : ''}`}>
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-soft">
        <Icon size={13} className={danger ? 'text-brandred' : ''}/> {label}
      </div>
      <p className={`font-display text-2xl ${danger ? 'text-brandred' : 'text-white'}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-soft">{sub}</p>}
    </div>
  );
}
