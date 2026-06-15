import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase, supabaseReady } from '../lib/supabase.js';
import { Mascot } from '../components/Mascot.jsx';

export default function SignUp() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!supabaseReady) {
      toast.error('Supabase env vars not set on this deployment.');
      return;
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
    <div className="min-h-screen bg-aurora">
      {!supabaseReady && (
        <div className="bg-brandred px-4 py-2 text-center text-sm text-white">
          Supabase env vars missing — set them in Vercel, then redeploy.
        </div>
      )}
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
        <div className="flex flex-col items-center justify-center text-center lg:items-start lg:text-left">
          <Mascot size={240} />
          <h1 className="font-display mt-6 text-4xl font-bold">
            <span className="text-gradient">Create your account</span>
          </h1>
          <p className="mt-3 max-w-md text-soft">
            First sign-up wires up your profile. Owner role is granted via SQL once your email is confirmed.
          </p>
        </div>
        <form onSubmit={onSubmit} className="card p-8">
          <h2 className="font-display text-2xl">Sign up</h2>
          <div className="mb-4 mt-4">
            <label className="label">Full name</label>
            <input className="input" required value={fullName} onChange={e=>setFullName(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="label">Email</label>
            <input type="email" required autoComplete="email" className="input"
                   value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div className="mb-6">
            <label className="label">Password</label>
            <input type="password" required minLength={8} autoComplete="new-password" className="input"
                   value={password} onChange={e=>setPassword(e.target.value)} placeholder="min 8 chars" />
          </div>
          <button disabled={busy} className="btn-primary w-full">
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <p className="mt-4 text-center text-sm text-soft">
            Already signed up? <Link to="/login" className="font-semibold text-brandred hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
