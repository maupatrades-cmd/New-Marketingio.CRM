import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Receipt, CheckCircle2, AlertTriangle, Clock, Upload, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

// Fetch all invoices once and filter client-side — one query,
// instant tab switches, and free-text search across number + description.
const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'paid',        label: 'Paid' },
  { key: 'overdue',     label: 'Overdue', danger: true },
  { key: 'disputed',    label: 'Disputed' },
];

export default function ClientInvoices() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const listQ = useQuery({
    queryKey: ['my-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_invoices', { p_status: 'all' });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (listQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your invoices..." position="inline" />
    </div>
  );
  if (listQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={listQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );

  const all = listQ.data ?? [];

  const counts = {
    outstanding: all.filter(r => ['issued','sent'].includes(r.status)).length,
    overdue:     all.filter(r => r.status === 'overdue').length,
    disputed:    all.filter(r => r.status === 'disputed').length,
  };

  const outstanding = all
    .filter(r => ['issued','sent','overdue'].includes(r.status))
    .reduce((s, r) => s + Number(r.amount ?? r.total_amount ?? 0), 0);

  const filtered = useMemo(() => {
    let list = all;
    if (tab === 'outstanding') list = list.filter(r => ['issued','sent'].includes(r.status));
    if (tab === 'paid')        list = list.filter(r => r.status === 'paid');
    if (tab === 'overdue')     list = list.filter(r => r.status === 'overdue');
    if (tab === 'disputed')    list = list.filter(r => r.status === 'disputed');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        (r.invoice_number?.toLowerCase().includes(q)) ||
        (r.description?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [all, tab, search]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">My Invoices</h1>
        <p className="text-sm text-gray-500 mt-1">All your invoices in one place.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1 w-fit flex-wrap">
        {TABS.map(t => {
          const badge = counts[t.key] ?? 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
                    className={`relative rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      tab === t.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-[#0B2143]'
                    }`}>
              {t.label}
              {badge > 0 && tab !== t.key && (
                <span className={`ml-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] ${
                  t.danger ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
               placeholder="Search by invoice number or description…"
               className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-gray-200 text-sm text-[#0B2143] placeholder:text-gray-400 focus:outline-none focus:border-red-300" />
      </div>

      {outstanding > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
          <p className="text-red-600 font-semibold">Outstanding balance: {fmtZar(outstanding)}</p>
          <p className="text-red-700/70 text-xs mt-1">Please settle by the due date to avoid service interruption.</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
          <MascotGuide phase="guide" size={80}
            message={search
              ? `No invoices match "${search}".`
              : (all.length === 0
                ? "No invoices yet — they'll appear here once your account is set up."
                : `No ${tab === 'all' ? '' : tab + ' '}invoices to show.`)}
            position="inline" />
        </div>
      ) : (
        <div className="mio-glow-border overflow-x-auto rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm">
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
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/client/invoices/${r.id}`} className="text-[#0B2143] hover:text-red-500 flex items-center gap-2">
                      <Receipt size={14} />
                      {r.invoice_number ?? r.id.slice(0, 8)}
                    </Link>
                    {r.description && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-xs">{r.description}</p>
                    )}
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
    paid:     { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', icon: CheckCircle2,  label: 'Paid' },
    issued:   { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       icon: Clock,         label: 'Outstanding' },
    sent:     { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       icon: Clock,         label: 'Sent' },
    overdue:  { cls: 'bg-red-50 text-red-700 ring-1 ring-red-200',             icon: AlertTriangle, label: 'Overdue' },
    draft:    { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',         icon: Clock,         label: 'Draft' },
    disputed: { cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-300',       icon: AlertTriangle, label: 'Disputed' },
    refunded: { cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',    icon: CheckCircle2,  label: 'Refunded' },
    cancelled:{ cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',         icon: Clock,         label: 'Cancelled' },
  }[status] || { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200', icon: Clock, label: status ?? 'Unknown' };
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${map.cls}`}>
      <Icon size={10} /> {map.label}
    </span>
  );
}
