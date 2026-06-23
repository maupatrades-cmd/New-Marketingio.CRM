import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck, KeyRound, Mail, CheckCircle2 } from 'lucide-react';
import { supabase, supabaseReady } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import Mascot from '../components/Mascot.jsx';
import ImageCaptcha from '../components/ImageCaptcha.jsx';

const LOGO_URL =
  'https://media.base44.com/images/public/69f52863b2b733d922d90b62/ce0ebdea2_marketing_io_main_logo-removebg-preview.png';

function useCaptcha(seed) {
  return useMemo(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);
}

async function callOtp(action, email, code) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-otp`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, email, code }),
  });
  let json = null;
  try { json = await res.json(); } catch { /* keep null */ }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `OTP ${action} failed (${res.status})`);
  }
  return json;
}

async function sendClientMagicLink(email, redirectTo) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-client-login-link`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, redirect_to: redirectTo }),
  });
  // Server returns ok:true regardless to avoid email enumeration; we
  // only care about transport failure here.
  if (!res.ok) throw new Error(`Network error (${res.status})`);
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const fromPath = (location.state && typeof location.state.from === 'string' && location.state.from) || null;

  // The staff OTP flow deliberately signs in to verify the password,
  // signs back out, then sends an OTP. During that dance `user` flips
  // truthy briefly — without this gate, the auto-navigate below would
  // teleport the user off the page before they ever see the OTP form.
  // The flag is held in a ref so flipping it doesn't trigger a render.
  const staffFlowActiveRef = useRef(false);
  // Toggled to true when the staff image-captcha step completes, so the
  // useEffect below re-fires even though the ref itself isn't a dep.
  const [staffFlowDone, setStaffFlowDone] = useState(false);

  // If the user is already signed in and we got here via the magic-link
  // redirect, bounce them straight to where they were going.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (staffFlowActiveRef.current) return;
    navigate(fromPath || '/owner', { replace: true });
  }, [user, authLoading, fromPath, navigate, staffFlowDone]);

  // Default tab: 'client' if we got bounced from a /client/* or /welcome
  // route, else 'staff'. The client tab is also the default for cold
  // logins because that's the bigger volume of users.
  const initialTab = fromPath && (fromPath.startsWith('/client') || fromPath.startsWith('/welcome'))
    ? 'client' : 'client';
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="min-h-screen bg-auth">
      {!supabaseReady && (
        <div className="bg-brandred px-4 py-2 text-center text-sm text-white">
          Supabase env vars missing — set them in Vercel, then redeploy.
        </div>
      )}

      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center px-6 pt-8 pb-16">
        <img src={LOGO_URL} alt="Marketing iO"
             className="mb-2 h-24 w-auto max-w-[420px] object-contain sm:h-28"/>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.35em] text-brandred">
          Too good to stay hidden
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold text-navy-ink">
          Welcome back<span className="text-brandred">|</span>
        </h1>

        <div className="relative mt-10 w-full">
          <div className="pointer-events-none relative z-20 -mb-[170px] flex justify-center sm:-mb-[210px]">
            <div className="mascot-rollin"><Mascot size={340} /></div>
          </div>

          <div className="card-light relative z-10 w-full p-6 pt-32 sm:p-8 sm:pt-40">
            <TabSwitch tab={tab} setTab={setTab} />
            {tab === 'client'
              ? <ClientMagicLinkPanel fromPath={fromPath} />
              : <StaffPasswordPanel staffFlowActiveRef={staffFlowActiveRef} onFlowDone={() => setStaffFlowDone(true)} />}
          </div>
        </div>

        <p className="mt-8 flex items-center justify-center gap-4 text-xs text-navy-900/60">
          <Link to="/terms" className="hover:text-navy-ink hover:underline">Terms &amp; Conditions</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy" className="hover:text-navy-ink hover:underline">Privacy Policy</Link>
        </p>
        <p className="mt-2 text-center text-[11px] text-navy-900/50">
          © {new Date().getFullYear()} Marketing iO (Pty) Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function TabSwitch({ tab, setTab }) {
  return (
    <div className="mb-6 grid grid-cols-2 rounded-full bg-navy-900/5 p-1 text-sm font-semibold">
      <button
        type="button"
        onClick={() => setTab('client')}
        className={`rounded-full px-3 py-2 transition ${tab === 'client' ? 'bg-white text-navy-ink shadow' : 'text-navy-900/60 hover:text-navy-ink'}`}
      >
        I'm a client
      </button>
      <button
        type="button"
        onClick={() => setTab('staff')}
        className={`rounded-full px-3 py-2 transition ${tab === 'staff' ? 'bg-white text-navy-ink shadow' : 'text-navy-900/60 hover:text-navy-ink'}`}
      >
        Owner / Staff
      </button>
    </div>
  );
}

