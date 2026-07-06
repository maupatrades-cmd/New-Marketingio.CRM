import { useEffect, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, Receipt, Upload } from 'lucide-react';
import { toast } from 'sonner';
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
      // Pull the freshest session at click-time. supabase.functions.invoke
      // has historically been flaky about attaching the user JWT
      // immediately after a magic-link hydration, so we POST directly
      // and set Authorization ourselves.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Your sign-in expired — please sign in again.');
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payfast-init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ invoice_id: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      // POST form submit to PayFast (the signature is in `fields`).
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = json.redirect_url;
      Object.entries(json.fields).forEach(([k, v]) => {
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
    return <Shell><Loader2 size={28} className="mx-auto animate-spin text-gray-400" /></Shell>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (error || !data?.invoice) {
    return (
      <Shell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle size={28} className="mx-auto text-red-500" />
          <h1 className="mt-3 font-display text-xl text-[#0B2143]">Invoice not found</h1>
          <p className="mt-2 text-sm text-gray-500">This invoice doesn't exist, or it doesn't belong to your account.</p>
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
          <p className="text-xs uppercase tracking-widest text-gray-500">Invoice</p>
          <h1 className="font-display text-3xl text-[#0B2143]">{invoice.invoice_number ?? invoice.id.slice(0, 8)}</h1>
        </div>
        <StatusPill status={invoice.status} />
      </header>

      {justPaid && !isPaid && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          We're confirming your payment with PayFast — this can take a minute. We'll email you a receipt when it lands.
        </div>
      )}
      {justCancelled && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          The PayFast checkout was cancelled. You can try again or use EFT below.
        </div>
      )}
      {isPaid && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={14} className="mr-1 inline" /> This invoice is paid{invoice.payment_date ? ` on ${invoice.payment_date}` : ''}. Thanks!
        </div>
      )}

      <section className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
        <h2 className="mb-3 font-display text-lg">Summary</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Detail label="Type" value={invoice.invoice_type?.replaceAll('_', ' ')} />
          <Detail label="Description" value={invoice.description ?? '—'} />
          <Detail label="Issued" value={invoice.issue_date ?? '—'} />
          <Detail label="Due" value={invoice.due_date ?? '—'} />
          <Detail label="Subtotal" value={fmtZar(invoice.amount)} />
          <Detail label="VAT" value={fmtZar(invoice.vat_amount)} />
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-gray-200 pt-4">
          <span className="text-sm text-gray-500">Total due</span>
          <span className="font-display text-2xl text-[#0B2143]">{fmtZar(invoice.total_amount)}</span>
        </div>
      </section>

      {!isPaid && (
        <>
          <section className="mt-5 rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
            <h2 className="mb-3 font-display text-lg">Pay online</h2>
            <p className="mb-4 text-sm text-gray-500">Card or instant EFT through PayFast — you'll be redirected, then bounced back here.</p>
            <button
              onClick={onPayWithPayfast}
              disabled={payState.phase === 'starting'}
              className="inline-flex items-center gap-2 rounded-full bg-red-500 hover:bg-red-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {payState.phase === 'starting'
                ? <><Loader2 size={14} className="animate-spin" /> Opening checkout…</>
                : <><CreditCard size={14} /> Pay {fmtZar(invoice.total_amount)} with PayFast</>}
            </button>
            {payState.phase === 'error' && (
              <p className="mt-3 text-sm text-red-600">
                {payState.message === 'payfast_not_configured'
                  ? 'Online payment isn\'t set up yet — please use the EFT details below.'
                  : `Payment couldn't start: ${payState.message}`}
              </p>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
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
              <p className="text-sm text-gray-500">EFT details available on request — email <a className="text-red-500" href="mailto:billing@marketingio.co.za">billing@marketingio.co.za</a>.</p>
            )}
            {banking?.reference_note && <p className="mt-3 text-xs text-gray-500">{banking.reference_note}</p>}
          </section>

          <PopUploadSection invoiceId={invoice.id} totalAmount={invoice.total_amount} clientId={invoice.client_id} />
        </>
      )}
    </Shell>
  );
}

function StatusPill({ status }) {
  const cls = {
    paid:    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    sent:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    overdue: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    draft:   'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
    failed:  'bg-red-50 text-red-700 ring-1 ring-red-200',
    partial: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    cancelled:'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  }[status] ?? 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
  return <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-widest ${cls}`}>{status}</span>;
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-gray-500">{label}</dt>
      <dd className="text-sm text-[#0B2143]">{value ?? '—'}</dd>
    </div>
  );
}

function PopUploadSection({ invoiceId, totalAmount, clientId }) {
  const [file, setFile] = useState(null);
  const [reference, setReference] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const path = `${clientId}/pop/${invoiceId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('client-uploads').getPublicUrl(path);
      const { error: rpcErr } = await supabase.rpc('submit_payment_proof', {
        p_invoice_id: invoiceId,
        p_file_url: pub.publicUrl,
        p_amount: totalAmount,
        p_reference: reference || null,
      });
      if (rpcErr) throw rpcErr;
      toast.success('Proof of payment submitted for review');
      setDone(true); setFile(null); setReference('');
    } catch (err) { toast.error(err.message); }
    finally { setUploading(false); }
  };

  if (done) {
    return (
      <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700">
        <CheckCircle2 size={14} className="mr-1 inline" /> POP submitted. Our team will verify and mark this invoice as paid shortly.
      </section>
    );
  }
  return (
    <section className="mt-5 rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5 space-y-3">
      <h2 className="font-display text-lg"><Upload size={16} className="mr-1 inline" /> Upload Proof of Payment</h2>
      <p className="text-sm text-gray-500">Already paid by EFT? Upload your proof and we'll confirm it.</p>
      <input type="file" accept="image/*,application/pdf"
             onChange={e => setFile(e.target.files?.[0] ?? null)}
             className="block text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-[#0B2143] hover:file:bg-gray-200" />
      <input className="input-light" placeholder="Payment reference (optional)" value={reference}
             onChange={e => setReference(e.target.value)} />
      <button onClick={submit} disabled={!file || uploading}
              className="inline-flex items-center gap-1 rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 text-sm transition">
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Submit POP
      </button>
    </section>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50 px-4 py-10 text-[#0B2143]">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}
