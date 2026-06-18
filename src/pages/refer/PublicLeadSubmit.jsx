// /refer/:token — public lead submission page for external marketers.
// No auth required. Flow:
//   1. Validate the token (calls public-lead-submit with a dry-run? No —
//      we validate the token by attempting the captcha first; a 404 on
//      the token gives an error screen).
//   2. Captcha challenge (captcha-photos /issue → user solves → /verify).
//   3. POPIA consent checkbox.
//   4. Lead form → submit to public-lead-submit.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PACKAGES = [
  { v: 'ignite',         label: 'Ignite' },
  { v: 'accelerate',     label: 'Accelerate' },
  { v: 'dominate',       label: 'Dominate' },
  { v: 'street_pulse',   label: 'Street Pulse' },
  { v: 'township_pulse', label: 'Township Pulse' },
  { v: 'other',          label: 'Not sure' },
];

function PillPicker({ label, options, value, onChange }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-medium text-soft">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(value === o.v ? '' : o.v)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              value === o.v
                ? 'border-brandred bg-brandred/20 text-brandred font-semibold'
                : 'border-darkbg-border bg-darkbg-900/60 text-soft hover:border-brandred/40'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Captcha component ────────────────────────────────────────────────────────

function CaptchaChallenge({ onVerified }) {
  const [challenge, setChallenge] = useState(null);
  const [picked, setPicked]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  async function loadChallenge() {
    setLoading(true);
    setError(null);
    setPicked(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/captcha-photos/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setChallenge(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (!picked || !challenge) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/captcha-photos/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          challenge_id:   challenge.challenge_id,
          expected_label: challenge.expected_label,
          options:        challenge.options,
          expires_at:     challenge.expires_at,
          challenge_sig:  challenge.challenge_sig,
          picked_url:     picked,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? 'Verification failed');
      onVerified({ ...data });
    } catch (err) {
      setError(err.message === 'wrong_answer' ? 'Wrong image — try again.' : err.message);
      loadChallenge();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadChallenge(); }, []);

  if (loading && !challenge) {
    return <p className="text-center text-soft py-8">Loading captcha…</p>;
  }

  if (error && !challenge) {
    return (
      <div className="text-center py-6">
        <p className="text-brandred mb-3">{error}</p>
        <button onClick={loadChallenge} className="btn-primary">Try again</button>
      </div>
    );
  }

  if (!challenge) return null;

  return (
    <div className="card p-4">
      <p className="font-semibold text-white mb-1">Tap the image showing a <span className="text-brandred">{challenge.expected_label}</span></p>
      <p className="text-xs text-soft mb-3">This confirms you're a real person.</p>

      {error && <p className="mb-3 text-sm text-brandred">{error}</p>}

      <div className="grid grid-cols-2 gap-2 mb-4">
        {challenge.options.map(url => (
          <button
            key={url}
            type="button"
            onClick={() => setPicked(url)}
            className={`relative rounded-lg overflow-hidden aspect-square border-2 transition-all ${
              picked === url ? 'border-brandred ring-2 ring-brandred/40' : 'border-transparent hover:border-brandred/30'
            }`}
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
            {picked === url && (
              <div className="absolute inset-0 bg-brandred/20 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-brandred" />
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={verify}
          disabled={!picked || loading}
          className="btn-primary flex-1 disabled:opacity-40"
        >
          {loading ? 'Checking…' : 'Confirm'}
        </button>
        <button type="button" onClick={loadChallenge} className="btn-ghost" title="New captcha">↺</button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PublicLeadSubmit() {
  const { token } = useParams();

  const [step, setStep]         = useState('captcha'); // captcha | form | done | error
  const [verifyData, setVerify] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError]   = useState(null);

  const [form, setForm] = useState({
    referrer_name: '', referrer_contact: '',
    business_name: '', contact_person: '', phone: '', email: '',
    interest_package: '', popia_consent: false,
  });

  const field = (k) => (e) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function onCaptchaVerified(data) {
    setVerify(data);
    setStep('form');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.referrer_name.trim())  { toast.error('Your name is required');            return; }
    if (!form.business_name.trim())  { toast.error('Business name is required');        return; }
    if (!form.phone.trim() && !form.email.trim()) { toast.error('Phone or email is required'); return; }
    if (!form.popia_consent)         { toast.error('POPIA consent is required');        return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/public-lead-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          token,
          verify_token:   verifyData.verify_token,
          verify_ts:      verifyData.verify_ts,
          verify_expires: verifyData.verify_expires,
          challenge_id:   verifyData.challenge_id,
          payload: {
            business_name:    form.business_name.trim(),
            contact_person:   form.contact_person.trim() || undefined,
            phone:            form.phone.trim() || undefined,
            email:            form.email.trim() || undefined,
            interest_package: form.interest_package || undefined,
            referrer_name:    form.referrer_name.trim(),
            referrer_contact: form.referrer_contact.trim() || undefined,
            popia_consent:    form.popia_consent,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (data?.error === 'do_not_contact_violation') {
          setPageError('This contact has opted out of being contacted and cannot be re-submitted.');
        } else if (data?.error === 'token_revoked') {
          setPageError('This referral link has been deactivated. Please contact Marketing iO for a new link.');
        } else if (data?.error === 'token_not_found') {
          setPageError('Invalid referral link. Please check the URL and try again.');
        } else if (data?.error === 'verify_token_expired') {
          toast.error('Your session expired — please complete the captcha again.');
          setStep('captcha');
        } else {
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        return;
      }
      setStep('done');
    } catch (err) {
      toast.error(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (pageError) {
    return (
      <div className="min-h-screen bg-darkbg-900 flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <AlertTriangle size={40} className="mx-auto mb-4 text-amber-400" />
          <h1 className="font-display text-xl text-white mb-2">Cannot submit</h1>
          <p className="text-soft text-sm">{pageError}</p>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-darkbg-900 flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
          <h1 className="font-display text-2xl text-gradient mb-2">Lead submitted!</h1>
          <p className="text-soft">Thank you. Our team will follow up with <strong className="text-white">{form.business_name}</strong> shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-darkbg-900 py-8 px-4">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl text-gradient mb-1">Refer a business</h1>
          <p className="text-soft text-sm">Know someone who needs Marketing iO? Fill in their details below.</p>
        </div>

        {step === 'captcha' && (
          <div className="space-y-4">
            <CaptchaChallenge onVerified={onCaptchaVerified} />
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-5">

            <section className="card p-4 space-y-3">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-soft">Your details</h2>
              <input required placeholder="Your name *" value={form.referrer_name} onChange={field('referrer_name')} className="input w-full" />
              <input placeholder="Your phone / WhatsApp" value={form.referrer_contact} onChange={field('referrer_contact')} className="input w-full" />
            </section>

            <section className="card p-4 space-y-3">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-soft">Business to refer</h2>
              <input required placeholder="Business name *" value={form.business_name} onChange={field('business_name')} className="input w-full" />
              <input placeholder="Contact person" value={form.contact_person} onChange={field('contact_person')} className="input w-full" />
              <input placeholder="Phone number" type="tel" value={form.phone} onChange={field('phone')} className="input w-full" />
              <input placeholder="Email address" type="email" value={form.email} onChange={field('email')} className="input w-full" />
            </section>

            <section className="card p-4">
              <PillPicker
                label="Package they might be interested in"
                options={PACKAGES}
                value={form.interest_package}
                onChange={v => setForm(f => ({ ...f, interest_package: v }))}
              />
            </section>

            <section className="card p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-brandred"
                  checked={form.popia_consent}
                  onChange={field('popia_consent')}
                />
                <span className="text-sm text-soft leading-relaxed">
                  <ShieldCheck size={14} className="inline text-emerald-400 mr-1" />
                  I confirm the business owner has consented to being contacted by Marketing iO,
                  and that I have the right to share their contact details.
                  I understand this is required under POPIA. *
                </span>
              </label>
            </section>

            <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base">
              {submitting ? 'Submitting…' : 'Submit referral'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