// ─── CLIENT — magic link only ─────────────────────────────────────────────
function ClientMagicLinkPanel({ fromPath }) {
  const [captchaSeed, setCaptchaSeed] = useState(0);
  const captcha = useCaptcha(captchaSeed);
  const [email, setEmail] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    if (Number(captchaInput) !== captcha.answer) {
      setCaptchaSeed(s => s + 1);
      setCaptchaInput('');
      return toast.error('Security check failed. Try again.');
    }
    if (!supabaseReady) return toast.error('Supabase env vars not set on this deployment.');
    setBusy(true);
    try {
      await sendClientMagicLink(email.trim(), fromPath);
      setSentTo(email.trim());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <Mail size={26} />
        </div>
        <h2 className="font-display mb-1 text-2xl font-extrabold text-navy-ink">Check your inbox</h2>
        <p className="mx-auto mb-4 max-w-sm text-sm text-navy-900/60">
          If <strong className="text-navy-ink">{sentTo}</strong> is a client account, we've sent a sign-in link.
          It expires in <strong>1 hour</strong>.
        </p>
        <p className="mx-auto mb-6 max-w-sm text-xs text-navy-900/50">
          Tap the link on this device to land back where you were going.
          Didn't get it? Check spam, then try again.
        </p>
        <button
          type="button"
          onClick={() => { setSentTo(null); setEmail(''); setCaptchaInput(''); setCaptchaSeed(s => s + 1); }}
          className="text-sm font-semibold text-brandred hover:underline"
        >
          Send to a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="font-display mb-1 text-center text-2xl font-extrabold text-navy-ink">
        Sign in — no password needed
      </h2>
      <p className="mb-6 text-center text-sm text-navy-900/60">
        We'll email you a one-tap sign-in link.
      </p>

      <div className="mb-4">
        <label className="label-light">Your email</label>
        <input
          type="email" required autoComplete="email" className="input-light"
          placeholder="you@yourbusiness.co.za"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-5">
        <label className="label-light">Security check: {captcha.a} + {captcha.b} = ?</label>
        <input
          type="number" required inputMode="numeric" className="input-light"
          placeholder="Answer"
          value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)}
        />
      </div>

      <button disabled={busy} className="btn-navy">
        {busy ? 'Sending link…' : <><Mail size={16} /> Email me a sign-in link</>}
      </button>

      <p className="mt-5 text-center text-xs text-navy-900/55">
        Staff or owner? Switch tabs above.
      </p>
    </form>
  );
}

