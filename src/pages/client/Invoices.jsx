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

  if (listQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;
  if (listQ.isError)   return <div className="text-red-600 text-sm">{listQ.error?.message}</div>;
  const rows = listQ.data ?? [];

  const outstanding = rows.filter(r => ['issued','sent','overdue'].includes(r.status)).reduce((s, r) => s + Number(r.amount ?? r.total_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">My Invoices</h1>
        <p className="text-sm text-gray-500 mt-1">All your invoices in one place.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    tab === t.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-[#0B2143]'
                  }`}>{t.label}</button>
        ))}
      </div>

      {outstanding > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
          <p className="text-red-600 font-semibold">Outstanding balance: {fmtZar(outstanding)}</p>
          <p className="text-red-700/70 text-xs mt-1">Please settle by the due date to avoid service interruption.</p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8 text-center text-gray-500">
          No invoices yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/client/invoices/${r.id}`} className="text-[#0B2143] hover:text-red-500 flex items-center gap-2">
                      <Receipt size={14} />
                      {r.invoice_number ?? r.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#0B2143]">{fmtZar(r.amount ?? r.total_amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                    {r.has_pop && !['paid'].includes(r.status) && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-700 ring-1 ring-blue-200">
                        <Upload size={8} /> POP
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
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
    paid:     { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon: CheckCircle2, label: 'Paid' },
    issued:   { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',      icon: Clock,        label: 'Outstanding' },
    sent:     { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',      icon: Clock,        label: 'Sent' },
    overdue:  { cls: 'bg-red-50 text-red-700 ring-1 ring-red-200',         icon: AlertTriangle, label: 'Overdue' },
    draft:    { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',          icon: Clock,        label: 'Draft' },
  }[status] || { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200', icon: Clock, label: status ?? 'Unknown' };
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${map.cls}`}>
      <Icon size={10} /> {map.label}
    </span>
  );
}
