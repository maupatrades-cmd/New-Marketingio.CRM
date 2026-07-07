import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Save, ChevronLeft, CheckCircle2, Clock, AlertTriangle,
  CreditCard, Building2, ShieldCheck, MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const DEBIT_DAYS = ['1st', '15th'];
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'payments', label: 'Payment History' },
  { key: 'bank',     label: 'Bank Details' },
];

const fmtZar  = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function ClientBilling() {
  const [tab, setTab] = useState('overview');
  const qc = useQueryClient();

  const billQ = useQuery({
    queryKey: ['my-billing'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_billing');
      if (error) throw error;
      return data;
    },
  });

  if (billQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your billing..." position="inline" />
    </div>
  );
  if (billQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={billQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );

  const overview = billQ.data?.overview ?? {};
  const history  = billQ.data?.payment_history ?? [];
  const bank     = billQ.data?.bank ?? {};

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/client/subscription" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0B2143]">
        <ChevronLeft size={16} /> Back to subscription
      </Link>

      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Billing</h1>
        <p className="text-sm text-gray-500 mt-1">Your payments, debit day, and bank account.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    tab === t.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-[#0B2143]'
                  }`}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab overview={overview} qc={qc} />}
      {tab === 'payments' && <PaymentsTab history={history} />}
      {tab === 'bank'     && <BankTab bank={bank} />}
    </div>
  );
}

function OverviewTab({ overview, qc }) {
  const navigate = useNavigate();
  const [debitDay, setDebitDay] = useState(overview.debit_day ? String(overview.debit_day) : '');

  useEffect(() => {
    if (overview.debit_day && !debitDay) setDebitDay(String(overview.debit_day));
  }, [overview.debit_day, debitDay]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_my_billing', { p_debit_day: debitDay || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Debit day updated');
      qc.invalidateQueries({ queryKey: ['my-billing'] });
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Monthly retainer" value={fmtZar(overview.monthly_retainer)} icon={CreditCard} />
        <StatCard label="Debit day"        value={overview.debit_day ? `${overview.debit_day} of each month` : 'Not set'} icon={Clock} />
        <StatCard label="Total paid"       value={fmtZar(overview.total_paid)} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Outstanding"      value={fmtZar(overview.total_outstanding)}
                  icon={overview.total_outstanding > 0 ? AlertTriangle : CheckCircle2}
                  tone={overview.total_outstanding > 0 ? 'amber' : 'emerald'} />
      </div>

      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Change debit day</p>
          <div className="flex gap-3">
            {DEBIT_DAYS.map(d => (
              <button key={d} type="button" onClick={() => setDebitDay(d)}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  debitDay === d
                    ? 'border-red-500 bg-red-50 text-red-600'
                    : 'border-gray-200 bg-white text-gray-500 hover:text-[#0B2143]'
                }`}>
                {d} of each month
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !debitDay}
                className="inline-flex items-center gap-1 bg-red-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition">
          {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save debit day
        </button>
        <p className="text-xs text-gray-400">
          To change bank account, message us on WhatsApp — you'll need to re-sign the debit mandate for security.
        </p>
      </section>
    </div>
  );
}

