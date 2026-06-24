import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Coins } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const STATUSES = ['all', 'pending', 'paid', 'clawed_back'];
const BADGE = {
  pending:     'border-amber-500/40 bg-amber-500/10 text-amber-300',
  paid:        'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  clawed_back: 'border-brandred/40 bg-brandred/10 text-brandred',
};
const money = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Commissions() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = role === 'owner';
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const { data: rows, isLoading } = useQuery({
    queryKey: ['commissions', status],
    queryFn: async () => {
      let q = supabase.from('commissions').select('*').order('created_at', { ascending: false }).limit(1000);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || (r.staff_name || '').toLowerCase().includes(s) || (r.client_name || '').toLowerCase().includes(s));
  }, [rows, search]);

  const summary = useMemo(() => {
    const all = rows ?? [];
    const pending = all.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.commission_amount || 0), 0);
    const paidThisMonth = all.filter((r) => r.status === 'paid' && (r.paid_date || '').startsWith(thisMonth())).reduce((s, r) => s + Number(r.commission_amount || 0), 0);
    const byStaff = {};
    for (const r of all.filter((r) => r.status === 'paid')) byStaff[r.staff_name] = (byStaff[r.staff_name] || 0) + Number(r.commission_amount || 0);
    const top = Object.entries(byStaff).sort((a, b) => b[1] - a[1])[0];
    return { pending, paidThisMonth, top: top ? `${top[0]} (${money(top[1])})` : '—' };
  }, [rows]);

  function refresh() { queryClient.invalidateQueries({ queryKey: ['commissions'] }); }

  async function onPaid(r) {
    const { error } = await supabase.from('commissions')
      .update({ status: 'paid', paid_date: new Date().toISOString().slice(0, 10) })
      .eq('id', r.id);
    if (error) toast.error(error.message);
    else { toast.success('Commission marked paid'); refresh(); }
  }

  async function onClawback(r) {
    const reason = window.prompt('Clawback reason');
    if (!reason) return;
    const { error } = await supabase.from('commissions')
      .update({ status: 'clawed_back', clawback_reason: reason })
      .eq('id', r.id);
    if (error) toast.error(error.message);
    else { toast.success('Commission clawed back'); refresh(); }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-soft">Money</p>
        <h1 className="font-display text-3xl text-gradient">Commissions</h1>
        <p className="mt-1 text-sm text-soft">Lead fees, closure bonuses and recurring commissions.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Summary label="Total pending" value={money(summary.pending)} />
        <Summary label="Paid this month" value={money(summary.paidThisMonth)} accent="text-emerald-400" />
        <Summary label="Top earner" value={summary.top} small />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${status === s ? 'border-brandred bg-brandred/15 text-white' : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'}`}>{s.replace('_', ' ')}</button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff or client…" className="ml-auto rounded-full border border-darkbg-border bg-darkbg-900 px-4 py-1.5 text-sm text-white placeholder:text-soft" />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20"><Loader2 size={28} className="animate-spin text-soft" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-12 text-center">
          <Coins size={28} className="mx-auto text-soft" />
          <p className="mt-3 font-display text-lg text-white">No commissions</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-darkbg-border">
          <table className="w-full text-sm">
            <thead className="bg-darkbg-800/80 text-left text-[11px] uppercase tracking-widest text-soft">
              <tr>
                <th className="px-4 py-3">Staff</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Client</th>
                <th className="px-4 py-3 text-right">Base</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3">Event</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkbg-border">
              {filtered.map((r) => (
                <tr key={r.id} className="bg-darkbg-800/30">
                  <td className="px-4 py-3 text-white">{r.staff_name}</td>
                  <td className="px-4 py-3 capitalize text-soft">{(r.commission_type || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-soft">{r.client_name || '—'}</td>
                  <td className="px-4 py-3 text-right text-soft">{money(r.base_amount)}</td>
                  <td className="px-4 py-3 text-right text-soft">{r.rate_percent != null ? `${r.rate_percent}%` : '—'}</td>
                  <td className="px-4 py-3 text-right text-white">{money(r.commission_amount)}</td>
                  <td className="px-4 py-3 text-soft">{(r.qualifying_event || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE[r.status] || BADGE.pending}`}>{(r.status || '').replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isOwner && r.status === 'pending' && (
                        <button onClick={() => onPaid(r)} className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25">Mark paid</button>
                      )}
                      {isOwner && r.status !== 'clawed_back' && (
                        <button onClick={() => onClawback(r)} className="rounded-full border border-darkbg-border px-2.5 py-1 text-[11px] text-soft hover:text-brandred">Clawback</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, accent, small }) {
  return (
    <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-4">
      <p className="text-xs uppercase tracking-widest text-soft">{label}</p>
      <p className={`mt-2 font-display ${small ? 'text-lg' : 'text-2xl'} ${accent || 'text-white'}`}>{value}</p>
    </div>
  );
}
