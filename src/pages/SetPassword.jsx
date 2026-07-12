import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

const LOGO_URL = 'https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/brand-assets/logo_email.png';

export default function SetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message.includes('session') || error.message.includes('Auth')
        ? 'This link has expired or was already used. Request a new one from the login page.'
        : error.message);
      setBusy(false);
    } else {
      setDone(true);
      toast.success('Password set! Redirecting to your portal…');
      setTimeout(() => navigate('/client', { replace: true }), 1800);
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-[#0B2143]">Password set!</h1>
          <p className="text-gray-500 mt-2">Taking you to your portal…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <img src={LOGO_URL} alt="Marketing iO" className="h-10 mx-auto mb-6 object-contain" />
      <h1 className="text-2xl font-bold text-[#0B2143] text-center">Create your password</h1>
      <p className="text-sm text-gray-500 text-center mt-2 mb-6">
        Set a password so you can sign in anytime without waiting for an email link.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">New password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                 placeholder="At least 8 characters" autoComplete="new-password"
                 className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-300 outline-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Confirm password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                 placeholder="Type it again" autoComplete="new-password"
                 className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-300 outline-none" />
        </div>
        <div className="space-y-1">
          <PasswordCheck label="At least 8 characters" met={password.length >= 8} />
          <PasswordCheck label="Contains a number" met={/\d/.test(password)} />
          <PasswordCheck label="Contains an uppercase letter" met={/[A-Z]/.test(password)} />
          <PasswordCheck label="Passwords match" met={password === confirm && password.length > 0} />
        </div>
        <button type="submit" disabled={busy || password.length < 8 || password !== confirm}
                className="w-full rounded-full bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Setting password…</> : 'Set my password'}
        </button>
      </form>
    </Shell>
  );
}

function PasswordCheck({ label, met }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Circle size={14} className="text-gray-300" />}
      <span className={met ? 'text-emerald-600' : 'text-gray-400'}>{label}</span>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full">{children}</div>
    </div>
  );
}
