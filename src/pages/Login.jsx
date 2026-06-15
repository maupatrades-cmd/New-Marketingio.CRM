import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase, supabaseReady } from '../lib/supabase.js';
import { Mascot } from '../components/Mascot.jsx';

export default function Login() {
  const navigate = useNavigate();
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Welcome back');
    navigate('/owner', { replace: true });
  }

  return (
    <div className="min-h-screen bg-aurora">
      {!supabaseReady && (
        <div className="bg-brandred px-4 py-2 text-center text-sm text-white">
          Supabase env vars missing — set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel, then redeploy.
        </div>
      )}
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
        <div className="flex flex-col items-center justify-center text-center lg:items-start lg:text-left">
          <Mascot size={240} />
          <h1 className="font-display mt-6 text-4xl font-bold">
            <span className="text-gradient">Marketing iO</span>
            <span className="text-white"> CRM</span>
          </h1>
          <p className="mt-3 max-w-md text-soft">
            The operational system for the agency. Sales, contracts, invoices,
            delivery, payroll — one console for the whole revenue motion.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card p-8">
          <h2 className="font-display text-2xl">Sign in</h2>
          <p className="mb-6 text-sm text-soft">Use the email registered with your owner or staff account.</p>
          <div className="mb-4">
            <label className="label">Email</label>
            <input type="email" required autoComplete="email" className="input"
                   value={email} onChange={e=>setEmail(e.target.value)}
                   placeholder="you@marketingio.co.za" />
          </div>
          <div className="mb-6">
            <label className="label">Password</label>
            <input type="password" required autoComplete="current-password" className="input"
                   value={password} onChange={e=>setPassword(e.target.value)}
                   placeholder="••••••••" />
          </div>
          <button disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="mt-4 text-center text-sm text-soft">
            No account yet? <Link to="/signup" className="font-semibold text-brandred hover:underline">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
