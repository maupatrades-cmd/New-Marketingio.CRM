import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trophy, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];
const ZAR = (v) => v == null
  ? '—'
  : `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const Bool = ({ val, date }) => val
  ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 size={13}/>{date ? date.slice(0,10) : ''}</span>
  : <span className="inline-flex items-center gap-1 text-soft"><XCircle size={13}/>—</span>;

export default function MySales() {
  const { user, role } = useAuth();
  const isManager = MANAGER_ROLES.includes(role);
  const [viewAs, setViewAs] = useState(null);
  const targetUserId = isManager && viewAs ? viewAs : user?.id;

  const staffQ = useQuery({
    queryKey: ['my_sales_staff_list'],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, full_name, email')
        .order('full_name', { ascending: true }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const salesQ = useQuery({
    queryKey: ['my_sales_history', targetUserId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_sales_history',
        isManager && viewAs ? { p_user_id: viewAs } : {});
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const rows = salesQ.data ?? [];
  const totalTCV = rows.reduce((s, r) => s + Number(r.total_contract_value_zar || 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">My Sales</span>
          </h1>
          <p className="mt-1 text-sm text-soft">Closed-won deals you own · most recent first</p>
        </div>
        {isManager && (
          <select
            value={viewAs ?? ''}
            onChange={e => setViewAs(e.target.value || null)}
            className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Self</option>
            {(staffQ.data ?? []).filter(x => x.id !== user?.id).map(x => (
              <option key={x.id} value={x.id}>{x.full_name || x.email}</option>
            ))}
          </select>
        )}
      </header>

      {salesQ.isLoading && <p className="text-soft">Loading…</p>}
      {salesQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {salesQ.error?.message || 'Failed to load sales'}
        </div>
      )}

      {!salesQ.isLoading && rows.length === 0 && (
        <div className="card p-10 text-center">
          <Trophy size={36} className="mx-auto mb-3 text-soft/30" />
          <p className="text-sm text-soft">No closed-won deals yet. Time to close one!</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border text-left text-xs uppercase tracking-widest text-soft">
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Package</th>
                <th className="px-3 py-2">Closed</th>
                <th className="px-3 py-2 text-right">Setup fee</th>
                <th className="px-3 py-2 text-right">Monthly</th>
                <th className="px-3 py-2 text-right">TCV (6mo)</th>
                <th className="px-3 py-2">Setup cleared</th>
                <th className="px-3 py-2">Onboarded</th>
                <th className="px-3 py-2">Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.deal_id} className="border-b border-darkbg-border/40 transition hover:bg-darkbg-900/40">
                  <td className="px-3 py-2 font-medium text-white">{r.client_name || '—'}</td>
                  <td className="px-3 py-2 capitalize text-soft">
                    {r.package || '—'}
                    {r.add_on_name && <span className="ml-1 text-[11px] text-soft/60">+ {r.add_on_name}</span>}
                  </td>
                  <td className="px-3 py-2 text-soft">{r.closed_at ? r.closed_at.slice(0,10) : '—'}</td>
                  <td className="px-3 py-2 text-right text-white">
                    {r.setup_fee == null ? <span className="text-soft/50">R—</span> : ZAR(r.setup_fee)}
                  </td>
                  <td className="px-3 py-2 text-right text-white">
                    {r.monthly_retainer == null ? <span className="text-soft/50">R—</span> : <>{ZAR(r.monthly_retainer)}<span className="text-soft">/mo</span></>}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-white">
                    {r.total_contract_value_zar == null ? <span className="text-soft/50">R—</span> : ZAR(r.total_contract_value_zar)}
                  </td>
                  <td className="px-3 py-2"><Bool val={r.setup_fee_cleared} date={r.setup_fee_cleared_date}/></td>
                  <td className="px-3 py-2"><Bool val={r.client_onboarded} date={r.client_onboarded_date}/></td>
                  <td className="px-3 py-2"><Bool val={r.commission_generated}/></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-darkbg-border">
                <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-widest text-soft">{rows.length} deal{rows.length !== 1 ? 's' : ''} · Total TCV</td>
                <td className="px-3 py-2 text-right font-display text-base text-white">{ZAR(totalTCV)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
