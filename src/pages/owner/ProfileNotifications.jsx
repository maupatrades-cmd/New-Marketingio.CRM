import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, ChevronLeft, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

const EMAIL_PREFS = [
  { key: 'email_invoice_issued',    label: 'Invoice issued',           desc: 'When a new invoice is created for your account.' },
  { key: 'email_deliverable_ready', label: 'Deliverable ready',        desc: 'When a deliverable is ready for your review.' },
  { key: 'email_monthly_report',    label: 'Monthly report available', desc: 'When your monthly performance report is published.' },
  { key: 'email_payment_received',  label: 'Payment received',         desc: 'When a payment is recorded against your account.' },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200
        ${checked ? 'border-brandred bg-brandred' : 'border-darkbg-border bg-darkbg-700'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 mt-0.5
          ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

export default function ProfileNotifications() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc  = useQueryClient();

  const [prefs, setPrefs]   = useState({
    email_invoice_issued:    true,
    email_deliverable_ready: true,
    email_monthly_report:    true,
    email_payment_received:  true,
  });
  const [dirty, setDirty]   = useState(false);
  const [saving, setSaving] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ['notif-prefs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    onSuccess: (data) => {
      if (data) {
        setPrefs({
          email_invoice_issued:    data.email_invoice_issued,
          email_deliverable_ready: data.email_deliverable_ready,
          email_monthly_report:    data.email_monthly_report,
          email_payment_received:  data.email_payment_received,
        });
      }
    },
    staleTime: 60_000,
  });

  function toggle(key) {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
    setDirty(true);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['notif-prefs', user.id] });
      toast.success('Notification preferences saved.');
      setDirty(false);
    } catch (e) {
      toast.error(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => nav('/owner/profile')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs font-semibold text-soft transition hover:border-brandred hover:text-white"
        >
          <ChevronLeft size={13} /> Profile
        </button>
        <div>
          <h1 className="font-display text-2xl">
            <span className="text-gradient">Notifications</span>
          </h1>
          <p className="mt-0.5 text-sm text-soft">Choose which events send you an email.</p>
        </div>
      </div>

      <div className="rounded-xl border border-darkbg-border bg-darkbg-800/60 p-6">
        <div className="mb-5 flex items-center gap-2">
          <Bell size={16} className="text-brandred" />
          <h2 className="font-display text-base font-semibold text-white">Email Notifications</h2>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-darkbg-700/40" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {EMAIL_PREFS.map(({ key, label, desc }) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-darkbg-border/40 bg-darkbg-900/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-xs text-soft">{desc}</p>
                </div>
                <Toggle checked={prefs[key]} onChange={() => toggle(key)} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-lg border border-darkbg-border/30 bg-darkbg-900/30 px-4 py-3">
          <p className="text-xs text-soft font-semibold">Coming soon</p>
          <p className="text-xs text-soft/60 mt-0.5">WhatsApp and SMS notifications will be available in a future update.</p>
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 shadow-xl"
          >
            <Save size={14} />
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      )}
    </div>
  );
}
