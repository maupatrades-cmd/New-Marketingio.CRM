import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { supabase, supabaseReady } from '../lib/supabase.js';
import Mascot from '../components/Mascot.jsx';
import ImageCaptcha from '../components/ImageCaptcha.jsx';

const LOGO_URL =
  'https://media.base44.com/images/public/69f52863b2b733d922d90b62/ce0ebdea2_marketing_io_main_logo-removebg-preview.png';

function useCaptcha() {
  return useMemo(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
  }, []);
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

export default function Login() {
  const navigate = useNavigate();
  const captcha = useCaptcha();

  // 'credentials' -> 'otp' -> 'image_verify' -> redirect
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
    // 1) Validate credentials with Supabase (no full session retained yet).
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) { setBusy(false); return toast.error(signInError.message); }

    // 2) Sign back out so the OTP stage acts as a true second factor.
    await supabase.auth.signOut();

    // 3) Send OTP email.
    try {
      await callOtp('send', email);
      sentAtRef.current = Date.now();
      toast.success('Code sent. Check your inbox.');
      setStage('otp');
    } catch (err) {
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
      // Code valid — restore the session by signing back in with the
      // original password.
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
    toast.success('Welcome back');
    navigate('/owner', { replace: true });
  }

  async function cancelVerification() {
    await supabase.auth.signOut();
    setStage('credentials');
    setOtp('');
    toast.message('Signed out. Try again when ready.');
  }

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
          {stage === 'credentials' && <>Welcome back<span className="text-brandred">|</span></>}
          {stage === 'otp'         && <>Verify your email<span className="text-brandred">|</span></>}
          {stage === 'image_verify'&& <>One more check<span className="text-brandred">|</span></>}
        </h1>

        <div className="relative mt-10 w-full">
          <div className="pointer-events-none relative z-20 -mb-[170px] flex justify-center sm:-mb-[210px]">
            <div className="mascot-rollin"><Mascot size={340} /></div>
          </div>

          {/* STAGE 1 — credentials + math captcha */}
          {stage === 'credentials' && (
            <form onSubmit={onCredentialsSubmit}
                  className="card-light relative z-10 w-full p-6 pt-32 sm:p-8 sm:pt-40">
              <h2 className="font-display mb-1 text-center text-3xl font-extrabold text-navy-ink">
                Welcome back<span className="text-brandred">|</span>
              </h2>
              <p className="mb-6 text-center text-sm text-navy-900/60">Sign in. Be seen.</p>

              <div className="mb-4">
                <label className="label-light">Email address</label>
                <input type="email" required autoComplete="email" className="input-light"
                       placeholder="you@example.com"
                       value={email} onChange={(e)=>setEmail(e.target.value)}/>
              </div>

              <div className="mb-2">
                <label className="label-light">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                         className="input-light pr-12" placeholder="Your password"
                         value={password} onChange={(e)=>setPassword(e.target.value)}/>
                  <button type="button" onClick={() => setShowPw(s => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-navy-900/60 hover:bg-navy-900/5"
                          aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? <EyeOff size={18}/> : <Eye size={18}/>}
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
                       value={captchaInput} onChange={(e)=>setCaptchaInput(e.target.value)}/>
              </div>

              <button disabled={busy} className="btn-navy">
                {busy ? 'Sending code…' : 'Sign In'}
              </button>

              <p className="mt-5 text-center text-sm text-navy-900/70">
                No account yet?{' '}
                <Link to="/signup" className="font-semibold text-brandred hover:underline">Create one</Link>
              </p>
            </form>
          )}

          {/* STAGE 2 — email OTP */}
          {stage === 'otp' && (
            <form onSubmit={onOtpSubmit}
                  className="card-light relative z-10 w-full p-6 pt-32 sm:p-8 sm:pt-40">
              <div className="mb-4 flex items-center justify-center gap-2 text-emerald-600">
                <ShieldCheck size={20}/>
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
                  value={otp} onChange={(e)=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                />
              </div>

              <button disabled={busy} className="btn-navy">
                {busy ? 'Verifying…' : <><KeyRound size={16}/> Verify code</>}
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
          )}

          {/* STAGE 3 — image captcha */}
          {stage === 'image_verify' && (
            <div className="relative z-10 space-y-4">
              <div className="card-light flex items-center gap-3 p-5 pt-28 sm:p-6 sm:pt-32">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <ShieldCheck size={18}/>
                </span>
                <div className="text-sm">
                  <p className="font-semibold text-navy-ink">Signed in as {email}</p>
                  <p className="text-navy-900/60">Complete the image check below to enter the dashboard.</p>
                </div>
              </div>
              <ImageCaptcha onVerified={onImageVerified} onCancel={cancelVerification}/>
            </div>
          )}
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
