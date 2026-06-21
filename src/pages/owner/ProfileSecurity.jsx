import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Lock, Shield, Eye, EyeOff, LogOut, Trash2,
  CheckCircle, XCircle, AlertTriangle, ChevronLeft,
  HelpCircle, Clock, Monitor,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What city were you born in?",
  "What was the name of your primary school?",
  "What is the name of the street you grew up on?",
  "What was your childhood nickname?",
];

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, color = 'text-soft', children }) {
  return (
    <div className="rounded-xl border border-darkbg-border bg-darkbg-800/60 p-6">
      <div className="mb-5 flex items-center gap-2">
        <Icon size={16} className={color} />
        <h2 className="font-display text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function PasswordInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="input w-full pr-10"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-soft/50 hover:text-soft"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

function StrengthBar({ password }) {
  const score = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8)  s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-400'];
  if (!password) return null;
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[1,2,3,4,5].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? colors[score] : 'bg-darkbg-border'}`} />
        ))}
      </div>
      <p className={`mt-1 text-[11px] ${colors[score].replace('bg-','text-')}`}>{labels[score]}</p>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-display mb-4 text-lg text-white">{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ─── 2A: MFA ──────────────────────────────────────────────────────────────────

function MFASection() {
  const { user } = useAuth();
  const aal = user?.factors?.length > 0 ? 'aal2' : 'aal1';
  const enabled = aal === 'aal2';

  return (
    <Section icon={Shield} title="Two-Factor Authentication" color="text-green-400">
      <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        enabled
          ? 'bg-green-500/10 text-green-400 border border-green-500/30'
          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
      }`}>
        {enabled ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
        {enabled ? '2FA Enabled' : '2FA Not enabled'}
      </div>
      <p className="mb-4 text-xs text-soft">
        {enabled
          ? 'Your account is protected with an authenticator app. Supabase Auth manages your TOTP codes.'
          : 'Add an authenticator app to lock your account against stolen passwords.'}
      </p>
      <p className="text-xs text-soft/60">
        MFA enrollment is managed through your authentication session.
        Contact <a href="mailto:support@marketingio.co.za" className="text-brandred hover:underline">support@marketingio.co.za</a> to enable or disable 2FA.
      </p>
    </Section>
  );
}

// ─── 2B: Change password ──────────────────────────────────────────────────────