// ─── OWNER / STAFF — existing password + OTP + image captcha flow ─────────
function StaffPasswordPanel({ staffFlowActiveRef, onFlowDone }) {
  const navigate = useNavigate();
  const captcha = useCaptcha(0);
  const [stage, setStage] = useState('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [captchaInput, setCaptchaInput] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const sentAtRef = useRef(0);

  async function onCredentialsSubmit(e) {
    e.preventDefault();
    if (Number(captchaInput) !== captcha.answer) return toast.error('Security check failed. Try again.');
    if (!supabaseReady) return toast.error('Supabase env vars not set on this deployment.');

    setBusy(true);
    // Lock the parent's auto-navigate effect BEFORE signInWithPassword
    // sets a session — without this, the user state flicker fires the
    // /owner redirect and you never reach the OTP screen.
    staffFlowActiveRef.current = true;
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      staffFlowActiveRef.current = false;
      setBusy(false);
      return toast.error(signInError.message);
    }
    await supabase.auth.signOut();

    try {
      await callOtp('send', email);
      sentAtRef.current = Date.now();
      toast.success('Code sent. Check your inbox.');
      setStage('otp');
    } catch (err) {
      staffFlowActiveRef.current = false;
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onOtpSubmit(e) {
    e.preventDefault();
    if (otp.trim().length < 6) return toast.error('Enter the 6-digit code.');
    setBusy(true);
    try {
      await callOtp('verify', email, otp.trim());
      // Re-sign-in for the real session. The flag is still set, so the
      // parent's auto-navigate won't fire mid-flow.
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Code verified — quick human check.');
      setStage('image_verify');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (Date.now() - sentAtRef.current < 20_000) {
      return toast.message('Hang on — codes can only be re-sent every 20s.');
    }
    setBusy(true);
    try {
      await callOtp('send', email);
      sentAtRef.current = Date.now();
      toast.success('New code sent.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onImageVerified(ok) {
    if (!ok) return;
    // Release the guard flag, then signal the parent via state so the
    // useEffect re-fires with fresh React state (refs don't trigger effects).
    staffFlowActiveRef.current = false;
    supabase.rpc('log_login_attempt', { p_success: true }).catch(() => {});
    toast.success('Welcome back');
    onFlowDone();
  }

  async function cancelVerification() {
    staffFlowActiveRef.current = false;
    await supabase.auth.signOut();
    setStage('credentials');
    setOtp('');
    toast.message('Signed out. Try again when ready.');
  }

  if (stage === 'credentials') {
    return (
      <form onSubmit={onCredentialsSubmit}>
        <h2 className="font-display mb-1 text-center text-2xl font-extrabold text-navy-ink">Sign in</h2>
        <p className="mb-6 text-center text-sm text-navy-900/60">Owner / staff password access.</p>

        <div className="mb-4">
          <label className="label-light">Email address</label>
          <input type="email" required autoComplete="email" className="input-light"
                 placeholder="you@example.com"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="mb-2">
          <label className="label-light">Password</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                   className="input-light pr-12" placeholder="Your password"
                   value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-navy-900/60 hover:bg-navy-900/5"
                    aria-label={showPw ? 'Hide password' : 'Show password'}>
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="mb-5 text-right">
          <Link to="/forgot" className="text-sm font-semibold text-brandred hover:underline">
            Forgot password?
          </Link>
        </div>

        <div className="mb-5">
          <label className="label-light">Security check: {captcha.a} + {captcha.b} = ?</label>
          <input type="number" required inputMode="numeric" className="input-light"
                 placeholder="Answer"
                 value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} />
        </div>

        <button disabled={busy} className="btn-navy">
          {busy ? 'Sending code…' : 'Sign In'}
        </button>

        <p className="mt-5 text-center text-sm text-navy-900/70">
          No account yet?{' '}
          <Link to="/signup" className="font-semibold text-brandred hover:underline">Create one</Link>
        </p>
      </form>
    );
  }

  if (stage === 'otp') {
    return (
      <form onSubmit={onOtpSubmit}>
        <div className="mb-4 flex items-center justify-center gap-2 text-emerald-600">
          <ShieldCheck size={20} />
          <p className="text-sm font-semibold">Credentials accepted</p>
        </div>
        <h2 className="font-display mb-1 text-center text-2xl font-extrabold text-navy-ink">
          Check your email
        </h2>
        <p className="mb-6 text-center text-sm text-navy-900/60">
          We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
        </p>

        <div className="mb-5">
          <label className="label-light">Verification code</label>
          <input
            type="text" inputMode="numeric" pattern="\d{6}" maxLength={6}
            autoComplete="one-time-code" autoFocus required
            className="input-light text-center font-mono text-2xl tracking-[0.5em]"
            placeholder="••••••"
            value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>

        <button disabled={busy} className="btn-navy">
          {busy ? 'Verifying…' : <><KeyRound size={16} /> Verify code</>}
        </button>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button type="button" onClick={cancelVerification}
                  className="text-navy-900/60 hover:text-navy-ink">
            ← Back
          </button>
          <button type="button" onClick={resendCode} disabled={busy}
                  className="font-semibold text-brandred hover:underline">
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={18} />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-navy-ink">Signed in as {email}</p>
          <p className="text-navy-900/60">Complete the image check below to enter the dashboard.</p>
        </div>
      </div>
      <ImageCaptcha onVerified={onImageVerified} onCancel={cancelVerification} />
    </div>
  );
}
