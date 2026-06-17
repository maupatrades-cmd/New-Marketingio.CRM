import { useEffect, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

// /client/invoices/:id — authenticated, RLS-scoped (invoices_read policy
// only returns rows where clients.client_user_id = auth.uid()). PayFast
// init goes through the `payfast-init` Edge Function — signature is
// generated server-side; the client never sees merchant_key / passphrase.

const fmtZar = n => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClientInvoice() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams();
  const [search] = useSearchParams();
  const [payState, setPayState] = useState({ phase: 'idle' });

  const { data, isLoading, error } = useQuery({
    queryKey: ['client-invoice', id, user?.id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data: invoice, error: iErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_type, description, amount, vat_amount, total_amount, issue_date, due_date, status, payment_method, payment_date, client_id, client_name')
        .eq('id', id)
        .maybeSingle();
      if (iErr) throw iErr;
      if (!invoice) return { invoice: null, banking: null };
      const { data: settings } = await supabase
        .from('system_settings').select('value').eq('key', 'banking_details').maybeSingle();
      return { invoice, banking: settings?.value ?? null };
    },
  });

  const onPayWithPayfast = async () => {
    setPayState({ phase: 'starting' });
    try {
      const { data: res, error: invokeErr } = await supabase.functions.invoke('payfast-init', {
        body: { invoice_id: id },
      });
      if (invokeErr) throw new Error(invokeErr.message);
      if (!res?.ok) throw new Error(res?.error ?? 'payfast_failed');
      // POST form submit to PayFast (the signature is in `fields`).
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = res.redirect_url;
      Object.entries(res.fields).forEach(([k, v]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.value = String(v);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setPayState({ phase: 'error', message: err.message });
    }
  };

  if (authLoading || isLoading) {
    return <Shell><Loader2 size={28} className="mx-auto animate-spin text-soft" /></Shell>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (error || !data?.invoice) {
    return (
      <Shell>
        <div className="rounded-2xl border border-rose-700/40 bg-rose-900/20 p-6 text-center">
          <AlertTriangle size={28} className="mx-auto text-rose-400" />
          <h1 className="mt-3 font-display text-xl text-white">Invoice not found</h1>
          <p className="mt-2 text-sm text-soft">This invoice doesn't exist, or it doesn't belong to your account.</p>
        </div>
      </Shell>
    );
  }

  const { invoice, banking } = data;
  const isPaid = invoice.status === 'paid';
  const justPaid = search.get('paid') === '1';
  const justCancelled = search.get('cancelled') === '1';

  return (
    <Shell>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Invoice</p>
          <h1 className="font-display text-3xl text-gradient">{invoice.invoice_number ?? invoice.id.slice(0, 8)}</h1>
        </div>
        <StatusPill status={invoice.status} />
      </header>

      {justPaid && !isPaid && (
        <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
          We're confirming your payment with PayFast — this can take a minute. We'll email you a receipt when it lands.
        </div>
      )}
      {justCancelled && (
        <div className="mb-4 rounded-lg border border-rose-700/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-200">
          The PayFast checkout was cancelled. You can try again or use EFT below.
        </div>
      )}
      {isPaid && (
        <div className="mb-4 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 size={14} className="mr-1 inline" /> This invoice is paid{invoice.payment_date ? ` on ${invoice.payment_date}` : ''}. Thanks!
        </div>
      )}

      <section className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-5">
        <h2 className="mb-3 font-display text-lg">Summary</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Detail label="Type" value={invoice.invoice_type?.replaceAll('_', ' ')} />
          <Detail label="Description" value={invoice.description ?? '—'} />
          <Detail label="Issued" value={invoice.issue_date ?? '—'} />
          <Detail label="Due" value={invoice.due_date ?? '—'} />
          <Detail label="Subtotal" value={fmtZar(invoice.amount)} />
          <Detail label="VAT" value={fmtZar(invoice.vat_amount)} />
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-darkbg-border pt-4">
          <span className="text-sm text-soft">Total due</span>
          <span className="font-display text-2xl text-white">{fmtZar(invoice.total_amount)}</span>
        </div>
      </section>

      {!isPaid && (
        <>
          <section className="mt-5 rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-5">
            <h2 className="mb-3 font-display text-lg">Pay online</h2>
            <p className="mb-4 text-sm text-soft">Card or instant EFT through PayFast — you'll be redirected, then bounced back here.</p>
            <button
              onClick={onPayWithPayfast}
              disabled={payState.phase === 'starting'}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brandred to-pink-500 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {payState.phase === 'starting'
                ? <><Loader2 size={14} className="animate-spin" /> Opening checkout…</>
                : <><CreditCard size={14} /> Pay {fmtZar(invoice.total_amount)} with PayFast</>}
            </button>
            {payState.phase === 'error' && (
              <p className="mt-3 text-sm text-rose-400">
                {payState.message === 'payfast_not_configured'
                  ? 'Online payment isn\'t set up yet — please use the EFT details below.'
                  : `Payment couldn't start: ${payState.message}`}
              </p>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-5">
            <h2 className="mb-3 font-display text-lg"><Receipt size={16} className="mr-1 inline" /> Pay by EFT</h2>
            {banking && banking.bank ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
                <Detail label="Bank" value={banking.bank} />
                <Detail label="Account name" value={banking.account_name} />
                <Detail label="Account number" value={banking.account_number} />
                <Detail label="Branch code" value={banking.branch_code} />
                <Detail label="Reference" value={invoice.invoice_number ?? invoice.id.slice(0,8)} />
                <Detail label="Amount" value={fmtZar(invoice.total_amount)} />
              </dl>
            ) : (
              <p className="text-sm text-soft">EFT details available on request — email <a className="text-brandred" href="mailto:billing@marketingio.co.za">billing@marketingio.co.za</a>.</p>
            )}
            {banking?.reference_note && <p className="mt-3 text-xs text-soft">{banking.reference_note}</p>}
          </section>
        </>
      )}
    </Shell>
  );
}

function StatusPill({ status }) {
  const cls = {
    paid:    'bg-emerald-700/30 text-emerald-300 border-emerald-700/50',
    sent:    'bg-sky-700/30 text-sky-300 border-sky-700/50',
    overdue: 'bg-rose-700/30 text-rose-300 border-rose-700/50',
    draft:   'bg-slate-700/30 text-slate-300 border-slate-700/50',
    failed:  'bg-rose-700/30 text-rose-300 border-rose-700/50',
    partial: 'bg-amber-700/30 text-amber-300 border-amber-700/50',
    cancelled:'bg-slate-700/30 text-slate-400 border-slate-700/50',
  }[status] ?? 'bg-slate-700/30 text-slate-300 border-slate-700/50';
  return <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest ${cls}`}>{status}</span>;
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-soft">{label}</dt>
      <dd className="text-sm text-white">{value ?? '—'}</dd>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-darkbg-900 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}
