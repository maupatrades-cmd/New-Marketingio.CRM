import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Loader2, PenLine } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

// /sign/:signing_token — PUBLIC. The token IS the auth. No supabase
// session is required; we POST the token to `resolve-signing-token`
// and `sign-contract` Edge Functions, which validate it with the
// service role.

const fmtZar = n => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SignContract() {
  const { signing_token } = useParams();
  const [state, setState] = useState({ phase: 'loading' });
  const [signatureName, setSignatureName] = useState('');
  const [popiaConsent, setPopiaConsent]   = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [errMsg, setErrMsg]               = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('resolve-signing-token', {
          body: { signing_token },
        });
        if (cancelled) return;
        if (error) { setState({ phase: 'error', code: 'network', message: error.message }); return; }
        if (!data?.ok) { setState({ phase: 'error', code: data?.error ?? 'unknown' }); return; }
        if (data.already_signed) { setState({ phase: 'already_signed', data }); return; }
        setState({ phase: 'ready', data });
      } catch (err) {
        if (!cancelled) setState({ phase: 'error', code: 'network', message: err.message });
      }
    })();
    return () => { cancelled = true; };
  }, [signing_token]);

  const onSign = async () => {
    setErrMsg('');
    if (submitting) return;
    if (signatureName.trim().length < 2) { setErrMsg('Please type your full name.'); return; }
    if (!popiaConsent) { setErrMsg('Please tick the POPIA consent box.'); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('sign-contract', {
        body: { signing_token, signature_name: signatureName.trim(), popia_consent: true },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? 'sign_failed');
      setState(s => ({ phase: 'signed', data: { ...s.data, signed_date: data.signed_date } }));
    } catch (err) {
      setErrMsg(err.message);
      setSubmitting(false);
    }
  };

  if (state.phase === 'loading') {
    return (
      <PageShell>
        <Loader2 size={28} className="mx-auto animate-spin text-soft" />
        <p className="mt-3 text-center text-sm text-soft">Loading your agreement…</p>
      </PageShell>
    );
  }
  if (state.phase === 'error') {
    const msg = errorCopy(state.code);
    return (
      <PageShell>
        <div className="rounded-2xl border border-rose-700/40 bg-rose-900/20 p-6 text-center">
          <AlertTriangle size={28} className="mx-auto text-rose-400" />
          <h1 className="mt-3 font-display text-xl text-white">{msg.title}</h1>
          <p className="mt-2 text-sm text-soft">{msg.body}</p>
          <p className="mt-4 text-xs text-soft">If you think this is a mistake, email <a className="text-brandred" href="mailto:support@marketingio.co.za">support@marketingio.co.za</a>.</p>
        </div>
      </PageShell>
    );
  }
  if (state.phase === 'already_signed' || state.phase === 'signed') {
    const isFresh = state.phase === 'signed';
    return (
      <PageShell>
        <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/20 p-6 text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-400" />
          <h1 className="mt-3 font-display text-xl text-white">
            {isFresh ? 'Thanks — your agreement is signed.' : 'This agreement is already signed.'}
          </h1>
          <p className="mt-2 text-sm text-soft">
            Signed on <strong>{state.data.signed_date ?? state.data.contract.signed_date}</strong>.
          </p>
          <Link to="/welcome" className="mt-5 inline-flex rounded-full bg-gradient-to-r from-brandred to-pink-500 px-6 py-3 text-sm font-semibold text-white">
            Open your portal →
          </Link>
        </div>
      </PageShell>
    );
  }

  const { contract, client, package_meta } = state.data;
  const pkgLabel = contract.package === 'add_on'
    ? (contract.add_on_name ?? 'Add-on')
    : (package_meta?.name ?? contract.package ?? '—');

  return (
    <PageShell>
      <div className="space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="font-display text-3xl text-gradient">Sign your Marketing iO agreement</h1>
          <p className="text-sm text-soft">{client?.business_name}</p>
        </header>

        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-5">
          <h2 className="mb-3 font-display text-lg">Agreement summary</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <Detail label="Package" value={pkgLabel} />
            <Detail label="Initial term" value={contract.initial_term_months ? `${contract.initial_term_months} months` : '—'} />
            <Detail label="Setup fee" value={fmtZar(contract.setup_fee)} />
            <Detail label="Monthly retainer" value={fmtZar(contract.monthly_retainer)} />
            <Detail label="Start date" value={contract.contract_start_date ?? '—'} />
            <Detail label="End date" value={contract.contract_end_date ?? '—'} />
            <Detail label="Debit-order date" value={contract.debit_order_date ?? '—'} />
            <Detail label="Status" value={contract.status} />
          </dl>
        </div>

        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-5 text-sm leading-relaxed text-soft">
          <h2 className="mb-3 font-display text-lg text-white">What you're agreeing to</h2>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>The <strong>{pkgLabel}</strong> deliverables as quoted, for {contract.initial_term_months ?? 12} months.</li>
            <li>Monthly retainer of <strong>{fmtZar(contract.monthly_retainer)}</strong>, debited on the <strong>{contract.debit_order_date ?? '1st'}</strong> of each month after the setup invoice clears.</li>
            <li>Setup fee of <strong>{fmtZar(contract.setup_fee)}</strong> due before delivery starts.</li>
            <li>Cancellation as per the Master Services Agreement (V3.0). Early-exit fees apply if cancelled before term-end.</li>
            <li>POPIA consent for Marketing iO to process the data needed to deliver this service.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-5">
          <h2 className="mb-3 font-display text-lg text-white">Sign</h2>
          <label className="label">Type your full name</label>
          <input
            className="input"
            placeholder="e.g. Thabo Mokoena"
            value={signatureName}
            onChange={e => setSignatureName(e.target.value)}
          />
          <p className="mt-1 text-xs text-soft">Typing your full name here counts as your electronic signature.</p>

          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-soft">
            <input type="checkbox" className="mt-1" checked={popiaConsent} onChange={e => setPopiaConsent(e.target.checked)} />
            <span>I agree to the terms above and consent (POPIA) to Marketing iO processing my data for service delivery.</span>
          </label>

          {errMsg && <p className="mt-3 text-sm text-rose-400">{errMsg}</p>}

          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brandred to-pink-500 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            onClick={onSign}
            disabled={submitting}
          >
            {submitting
              ? <><Loader2 size={16} className="animate-spin" /> Signing…</>
              : <><PenLine size={16} /> Sign agreement</>}
          </button>
        </div>
      </div>
    </PageShell>
  );
}

function errorCopy(code) {
  switch (code) {
    case 'invalid_token': return { title: 'Invalid signing link', body: "That link doesn't look right." };
    case 'not_found':     return { title: 'Signing link not found', body: 'We can\'t find a contract for that link. It may have been replaced.' };
    case 'expired':       return { title: 'Signing link expired', body: 'For security, signing links expire. We\'ll resend a fresh one.' };
    case 'cancelled':     return { title: 'Agreement was cancelled', body: 'This agreement was cancelled before signing.' };
    default:              return { title: 'Something went wrong', body: 'We couldn\'t load this agreement right now.' };
  }
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-soft">{label}</dt>
      <dd className="text-sm text-white">{value ?? '—'}</dd>
    </div>
  );
}

function PageShell({ children }) {
  return (
    <div className="min-h-screen bg-darkbg-900 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}
