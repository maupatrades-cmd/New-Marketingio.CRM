// QualifyLeadModal — owner/admin qualification surface.
//
// Reads warm criteria + qualification questions from system_settings (v1 keys,
// locked 2026-06-19). Calls qualify_lead RPC, which:
//   - verified           → status='verified', verified_by/date, warm_lead_criteria,
//                          lead_temperature, optional CPC R87 accrual via flag
//   - needs_clarification → status='pending_verification' (sic — RPC keeps it open),
//                          appends [needs_clarification] note to leads.notes
//   - rejected           → status='rejected', writes p_note to rejection_reason
//
// Validation mirrors the RPC's own guards (so the user sees the message inline
// before the round trip):
//   - rejected            → p_note required
//   - needs_clarification → p_note required
//   - temperature optional
//   - warm_lead_criteria  → free; RPC stores as jsonb verbatim. We tag a _schema
//                           key so future versions can be detected.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, HelpCircle, XCircle, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

const TEMPERATURE = [
  { v: 'cold', label: '❄️ Cold' },
  { v: 'warm', label: '🌤 Warm' },
  { v: 'hot',  label: '🔥 Hot' },
];

const DECISIONS = [
  { v: 'verified',            label: 'Verify',                icon: CheckCircle2, tone: 'ok'   },
  { v: 'needs_clarification', label: 'Needs clarification',   icon: HelpCircle,   tone: 'info' },
  { v: 'rejected',            label: 'Reject',                icon: XCircle,      tone: 'warn' },
];

const TONE = {
  ok:   'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  info: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  warn: 'border-brandred/40 bg-brandred/10 text-brandred',
};

