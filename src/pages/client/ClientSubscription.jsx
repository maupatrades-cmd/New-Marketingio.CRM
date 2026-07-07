import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };
const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA') : '—';
const TABS = [{ key: 'overview', label: 'Overview' }, { key: 'history', label: 'Payment History' }, { key: 'billing', label: 'Billing' }];

export default function ClientSubscription() {
  const [tab, setTab] = useState('overview');
  const subQ = useQuery({
    queryKey: ['my-subscription'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_subscription');
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  if (subQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your subscription..." position="inline" />
    </div>
  );
  if (subQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={subQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );
  const s = subQ.data;
  const pkg = s.package || {};
  const mandate = s.mandate || {};
  const history = s.payment_history || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Subscription</h1>
        <p className="text-sm text-gray-500 mt-1">Your plan, payments and billing.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === t.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-[#0B2143]'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <section className="mio-glow-border bg-white/85 backdrop-blur-xl rounded-2xl border border-white/80 p-6 shadow-sm space-y-3">
          <Row label="Package" value={<span className="rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-xs font-semibold">{PACKAGE_LABEL[pkg.name] ?? pkg.name ?? '—'}</span>} />
          <Row label="Monthly retainer" value={fmtZar(pkg.monthly_retainer)} />
          <Row label="Setup fee" value={<span>{fmtZar(pkg.setup_fee)} {s.setup_fee_paid ? <span className="text-emerald-600 text-xs">· Paid</span> : <span className="text-amber-600 text-xs">· Outstanding</span>}</span>} />
          <Row label="Contract" value={s.contract?.client_signed_at ? <span className="text-emerald-600">Signed {fmtDate(s.contract.client_signed_at)}</span> : <span className="text-amber-600">{s.contract?.status ?? 'Not set up'}</span>} />
          <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
            <Link to="/client/products" className="inline-block bg-red-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-red-600 transition">Upgrade →</Link>
            <CancelSubscriptionLink />
          </div>
        </section>
      )}

      {tab === 'history' && (
        <section className="space-y-3">
          <div className="rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl p-4 shadow-sm">
            <p className="text-xs uppercase tracking-widest text-gray-400">Total paid</p>
            <p className="text-2xl font-bold text-[#0B2143]">{fmtZar(s.total_paid)}</p>
          </div>
          {history.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">No payments yet.</p>
          ) : (
            <div className="mio-glow-border overflow-x-auto rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th>
                </tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-b border-gray-100">
                      <td className="px-4 py-3 text-[#0B2143]">{h.number ?? h.id.slice(0,8)}</td>
                      <td className="px-4 py-3 text-[#0B2143]">{fmtZar(h.amount)}</td>
                      <td className="px-4 py-3">
                        {h.status === 'paid'
                          ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 size={12} />Paid</span>
                          : <span className="inline-flex items-center gap-1 text-amber-600 text-xs"><Clock size={12} />{h.status}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(h.paid_at || h.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'billing' && (
        <section className="mio-glow-border bg-white/85 backdrop-blur-xl rounded-2xl border border-white/80 p-6 shadow-sm space-y-3">
          <Row label="Debit date" value={mandate.debit_day ? `${mandate.debit_day} of each month` : (pkg.debit_day ? `${pkg.debit_day}` : '—')} />
          <Row label="Bank" value={mandate.bank || '—'} />
          <Row label="Account" value={mandate.account_masked || '—'} />
          <Row label="Mandate signed" value={mandate.authorized_at ? fmtDate(mandate.authorized_at) : 'Not yet'} />
          <Link to="/client/billing" className="inline-block mt-2 text-sm text-red-500 font-semibold hover:underline">Update billing details →</Link>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 last:border-0 py-2">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-[#0B2143] text-right">{value}</span>
    </div>
  );
}

function CancelSubscriptionLink() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('request_subscription_cancel', {
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      toast.success('Cancellation request sent — our team will confirm your notice period.');
      setDone(true);
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      const label = [err.message, err.details, err.hint].filter(Boolean).join(' — ');
      toast.error(label || 'Could not submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-red-500 underline underline-offset-2 transition"
      >
        Cancel my subscription
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !submitting && !done && setOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-[#0B2143]">Cancel Subscription</h3>
              <button onClick={() => !submitting && !done && setOpen(false)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {done ? (
              <div className="py-6 text-center">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-sm text-slate-700">
                  Your cancellation request has been sent. Our team will confirm the notice-period date and the final billing shortly.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  We're sorry to see you go. Your contract requires 30 days written notice. Our team will confirm the cancellation and final billing date.
                </p>
                <textarea
                  className="input-light mt-3 min-h-[100px]"
                  placeholder="Please tell us why you're cancelling (optional)"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="mt-3 w-full inline-flex items-center justify-center gap-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full py-2.5 text-sm font-semibold transition"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                  Request cancellation
                </button>
                <p className="text-[10px] text-gray-400 mt-2 text-center">
                  This sends a request — your service continues until our team confirms.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
