import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LogOut, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import MascotGuide from '../../components/MascotGuide.jsx';

const TABS = [{ key: 'security', label: 'Security' }, { key: 'notifications', label: 'Notifications' }];
const PREF_ROWS = [
  { key: 'email_invoice_issued',    param: 'p_invoice',     label: 'Email me when an invoice is issued' },
  { key: 'email_deliverable_ready', param: 'p_deliverable', label: 'Email me when a deliverable is ready' },
  { key: 'email_monthly_report',    param: 'p_report',      label: 'Email me when a monthly report is available' },
  { key: 'email_payment_received',  param: 'p_payment',     label: 'Email me when a payment is received' },
];

export default function ClientSettings() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('security');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState('');

  const profQ = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) throw error;
      return data;
    },
  });
  const prefs = profQ.data?.preferences || {};

  const prefMut = useMutation({
    mutationFn: async ({ param, value }) => { const { error } = await supabase.rpc('update_my_notification_prefs', { [param]: value }); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-profile'] }),
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('request_account_deletion', { p_reason: reason || null }); if (error) throw error; },
    onSuccess: () => { toast.success('Request sent. Our team will be in touch.'); setConfirmDelete(false); setReason(''); },
    onError: (err) => toast.error(err.message),
  });

  const signOutEverywhere = async () => {
    try { await supabase.auth.signOut({ scope: 'global' }); } catch (_) {}
    try { await signOut(); } catch (_) {}
    navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === t.key ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-[#0B2143]'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'security' && (
        <div className="space-y-4">
          <section className="bg-white/85 backdrop-blur-xl rounded-2xl border border-white/80 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#0B2143] mb-1">Sessions</h2>
            <p className="text-xs text-gray-500 mb-3">Sign out of Marketing iO on all your devices.</p>
            <button onClick={signOutEverywhere} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white text-[#0B2143] px-4 py-2 text-sm hover:border-red-300 transition">
              <LogOut size={14} /> Sign out everywhere
            </button>
          </section>

          <section className="bg-white/85 backdrop-blur-xl rounded-2xl border border-red-200 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-red-600 mb-1 flex items-center gap-1"><ShieldAlert size={14} /> Danger Zone</h2>
            <p className="text-xs text-gray-500 mb-3">Request that your account be closed. Our team will confirm before anything is deleted.</p>
            <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-600 ring-1 ring-red-200 px-4 py-2 text-sm font-semibold hover:bg-red-100 transition">
              Request account deletion
            </button>
          </section>
        </div>
      )}

      {tab === 'notifications' && (
        <section className="bg-white/85 backdrop-blur-xl rounded-2xl border border-white/80 p-6 shadow-sm space-y-3">
          {profQ.isLoading ? (
            <div className="flex flex-col items-center justify-center py-4">
              <MascotGuide phase="thinking" size={72} message="Fetching your preferences..." position="inline" />
            </div>
          ) : PREF_ROWS.map(({ key, param, label }) => {
            const on = prefs[key] ?? true;
            return (
              <label key={key} className="flex items-center justify-between gap-3 py-1">
                <span className="text-sm text-[#0B2143]">{label}</span>
                <input type="checkbox" checked={on} onChange={e => prefMut.mutate({ param, value: e.target.checked })}
                       className="h-4 w-4 rounded border-gray-200 accent-red-500" />
              </label>
            );
          })}
        </section>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-bold text-red-600">Request account deletion</h3>
              <button onClick={() => setConfirmDelete(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">This sends a request to our team — nothing is deleted immediately. Tell us why (optional):</p>
            <textarea className="input-light min-h-[80px]" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason…" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
                      className="flex-1 inline-flex items-center justify-center gap-1 bg-red-500 text-white rounded-full py-2.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition">
                {deleteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Send request
              </button>
              <button onClick={() => setConfirmDelete(false)} className="rounded-full border border-gray-200 px-4 text-sm text-gray-500">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
