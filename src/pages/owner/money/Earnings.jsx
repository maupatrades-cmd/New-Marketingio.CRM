import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const money = (n) => 'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });

function monthKey(d) { return d.toISOString().slice(0, 7); }
function last12Months() {
  const out = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: d.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' }) });
  }
  return out;
}

export default function Earnings() {
  const { userId } = useParams();
  const { user, role } = useAuth();
  const isOwner = role === 'owner';
  const targetId = userId || user?.id;
  const canView = isOwner || targetId === user?.id;

  const { data: person } = useQuery({
    queryKey: ['earnings-person', targetId],
    enabled: !!targetId,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').eq('id', targetId).maybeSingle();
      return data;
    },
  });

  const { data: commissions, isLoading } = useQuery({
    queryKey: ['earnings-data', targetId],
    enabled: !!targetId && canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions').select('*').eq('staff_id', targetId)
        .order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const all = commissions ?? [];
    const now = new Date();
    const thisM = monthKey(now);
    const lastM = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const ytd = String(now.getFullYear());
    const dateOf = (r) => r.paid_date || r.qualifying_event_date || (r.created_at || '').slice(0, 10);
    const sum = (pred) => all.filter(pred).reduce((s, r) => s + Number(r.commission_amount || 0), 0);
    return {
      thisMonth: sum((r) => dateOf(r).startsWith(thisM)),
      lastMonth: sum((r) => dateOf(r).startsWith(lastM)),
      ytd: sum((r) => dateOf(r).startsWith(ytd)),
      pending: sum((r) => r.status === 'pending'),
      paid: sum((r) => r.status === 'paid'),
    };
  }, [commissions]);

  const chartData = useMemo(() => {
    const months = last12Months();
    const buckets = Object.fromEntries(months.map((m) => [m.key, 0]));
    for (const r of commissions ?? []) {
      const k = (r.paid_date || r.qualifying_event_date || (r.created_at || '').slice(0, 10)).slice(0, 7);
      if (k in buckets) buckets[k] += Number(r.commission_amount || 0);
    }
    return months.map((m) => ({ month: m.label, amount: Math.round(buckets[m.key]) }));
  }, [commissions]);

  const recent = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return (commissions ?? []).filter((r) => new Date(r.created_at).getTime() >= cutoff);
  }, [commissions]);

  if (!canView) {
    return (
      <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-8 text-center">
        <p className="text-soft">You can only view your own earnings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-soft">Money</p>
        <h1 className="font-display text-3xl text-gradient">Earnings</h1>
        <p className="mt-1 text-sm text-soft">{person?.full_name || person?.email || 'Your'} commission dashboard.</p>
      </header>

      {isLoading ? (
        <div className="grid place-items-center py-20"><Loader2 size={28} className="animate-spin text-soft" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'This month', value: stats.thisMonth },
              { label: 'Last month', value: stats.lastMonth },
              { label: 'YTD',        value: stats.ytd },
              { label: 'Pending',    value: stats.pending, accent: 'text-amber-400' },
              { label: 'Paid',       value: stats.paid,    accent: 'text-emerald-400' },
            ].map(({ label, value, accent }) => (
              <div key={label} className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-4">
                <p className="text-xs uppercase tracking-widest text-soft">{label}</p>
                <p className={`mt-2 font-display text-xl ${accent || 'text-white'}`}>{money(value)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-4">
            <p className="mb-4 text-xs uppercase tracking-widest text-soft">Monthly earnings — last 12 months</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="month" stroke="#9aa0aa" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9aa0aa" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    cursor={{ fill: '#ffffff08' }}
                    contentStyle={{ background: '#1a1d24', border: '1px solid #2a2e38', borderRadius: 12, color: '#fff' }}
                    formatter={(v) => [money(v), 'Earned']}
                  />
                  <Bar dataKey="amount" fill="#e11d48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-soft">Recent (last 30 days)</h2>
            {recent.length === 0 ? (
              <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-8 text-center">
                <Wallet size={24} className="mx-auto text-soft" />
                <p className="mt-2 text-sm text-soft">No commissions in the last 30 days.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-darkbg-border">
                <table className="w-full text-sm">
                  <thead className="bg-darkbg-800/80 text-left text-[11px] uppercase tracking-widest text-soft">
                    <tr>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-darkbg-border">
                    {recent.map((r) => (
                      <tr key={r.id} className="bg-darkbg-800/30">
                        <td className="px-4 py-3 capitalize text-white">{(r.commission_type || '').replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-soft">{r.client_name || '—'}</td>
                        <td className="px-4 py-3 text-soft capitalize">{(r.qualifying_event || '').replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-right text-white">{money(r.commission_amount)}</td>
                        <td className="px-4 py-3 capitalize text-soft">{(r.status || '').replace('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
