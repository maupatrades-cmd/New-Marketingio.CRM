import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { supabase, supabaseReady } from '../lib/supabase.js';
import Mascot from '../components/Mascot.jsx';
import Wordmark from '../components/Wordmark.jsx';

export default function SignUp() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!supabaseReady) {
      return toast.error('Supabase env vars not set on this deployment.');
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Account created. Check your inbox to confirm.');
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-auth">
      {!supabaseReady && (
        <div className="bg-brandred px-4 py-2 text-center text-sm text-white">
          Supabase env vars missing — set them in Vercel, then redeploy.
        </div>
      )}

      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center px-6 pt-10 pb-16">
        <div className="mb-3"><Wordmark size="lg"/></div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-navy-900/60">
          The CRM to stay seen
        </p>

        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.35em] text-brandred">
          Built for closers
        </p>
        <h1 className="font-display mt-3 text-4xl font-extrabold text-navy-ink">
          Create your account<span className="text-brandred">|</span>
        </h1>

        <div className="mt-6 flex items-center gap-4">
          <Mascot size={140} />
          <div className="speech-bubble text-sm">Hi. Let's get you set up.</div>
        </div>

        <form onSubmit={onSubmit} className="card-light mt-6 w-full p-6 sm:p-8">
          <div className="mb-4">
            <label className="label-light">Full name</label>
            <input className="input-light" required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Lekgoro Maupa"/>
          </div>
          <div className="mb-4">
            <label className="label-light">Email address</label>
            <input type="email" required autoComplete="email" className="input-light"
                   value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
          </div>
          <div className="mb-6">
            <label className="label-light">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
                className="input-light pr-12"
                placeholder="At least 8 characters"
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
          <button disabled={busy} className="btn-navy">
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <p className="mt-5 text-center text-sm text-navy-900/70">
            Already signed up?{' '}
            <Link to="/login" className="font-semibold text-brandred hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
