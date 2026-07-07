import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, Receipt, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import MascotGuide from '../../components/MascotGuide.jsx';
import PaymentSuccessModal from '../../components/ui/PaymentSuccessModal.jsx';

// /client/invoices/:id — authenticated, RLS-scoped (invoices_read policy
// only returns rows where clients.client_user_id = auth.uid()). PayFast
// init goes through the `payfast-init` Edge Function — signature is
// generated server-side; the client never sees merchant_key / passphrase.

const fmtZar = n => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClientInvoice() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [payState, setPayState] = useState({ phase: 'idle' });
  const [showSuccessModal, setShowSuccessModal] = useState(false);

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

  // Compute derived flags BEFORE any early return so useEffect always
  // runs — otherwise React sees a different hook count on loading vs
  // loaded renders and throws #310.
  const invoice = data?.invoice;
  const banking = data?.banking;
  const isPaid  = invoice?.status === 'paid';
  const justPaid      = search.get('paid') === '1';
  const justCancelled = search.get('cancelled') === '1';
  const demoSuccess   = search.get('demo') === '1';

  // Real trigger: client just came back from PayFast AND the ITN has flipped
  // the invoice to paid. Demo trigger: ?demo=1 for previewing the modal.
  useEffect(() => {
    if ((justPaid && isPaid) || demoSuccess) setShowSuccessModal(true);
  }, [justPaid, isPaid, demoSuccess]);

  if (authLoading || isLoading) {
    return (
      <Shell>
        <MascotGuide phase="thinking" size={100} message="Fetching your invoice..." position="inline" />
      </Shell>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (error || !invoice) {
    return (
      <Shell>
        <MascotGuide
          phase="sad"
          size={100}
          message="Invoice not found — it may not belong to your account, or the link is stale."
          position="inline"
        />
      </Shell>
    );
  }

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

      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
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

          <DisputeSection invoice={invoice} />
        </>
      )}

      <PaymentSuccessModal
        open={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          // Drop the paid=1/demo=1 query so a browser refresh doesn't
          // re-open the modal — but stay on the invoice page.
          if (justPaid || demoSuccess) navigate(`/client/invoices/${id}`, { replace: true });
        }}
      />
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
    disputed:'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    refunded:'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
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

function DisputeSection({ invoice }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already disputed — show a status card, no button.
  if (invoice.status === 'disputed') {
    return (
      <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <AlertTriangle size={14} className="mr-1 inline" />
        This invoice is under dispute. Our team will follow up within 48 hours.
      </section>
    );
  }

  const submit = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('dispute_invoice', {
        p_invoice_id: invoice.id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast.success('Dispute submitted — our team will review within 48 hours.');
      setOpen(false);
      setReason('');
      // Nudge the invoice query so the section switches to the "under dispute" state.
      setTimeout(() => window.location.reload(), 400);
    } catch (err) {
      const label = [err.message, err.details, err.hint].filter(Boolean).join(' — ');
      toast.error(label || 'Could not submit dispute.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="mt-4 text-right">
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-gray-500 hover:text-red-500 underline underline-offset-2 transition"
        >
          Dispute this invoice
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-[#0B2143]">Dispute Invoice {invoice.invoice_number}</h3>
              <button onClick={() => !submitting && setOpen(false)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Tell us why you're disputing this invoice. Our team will review within 48 hours.
            </p>
            <textarea
              className="input-light mt-3 min-h-[110px]"
              placeholder="What's the issue with this invoice?"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            <button
              onClick={submit}
              disabled={!reason.trim() || submitting}
              className="mt-3 w-full inline-flex items-center justify-center gap-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full py-2.5 text-sm font-semibold transition"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Submit dispute
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50 px-4 py-10 text-[#0B2143]">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}