function PaymentsTab({ history }) {
  if (history.length === 0) return (
    <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
      <MascotGuide phase="guide" size={80} message="No payment history yet." position="inline" />
    </div>
  );

  const totals = history.reduce((acc, i) => {
    const amt = Number(i.total_amount ?? 0);
    if (i.status === 'paid') acc.paid += amt;
    if (['issued','sent','overdue'].includes(i.status)) acc.outstanding += amt;
    return acc;
  }, { paid: 0, outstanding: 0 });

  return (
    <div className="space-y-3">
      <div className="mio-glow-border overflow-x-auto rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {history.map(i => (
              <tr key={i.id} className={`border-b border-gray-100 ${rowTone(i.status)}`}>
                <td className="px-4 py-3 text-[#0B2143] font-medium">
                  <Link to={`/client/invoices/${i.id}`} className="hover:text-red-500">
                    {i.invoice_number ?? i.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate">
                  {i.description || i.invoice_type?.replaceAll('_', ' ') || '—'}
                </td>
                <td className="px-4 py-3 text-[#0B2143]">{fmtZar(i.total_amount)}</td>
                <td className="px-4 py-3"><InvStatus status={i.status} /></td>
                <td className="px-4 py-3 text-gray-500">
                  {i.payment_date ? fmtDate(i.payment_date) : fmtDate(i.issue_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[10px] uppercase tracking-widest text-emerald-700">Total paid</p>
          <p className="text-lg font-bold text-emerald-800 mt-1">{fmtZar(totals.paid)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${
          totals.outstanding > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white/70'
        }`}>
          <p className={`text-[10px] uppercase tracking-widest ${totals.outstanding > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
            Outstanding
          </p>
          <p className={`text-lg font-bold mt-1 ${totals.outstanding > 0 ? 'text-amber-800' : 'text-[#0B2143]'}`}>
            {fmtZar(totals.outstanding)}
          </p>
        </div>
      </div>
    </div>
  );
}

function BankTab({ bank }) {
  if (!bank || !bank.bank_name) return (
    <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
      <MascotGuide phase="guide" size={80} message="No bank account on file yet." position="inline" />
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={14} className="text-[#E2293B]" />
          <p className="text-xs uppercase tracking-widest text-gray-500">Bank account</p>
        </div>
        <Row label="Bank" value={bank.bank_name || '—'} />
        <Row label="Account holder" value={bank.account_holder || '—'} />
        <Row label="Account number" value={bank.account_masked || '—'} mono />
        <Row label="Account type" value={bank.account_type || '—'} />
        <Row label="Branch code" value={bank.branch_code || '—'} mono />
        <Row label="Verification" value={
          bank.verification_status === 'verified'
            ? <span className="text-emerald-600"><CheckCircle2 size={12} className="inline mr-1" />Verified</span>
            : <span className="text-amber-600"><Clock size={12} className="inline mr-1" />{bank.verification_status || 'Pending'}</span>
        } />
      </section>

      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={14} className="text-[#E2293B]" />
          <p className="text-xs uppercase tracking-widest text-gray-500">Debit mandate</p>
        </div>
        <Row label="Status" value={
          bank.mandate_signed
            ? <span className="text-emerald-600"><CheckCircle2 size={12} className="inline mr-1" />Signed</span>
            : <span className="text-amber-600"><Clock size={12} className="inline mr-1" />Not signed</span>
        } />
        <Row label="Signed" value={bank.mandate_date ? fmtDate(bank.mandate_date) : '—'} />
      </section>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Need to change your bank account?</p>
        <p className="text-xs text-gray-500">
          For security, banking changes need a new signed mandate. Message us on WhatsApp and we'll send you a fresh mandate to sign.
        </p>
        <a href="https://wa.me/27768038987" target="_blank" rel="noreferrer"
           className="mt-2 inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 transition">
          <MessageCircle size={14} /> Message us on WhatsApp
        </a>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }) {
  const toneCls = tone === 'emerald' ? 'text-emerald-700'
                : tone === 'amber'   ? 'text-amber-700'
                : 'text-[#0B2143]';
  return (
    <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon size={14} />
        <p className="text-[10px] uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-lg font-bold mt-1 ${toneCls}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 last:border-0 py-2">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm text-[#0B2143] text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function InvStatus({ status }) {
  const map = {
    paid:     { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Paid' },
    issued:   { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       label: 'Outstanding' },
    sent:     { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       label: 'Sent' },
    overdue:  { cls: 'bg-red-50 text-red-700 ring-1 ring-red-200',             label: 'Overdue' },
    draft:    { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',         label: 'Draft' },
    disputed: { cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-300',       label: 'Disputed' },
    cancelled:{ cls: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',         label: 'Cancelled' },
    refunded: { cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',    label: 'Refunded' },
  }[status] ?? { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200', label: status ?? 'Unknown' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${map.cls}`}>{map.label}</span>;
}

function rowTone(status) {
  if (status === 'paid')     return 'bg-emerald-50/30';
  if (status === 'overdue')  return 'bg-red-50/30';
  if (['issued','sent'].includes(status)) return 'bg-amber-50/20';
  if (status === 'disputed') return 'bg-amber-50/40';
  return '';
}
