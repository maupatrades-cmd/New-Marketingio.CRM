import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, RefreshCw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'not_sent',  label: 'Not Sent' },
  { key: 'awaiting',  label: 'Awaiting' },
  { key: 'returned',  label: 'Returned' },
  { key: 'overdue',   label: 'Overdue' },
];

export default function OnboardingForms() {
  const [tab, setTab] = useState('not_sent');
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ['onboarding-forms', tab],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_onboarding_forms_list', { p_filter: tab });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sendMut = useMutation({
    mutationFn: async (id) => {
      const { data, error } = await supabase.rpc('send_onboarding_form_link', { p_onboarding_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      toast.success(`Form link sent to ${res.emailed_to}`);
      qc.invalidateQueries({ queryKey: ['onboarding-forms'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-gradient">Onboarding Forms</h1>
        <p className="text-sm text-soft mt-1">Send and track client onboarding form links.</p>
      </div>

      <div className="flex gap-1 rounded-xl bg-darkbg-800 p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    tab === t.key ? 'bg-brandred text-white' : 'text-soft hover:text-white'
                  }`}>
            {t.label}
            {t.key === tab && rows.length > 0 && (
              <span className="ml-1 text-xs opacity-70">({rows.length})</span>
            )}
          </button>
        ))}
      </div>

      {listQ.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-soft" />
        </div>
      )}

      {listQ.isError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {listQ.error?.message || 'Failed to load'}
        </div>
      )}

      {!listQ.isLoading && rows.length === 0 && (
        <p className="text-center text-sm text-soft py-12">No items in this tab.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-darkbg-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border bg-darkbg-800/50 text-left text-xs uppercase tracking-wider text-soft">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Contract Signed</th>
                <th className="px-4 py-3">Form Sent</th>
                <th className="px-4 py-3">Form Returned</th>
                <th className="px-4 py-3">Days</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-darkbg-border/50 hover:bg-darkbg-800/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{r.client_name}</p>
                    {r.package && (
                      <span className="inline-block mt-0.5 rounded-full border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 text-[10px] text-blue-300 uppercase">
                        {r.package.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-soft">
                    {r.contract_signed_at
                      ? new Date(r.contract_signed_at).toLocaleDateString('en-ZA')
                      : <span className="text-amber-400">Not yet</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.form_link_sent_at ? (
                      <div>
                        <span className="text-emerald-400 text-xs">
                          <CheckCircle2 size={12} className="inline mr-1" />
                          {new Date(r.form_link_sent_at).toLocaleDateString('en-ZA')}
                        </span>
                        {r.form_link_sent_count > 1 && (
                          <span className="ml-1 text-[10px] text-soft">({r.form_link_sent_count}x)</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-amber-400 text-xs">Not sent</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.form_returned ? (
                      <span className="text-emerald-400 text-xs">
                        <CheckCircle2 size={12} className="inline mr-1" />
                        {r.form_returned_date ? new Date(r.form_returned_date).toLocaleDateString('en-ZA') : 'Yes'}
                      </span>
                    ) : (
                      <span className="text-rose-400 text-xs">
                        <Clock size={12} className="inline mr-1" />
                        Pending
                        {r.days_waiting > 0 && ` (${r.days_waiting}d)`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-soft">{r.days_waiting}d</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => sendMut.mutate(r.id)}
                      disabled={sendMut.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-darkbg-border bg-darkbg-800 px-3 py-1.5 text-xs text-soft transition hover:text-white hover:border-brandred">
                      {sendMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {r.form_link_sent_at ? 'Resend' : 'Send Form'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
