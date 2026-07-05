import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Receipt, CheckCircle2, AlertTriangle, Clock, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'paid',        label: 'Paid' },
  { key: 'overdue',     label: 'Overdue' },
];

export default function ClientInvoices() {
  const [tab, setTab] = useState('all');
  const listQ = useQuery({
    queryKey: ['my-invoices', tab],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_invoices', { p_status: tab });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-soft" /></div>;
  if (listQ.isError)   return <div className="text-rose-400 text-sm">{listQ.error?.message}</div>;
  const rows = listQ.data ?? [];

  const outstanding = rows.filter(r => ['issued','sent','overdue'].includes(r.status)).reduce((s, r) => s + Number(r.amount ?? r.total_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-gradient">My Invoices</h1>
        <p className="text-sm text-soft mt-1">All your invoices in one place.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-darkbg-800 p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    tab === t.key ? 'bg-brandred text-white' : 'text-soft hover:text-white'
                  }`}>{t.label}</button>
        ))}
      </div>

      {outstanding > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
          <p className="text-rose-300 font-semibold">Outstanding balance: {fmtZar(outstanding)}</p>
          <p className="text-rose-200/70 text-xs mt-1">Please settle by the due date to avoid service interruption.</p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-8 text-center text-soft">
          No invoices yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-darkbg-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border bg-darkbg-800/50 text-left text-xs uppercase tracking-wider text-soft">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-darkbg-border/50 hover:bg-darkbg-800/30">
                  <td className="px-4 py-3">
                    <Link to={`/client/invoices/${r.id}`} className="text-white hover:text-brandred flex items-center gap-2">
                      <Receipt size={14} />
                      {r.invoice_number ?? r.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white">{fmtZar(r.amount ?? r.total_amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                    {r.has_pop && !['paid'].includes(r.status) && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-blue-400/40 bg-blue-400/10 px-1.5 py-0.5 text-[9px] text-blue-300">
                        <Upload size={8} /> POP
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-soft">
                    {r.due_date ? new Date(r.due_date).toLocaleDateString('en-ZA') : '—'}
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

function StatusBadge({ status }) {
  const map = {
    paid:     { cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', icon: CheckCircle2, label: 'Paid' },
    issued:   { cls: 'border-amber-400/40 bg-amber-400/10 text-amber-300',      icon: Clock,        label: 'Outstanding' },
    sent:     { cls: 'border-amber-400/40 bg-amber-400/10 text-amber-300',      icon: Clock,        label: 'Sent' },
    overdue:  { cls: 'border-rose-400/40 bg-rose-400/10 text-rose-300',         icon: AlertTriangle, label: 'Overdue' },
    draft:    { cls: 'border-gray-500/40 bg-gray-500/10 text-gray-300',          icon: Clock,        label: 'Draft' },
  }[status] || { cls: 'border-gray-500/40 bg-gray-500/10 text-gray-300', icon: Clock, label: status ?? 'Unknown' };
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${map.cls}`}>
      <Icon size={10} /> {map.label}
    </span>
  );
}