export default function QualifyLeadModal({ lead, onClose, onQualified }) {
  const qc = useQueryClient();

  const [decision, setDecision]       = useState(null);
  const [temperature, setTemperature] = useState(lead?.lead_temperature ?? null);
  const [criteria, setCriteria]       = useState(() => {
    const existing = (lead?.warm_lead_criteria && typeof lead.warm_lead_criteria === 'object')
      ? lead.warm_lead_criteria : {};
    const { _schema, ...rest } = existing;
    return rest;
  });
  const [note, setNote] = useState('');

  // Locked v1 settings — same keys used at capture time.
  const criteriaQ = useQuery({
    queryKey: ['sys', 'lead.warm_criteria.v1'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'lead.warm_criteria.v1')
        .maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.value) ? data.value : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const questionsQ = useQuery({
    queryKey: ['sys', 'lead.qualification_questions.v1'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'lead.qualification_questions.v1')
        .maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.value) ? data.value : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const warmCriteria = criteriaQ.data ?? [];
  const questions    = questionsQ.data ?? [];

  const qualifyMutation = useMutation({
    mutationFn: async () => {
      const criteriaPayload = { _schema: 'lead.warm_criteria.v1', ...criteria };
      const { data, error } = await supabase.rpc('qualify_lead', {
        p_lead_id:          lead.id,
        p_decision:         decision,
        p_criteria_checked: criteriaPayload,
        p_temperature:      temperature,
        p_note:             note.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads_inbox'] });
      qc.invalidateQueries({ queryKey: ['owner_dashboard'] });
      const label = decision === 'verified' ? 'Verified' :
                    decision === 'rejected' ? 'Rejected' :
                    'Marked for clarification';
      toast.success(data?.r87_accrued ? `${label} · R87 accrued` : label);
      onQualified?.(data);
      onClose();
    },
    onError: (err) => {
      toast.error(err?.message || 'Could not qualify lead');
      console.error('[qualify_lead]', err);
    },
  });

  function handleConfirm() {
    if (!decision) { toast.error('Pick a decision'); return; }
    if ((decision === 'rejected' || decision === 'needs_clarification') && !note.trim()) {
      toast.error(decision === 'rejected'
        ? 'Rejection reason is required'
        : 'A clarification note is required');
      return;
    }
    qualifyMutation.mutate();
  }

  const toggleCriterion = (id) => setCriteria(c => ({ ...c, [id]: !c[id] }));
  const checkedCount = warmCriteria.filter(c => criteria[c.id]).length;

  const loadingSettings = criteriaQ.isLoading || questionsQ.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card relative w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6">
        <button
          type="button"
          onClick={onClose}
          disabled={qualifyMutation.isPending}
          className="absolute top-4 right-4 text-soft hover:text-white disabled:opacity-40"
        >
          <X size={18} />
        </button>

        <header className="mb-5 pr-8">
          <h2 className="font-display text-xl text-white">Qualify lead</h2>
          <p className="mt-1 text-sm text-soft truncate">
            {lead.business_name || '—'}
            {lead.contact_person && <span className="text-soft"> · {lead.contact_person}</span>}
          </p>
        </header>

        {loadingSettings && (
          <div className="flex items-center gap-2 text-soft text-sm">
            <Loader2 size={14} className="animate-spin"/> Loading qualification settings…
          </div>
        )}

        {!loadingSettings && (
          <div className="space-y-5">

            {/* Existing answers (read-only) */}
            {questions.length > 0 && lead.qualification_answers && (
              <section>
                <p className="mb-2 text-[10px] uppercase tracking-widest text-soft">Capturer's answers</p>
                <div className="rounded-lg border border-darkbg-border bg-darkbg-900/60 p-3 space-y-2 text-sm">
                  {questions.map(q => {
                    const ans = lead.qualification_answers?.[q.id];
                    if (!ans) return null;
                    return (
                      <div key={q.id}>
                        <p className="text-[11px] text-soft">{q.label}</p>
                        <p className="text-white">{String(ans)}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Warm criteria checklist */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-soft">Warm criteria</p>
                <p className="text-[11px] text-soft">{checkedCount}/{warmCriteria.length} met</p>
              </div>
              <ul className="space-y-1.5">
                {warmCriteria.map(c => (
                  <li key={c.id}>
                    <label className="flex items-start gap-2 cursor-pointer rounded-md border border-darkbg-border bg-darkbg-900/40 p-2 hover:border-brandred/40">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-brandred"
                        checked={!!criteria[c.id]}
                        onChange={() => toggleCriterion(c.id)}
                      />
                      <span className="text-sm text-white">{c.label || c.id}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            {/* Temperature */}
            <section>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-soft">Temperature</p>
              <div className="flex flex-wrap gap-2">
                {TEMPERATURE.map(t => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => setTemperature(temperature === t.v ? null : t.v)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      temperature === t.v
                        ? 'border-brandred bg-brandred/20 text-brandred font-semibold'
                        : 'border-darkbg-border bg-darkbg-900/60 text-soft hover:border-brandred/40'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Decision */}
            <section>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-soft">Decision</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {DECISIONS.map(d => {
                  const Icon = d.icon;
                  const active = decision === d.v;
                  return (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => setDecision(d.v)}
                      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        active
                          ? TONE[d.tone] + ' font-semibold'
                          : 'border-darkbg-border bg-darkbg-900/60 text-soft hover:border-brandred/40'
                      }`}
                    >
                      <Icon size={14} /> {d.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Note */}
            {decision && (
              <section>
                <p className="mb-2 text-[10px] uppercase tracking-widest text-soft">
                  {decision === 'rejected'
                    ? 'Rejection reason (required)'
                    : decision === 'needs_clarification'
                      ? 'Clarification note (required)'
                      : 'Note (optional)'}
                </p>
                <textarea
                  rows={3}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none"
                  placeholder={
                    decision === 'rejected' ? 'e.g. not a real business, can\'t be reached…' :
                    decision === 'needs_clarification' ? 'What needs clarifying?' :
                    'Any context for the audit log…'
                  }
                />
              </section>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={qualifyMutation.isPending}
                className="btn-ghost disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!decision || qualifyMutation.isPending}
                className="btn-primary disabled:opacity-40"
              >
                {qualifyMutation.isPending ? 'Saving…' : 'Confirm decision'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
