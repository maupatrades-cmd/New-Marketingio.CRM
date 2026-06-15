import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { supabase, supabaseReady } from '../lib/supabase.js';
import Mascot from '../components/Mascot.jsx';

const LOGO_URL = 'https://media.base44.com/images/public/69f52863b2b733d922d90b62/ce0ebdea2_marketing_io_main_logo-removebg-preview.png';

function useCaptcha() {
  return useMemo(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
  }, []);
}

export default function Login() {
  const navigate = useNavigate();
  const captcha = useCaptcha();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [captchaInput, setCaptchaInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (Number(captchaInput) !== captcha.answer) {
      return toast.error('Security check failed. Try again.');
    }
    if (!supabaseReady) {
      return toast.error('Supabase env vars not set on this deployment.');
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Welcome back');
    navigate('/owner', { replace: true });
  }

  return (
    <div className="min-h-screen bg-auth">
      {!supabaseReady && (
        <div className="bg-brandred px-4 py-2 text-center text-sm text-white">
          Supabase env vars missing — set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel, then redeploy.
        </div>
      )}

      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center px-6 pt-10 pb-16">
        {/* Real Marketing iO logo */}
        <img src={LOGO_URL} alt="Marketing iO" className="mb-2 h-16 w-auto object-contain" />

        {/* Tagline */}
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.35em] text-brandred">
          Too good to stay hidden
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold text-navy-ink">
          Welcome back<span className="text-brandred">|</span>
        </h1>

        {/* Mascot + speech bubble */}
        <div className="mt-6 flex items-center gap-4">
          <Mascot size={140} />
          <div className="speech-bubble text-sm">Sign in. Be seen.<span className="text-brandred">|</span></div>
        </div>

        {/* Form card */}
        <form onSubmit={onSubmit} className="card-light mt-6 w-full p-6 sm:p-8">
          <div className="mb-4">
            <label className="label-light">Email address</label>
            <input
              type="email" required autoComplete="email"
              className="input-light"
              placeholder="you@example.com"
              value={email} onChange={e=>setEmail(e.target.value)}
            />
          </div>

          <div className="mb-2">
            <label className="label-light">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                className="input-light pr-12"
                placeholder="Your password"
                value={password} onChange={e=>setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-navy-900/60 hover:bg-navy-900/5"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
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
            <input
              type="number" required inputMode="numeric"
              className="input-light"
              placeholder="Answer"
              value={captchaInput} onChange={e=>setCaptchaInput(e.target.value)}
            />
          </div>

          <button disabled={busy} className="btn-navy">
            {busy ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="mt-5 text-center text-sm text-navy-900/70">
            No account yet?{' '}
            <Link to="/signup" className="font-semibold text-brandred hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