function ChangePasswordSection() {
  const { user } = useAuth();
  const [open, setOpen]       = useState(false);
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');

  function reset() {
    setCurrent(''); setNewPw(''); setConfirm(''); setErr('');
  }

  async function handleChange() {
    setErr('');
    if (!current || !newPw || !confirm) { setErr('All fields required.'); return; }
    if (newPw !== confirm) { setErr('New passwords do not match.'); return; }
    if (newPw.length < 8)  { setErr('Password must be at least 8 characters.'); return; }
    if (newPw === current)  { setErr('New password must differ from your current password.'); return; }

    setBusy(true);
    try {
      // 1. Verify current password
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signInErr) { setErr('Current password is incorrect.'); setBusy(false); return; }

      // 2. Check password history
      const { data: notReused, error: histErr } = await supabase.rpc('check_password_not_reused', {
        p_new_password: newPw,
      });
      if (histErr) throw histErr;
      if (!notReused) { setErr('This password was used recently. Choose a different one.'); setBusy(false); return; }

      // 3. Update password via Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw updateErr;

      // 4. Record in history
      await supabase.rpc('record_password_change', { p_new_password: newPw });

      toast.success('Password changed successfully.');
      setOpen(false);
      reset();
    } catch (e) {
      setErr(e.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section icon={Lock} title="Password" color="text-blue-400">
      <p className="mb-4 text-xs text-soft">
        Choose a strong password you haven't used in the last 5 changes.
      </p>
      <button onClick={() => { reset(); setOpen(true); }} className="btn-secondary text-sm">
        Change Password
      </button>

      {open && (
        <Modal title="Change Password" onClose={() => { setOpen(false); reset(); }}>
          <div className="space-y-3">
            <PasswordInput label="Current Password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Your current password" />
            <PasswordInput label="New Password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" />
            <StrengthBar password={newPw} />
            <PasswordInput label="Confirm New Password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Same as above" />
            {err && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <XCircle size={14} className="mt-0.5 flex-none text-red-400" />
                <p className="text-xs text-red-300">{err}</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setOpen(false); reset(); }} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleChange} disabled={busy} className="btn-primary flex-1">
                {busy ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Section>
  );
}

// ─── 2C: Security questions ───────────────────────────────────────────────────

function SecurityQuestionsSection() {
  const [status, setStatus] = useState(null);
  const [open, setOpen]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [form, setForm]     = useState({ q1:'', a1:'', q2:'', a2:'', q3:'', a3:'', q4:'', a4:'' });
  const [err, setErr]       = useState('');

  useEffect(() => {
    supabase.rpc('get_security_questions_status').then(({ data }) => {
      if (data && data[0]) setStatus(data[0]);
    });
  }, []);

  async function handleSave() {
    setErr('');
    if (!form.q1 || !form.a1 || !form.q2 || !form.a2 || !form.q3 || !form.a3 || !form.q4 || !form.a4) {
      setErr('All 4 questions and answers are required.'); return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('set_security_questions', {
        p_q1: form.q1, p_a1: form.a1,
        p_q2: form.q2, p_a2: form.a2,
        p_q3: form.q3, p_a3: form.a3,
        p_q4: form.q4, p_a4: form.a4,
      });
      if (error) throw error;
      toast.success('Security questions saved.');
      setOpen(false);
      setStatus({ questions_set: true, set_at: new Date().toISOString(), question_1: form.q1, question_2: form.q2, question_3: form.q3, question_4: form.q4 });
    } catch (e) {
      setErr(e.message || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  function setQ(n, v) { setForm(f => ({ ...f, [`q${n}`]: v })); }
  function setA(n, v) { setForm(f => ({ ...f, [`a${n}`]: v })); }

  return (
    <Section icon={HelpCircle} title="Security Questions" color="text-purple-400">
      {status?.questions_set ? (
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
            <CheckCircle size={12} /> 4 questions set
          </div>
          <p className="mt-1.5 text-xs text-soft">
            Last updated {new Date(status.set_at).toLocaleDateString('en-ZA')}
          </p>
          <div className="mt-3 space-y-1">
            {[1,2,3,4].map(n => (
              <p key={n} className="text-xs text-soft">• {status[`question_${n}`]}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-400">
          <AlertTriangle size={12} /> Not set — required for account recovery
        </div>
      )}
      <button onClick={() => { setErr(''); setOpen(true); }} className="btn-secondary text-sm">
        {status?.questions_set ? 'Update Questions' : 'Set Security Questions'}
      </button>

      {open && (
        <Modal title="Security Questions" onClose={() => setOpen(false)}>
          <p className="mb-4 text-xs text-soft">Choose 4 questions and provide memorable answers. Answers are case-insensitive.</p>
          <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
            {[1,2,3,4].map(n => (
              <div key={n} className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-soft">Question {n}</label>
                <select
                  value={form[`q${n}`]}
                  onChange={e => setQ(n, e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select a question…</option>
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
                <input
                  type="text"
                  value={form[`a${n}`]}
                  onChange={e => setA(n, e.target.value)}
                  placeholder="Your answer"
                  className="input w-full"
                />
              </div>
            ))}
          </div>
          {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button onClick={handleSave} disabled={busy} className="btn-primary flex-1">
              {busy ? 'Saving…' : 'Save Questions'}
            </button>
          </div>
        </Modal>
      )}
    </Section>
  );
}

// ─── 2D: Recent logins ────────────────────────────────────────────────────────

function RecentLoginsSection() {
  const { user } = useAuth();

  const { data: logins = [], isLoading } = useQuery({
    queryKey: ['recent-logins', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('action, after_data, created_at')
        .eq('table_name', 'auth_login')
        .eq('actor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    staleTime: 60_000,
  });

  return (
    <Section icon={Monitor} title="Recent Activity" color="text-blue-400">
      <p className="mb-3 text-xs text-soft">Your last 5 recorded login events.</p>
      {isLoading ? (
        <div className="h-20 animate-pulse rounded-lg bg-darkbg-700/40" />
      ) : logins.length === 0 ? (
        <p className="text-xs text-soft/60 italic">
          No logins recorded yet. Activity is logged after each sign-in.
        </p>
      ) : (
        <div className="space-y-1.5">
          {logins.map((l, i) => {
            const d = l.after_data || {};
            const success = l.action === 'login_success';
            return (
              <div key={i} className="flex items-center justify-between rounded-lg border border-darkbg-border/40 bg-darkbg-900/40 px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-white">
                    {new Date(l.created_at).toLocaleString('en-ZA')}
                  </p>
                  {d.ip && <p className="text-[11px] text-soft">IP: {d.ip}</p>}
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  success
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-red-500/15 text-red-400'
                }`}>
                  {success ? <CheckCircle size={10} /> : <XCircle size={10} />}
                  {success ? 'Success' : (d.failure_reason || 'Failed')}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-soft/50">
        Activity is recorded on each sign-in. Your current session was started when you last logged in.
      </p>
    </Section>
  );
}

// ─── 2E: Sign out everywhere ──────────────────────────────────────────────────

function SignOutEverywhereSection() {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleGlobalSignOut() {
    setBusy(true);
    try {
      await supabase.auth.signOut({ scope: 'global' });
      toast.success('Signed out from all devices.');
      nav('/login', { replace: true });
    } catch (e) {
      toast.error(e.message || 'Sign-out failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section icon={LogOut} title="Sign Out Everywhere" color="text-orange-400">
      <p className="mb-4 text-xs text-soft">
        Lost your phone or suspect someone else has access to your account?
        This signs you out of all devices, apps, and active sessions immediately.
      </p>
      <button onClick={() => setOpen(true)} className="btn-secondary text-sm">
        Sign out of all devices
      </button>

      {open && (
        <Modal title="Sign out everywhere?" onClose={() => setOpen(false)}>
          <p className="mb-5 text-sm text-soft">
            You will be signed out from every device and session. You'll need to log back in on this device too.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button onClick={handleGlobalSignOut} disabled={busy} className="btn-danger flex-1">
              {busy ? 'Signing out…' : 'Yes, sign out everywhere'}
            </button>
          </div>
        </Modal>
      )}
    </Section>
  );
}

// ─── Danger zone: Delete account ──────────────────────────────────────────────

function DangerZoneSection() {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen]     = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);

  async function handleDelete() {
    if (confirm !== 'DELETE') return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('request_account_deletion');
      if (error) throw error;
      setDone(true);
      // Sign out after scheduling
      setTimeout(async () => {
        await signOut();
        nav('/login', { replace: true });
      }, 4000);
    } catch (e) {
      toast.error(e.message || 'Failed to submit deletion request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
      <div className="mb-3 flex items-center gap-2">
        <Trash2 size={16} className="text-red-400" />
        <h2 className="font-display text-base font-semibold text-red-300">Danger Zone</h2>
      </div>
      <p className="mb-4 text-xs text-soft">
        Requesting deletion starts a 14-day cooling-off period. You'll receive a cancellation link by email.
        After 14 days your personal data is anonymised. Financial records are retained for 5 years (SARS).
      </p>
      <button onClick={() => { setConfirm(''); setOpen(true); }} className="btn-danger text-sm">
        Request account deletion
      </button>

      {open && !done && (
        <Modal title="Request account deletion" onClose={() => setOpen(false)}>
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-xs text-red-300">
              This will schedule your account for deletion in <strong>14 days</strong>.
              A cancellation email will be sent to your registered address.
              Your personal data will be anonymised but financial records are kept.
            </p>
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-soft">
              Type DELETE to confirm
            </label>
            <input
              type="text"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="DELETE"
              className="input w-full"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={confirm !== 'DELETE' || busy}
              className="btn-danger flex-1"
            >
              {busy ? 'Submitting…' : 'Confirm deletion request'}
            </button>
          </div>
        </Modal>
      )}

      {open && done && (
        <Modal title="Deletion request submitted" onClose={() => {}}>
          <div className="text-center py-4">
            <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
            <p className="text-sm text-white mb-2">Request submitted successfully.</p>
            <p className="text-xs text-soft">
              Check your email for a cancellation link. You are being signed out now…
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfileSecurity() {
  const nav = useNavigate();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => nav('/owner/profile')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs font-semibold text-soft transition hover:border-brandred hover:text-white"
        >
          <ChevronLeft size={13} /> Profile
        </button>
        <div>
          <h1 className="font-display text-2xl">
            <span className="text-gradient">Password & Security</span>
          </h1>
          <p className="mt-0.5 text-sm text-soft">Manage how you protect your account.</p>
        </div>
      </div>

      <MFASection />
      <ChangePasswordSection />
      <SecurityQuestionsSection />
      <RecentLoginsSection />
      <SignOutEverywhereSection />
      <DangerZoneSection />
    </div>
  );
}
