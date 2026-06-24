import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Receipt } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';
import Modal from '../../../components/Modal.jsx';

const STATUSES = ['all', 'draft', 'sent', 'paid', 'partial', 'overdue', 'failed', 'cancelled'];

const BADGE = {
  draft:     'border-darkbg-border bg-darkbg-900/60 text-soft',
  sent:      'border-blue-500/40 bg-blue-500/10 text-blue-300',
  partial:   'border-blue-500/40 bg-blue-500/10 text-blue-300',
  paid:      'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  overdue:   'border-brandred/40 bg-brandred/10 text-brandred',
  failed:    'border-brandred/40 bg-brandred/10 text-brandred',
  cancelled: 'border-darkbg-border bg-darkbg-900/60 text-soft',
};

const money = (n) => 'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const daysLate = (due) => (due ? Math.max(0, Math.floor((Date.now() - new Date(due + 'T00:00:00').getTime()) / 86400000)) : 0);

export default function Invoices() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isManager = ['owner', 'admin'].includes(role);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [payMethod, setPayMethod] = useState('eft');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', status],
    queryFn: async () => {
      let q = supabase.from('invoices').select('*').order('issue_date', { ascending: false }).limit(500);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (invoices ?? []).filter((i) => !s || (i.client_name || '').toLowerCase().includes(s) || (i.invoice_number || '').toLowerCase().includes(s));
  }, [invoices, search]);

  function refresh() { qc.invalidateQueries({ queryKey: ['invoices'] }); }

  async function onRefreshOverdue() {
    setRefreshing(true);
    const { error } = await supabase.rpc('detect_overdue_invoices');
    setRefreshing(false);
    if (error) toast.error(error.message);
    else { toast.success('Overdue invoices refreshed'); refresh(); }
  }

  async function submitPaid() {
    setBusy(true);
    const { error } = await supabase.from('invoices')
      .update({ status: 'paid', payment_method: payMethod, payment_date: payDate })
      .eq('id', payModal.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success('Invoice marked paid'); setPayModal(null); refresh(); }
  }

  async function onCancel(inv) {
    const reason = window.prompt('Cancellation reason');
    if (!reason) return;
    const { error } = await supabase.from('invoices')
      .update({ status: 'cancelled', cancellation_reason: reason, cancelled_at: new Date().toISOString() })
      .eq('id', inv.id);
    if (error) toast.error(error.message);
    else { toast.success('Invoice cancelled'); refresh(); }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Money</p>
          <h1 className="font-display text-3xl text-gradient">Invoices</h1>
          <p className="mt-1 text-sm text-soft">Setup and recurring billing across all clients.</p>
        </div>
        {role === 'owner' && (
          <button onClick={onRefreshOverdue} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-darkbg-border bg-darkbg-800/60 px-4 py-2 text-sm text-white hover:bg-darkbg-800 disabled:opacity-40">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh overdue
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${status === s ? 'border-brandred bg-brandred/15 text-white' : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'}`}>
            {s}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client or number…"
          className="ml-auto rounded-full border border-darkbg-border bg-darkbg-900 px-4 py-1.5 text-sm text-white placeholder:text-soft outline-none" />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20"><Loader2 size={28} className="animate-spin text-soft" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-12 text-center">
          <Receipt size={28} className="mx-auto text-soft" />
          <p className="mt-3 font-display text-lg text-white">No invoices found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-darkbg-border">
          <table className="w-full text-sm">
            <thead className="bg-darkbg-800/80 text-left text-[11px] uppercase tracking-widest text-soft">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkbg-border">
              {rows.map((i) => (
                <tr key={i.id} className="bg-darkbg-800/30 hover:bg-darkbg-800/60">
                  <td className="px-4 py-3 font-mono text-xs text-white">{i.invoice_number}</td>
                  <td className="px-4 py-3 text-white">{i.client_name}</td>
                  <td className="px-4 py-3 capitalize text-soft">{i.invoice_type}</td>
                  <td className="px-4 py-3 text-right text-white">{money(i.total_amount ?? i.amount)}</td>
                  <td className="px-4 py-3 text-soft">{fmtDate(i.issue_date)}</td>
                  <td className="px-4 py-3 text-soft">{fmtDate(i.due_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE[i.status] || BADGE.draft}`}>
                      {i.status}{i.status === 'overdue' ? ` · ${daysLate(i.due_date)}d` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isManager && !['paid', 'cancelled'].includes(i.status) && (
                        <button onClick={() => { setPayModal(i); setPayDate(new Date().toISOString().slice(0, 10)); }}
                          className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25">
                          Mark paid
                        </button>
                      )}
                      {isManager && !['paid', 'cancelled'].includes(i.status) && (
                        <button onClick={() => onCancel(i)}
                          className="rounded-full border border-darkbg-border px-2.5 py-1 text-[11px] text-soft hover:text-white">
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Mark ${payModal?.invoice_number} paid`}
        footer={<>
          <button onClick={() => setPayModal(null)} className="rounded-full border border-darkbg-border px-4 py-2 text-sm text-soft">Cancel</button>
          <button onClick={submitPaid} disabled={busy} className="btn-primary disabled:opacity-40">Confirm</button>
        </>}>
        <label className="block text-sm text-soft">Payment method
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white">
            {['eft', 'debit_order', 'card', 'cash'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </label>
        <label className="block text-sm text-soft">Payment date
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white" />
        </label>
      </Modal>
    </div>
  );
}
