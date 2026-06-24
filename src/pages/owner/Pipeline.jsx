import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, X, History } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

// Stage display order + labels. Closed_won/closed_lost collapse into one column.
const STAGES = [
  { key: 'new_lead',      label: 'New Lead' },
  { key: 'contacted',     label: 'Contacted' },
  { key: 'qualified',     label: 'Qualified' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'negotiation',   label: 'Negotiation' },
  { key: 'closed',        label: 'Closed' },
];

// Allowed forward transitions — mirrors the advance_deal_stage guard.
const TRANSITIONS = {
  new_lead:        ['contacted', 'qualified', 'closed_lost'],
  discovery_visit: ['contacted', 'qualified', 'closed_lost'],
  contacted:       ['qualified', 'closed_lost'],
  qualified:       ['proposal_sent', 'closed_lost'],
  proposal_sent:   ['negotiation', 'qualified', 'closed_lost'],
  negotiation:     ['closed_won', 'closed_lost'],
};

const STAGE_LABEL = {
  new_lead: 'New Lead', discovery_visit: 'Discovery Visit', contacted: 'Contacted',
  qualified: 'Qualified', proposal_sent: 'Proposal Sent', negotiation: 'Negotiation',
  closed_won: 'Closed Won', closed_lost: 'Closed Lost',
};

function columnFor(stage) {
  if (stage === 'closed_won' || stage === 'closed_lost') return 'closed';
  if (stage === 'discovery_visit') return 'new_lead';
  return stage;
}

const money = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA');

function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function Pipeline() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);

  const { data: deals, isLoading } = useQuery({
    queryKey: ['pipeline-deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, client_name, package, deal_type, stage, setup_fee, monthly_retainer, closer_name, closer_id, updated_at, created_at, lost_reason')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const columns = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.key, []]));
    for (const d of deals ?? []) {
      const col = columnFor(d.stage);
      (map[col] || map.closed).push(d);
    }
    return map;
  }, [deals]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-soft">Sales</p>
        <h1 className="font-display text-3xl text-gradient">Pipeline</h1>
        <p className="mt-1 text-sm text-soft">Drag deals forward through the funnel — each advance fires a task and notifies the closer.</p>
      </header>

      {isLoading ? (
        <div className="grid place-items-center py-20"><Loader2 size={28} className="animate-spin text-soft" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((s) => (
            <div key={s.key} className="rounded-2xl border border-darkbg-border bg-darkbg-800/40 p-2">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-soft">
                {s.label} <span className="text-soft/60">({columns[s.key]?.length || 0})</span>
              </p>
              <div className="space-y-2">
                {(columns[s.key] || []).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelected(d)}
                    className="w-full rounded-xl border border-darkbg-border bg-darkbg-900/60 p-3 text-left transition hover:border-brandred/50"
                  >
                    <p className="truncate text-sm font-semibold text-white">{d.client_name || 'Untitled'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-soft">{d.package || d.deal_type}</p>
                    <p className="mt-1.5 text-xs text-brandred">{money(d.setup_fee || d.monthly_retainer)}</p>
                    <p className="mt-1 text-[10px] text-soft">{daysSince(d.updated_at)}d in stage · {d.closer_name || '—'}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DealDrawer deal={selected} onClose={() => setSelected(null)} onChanged={() => { refresh(); setSelected(null); }} />
      )}
    </div>
  );
}

function DealDrawer({ deal, onClose, onChanged }) {
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // 'lost' | 'reopen'
  const [reason, setReason] = useState('');
  const [reopenStage, setReopenStage] = useState('negotiation');

  const allowed = (TRANSITIONS[deal.stage] || []).filter((s) => s !== 'closed_lost');
  const isClosedLost = deal.stage === 'closed_lost';

  const { data: history } = useQuery({
    queryKey: ['deal-history', deal.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('*')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function onAdvance() {
    if (!target) { toast.error('Pick a stage'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('advance_deal_stage', {
      p_deal_id: deal.id, p_new_stage: target, p_notes: notes || null,
    });
    setBusy(false);
    if (error) {
      const m = error.message || '';
      if (m.includes('permission_denied')) toast.error('Closer or manager only');
      else if (m.includes('invalid_stage_transition')) toast.error('That move isn’t allowed');
      else toast.error(m);
      return;
    }
    toast.success('Deal advanced — task created');
    onChanged();
  }

  async function onMarkLost() {
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('mark_deal_lost', { p_deal_id: deal.id, p_reason: reason, p_notes: notes || null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal marked lost — review task created');
    onChanged();
  }

  async function onReopen() {
    setBusy(true);
    const { error } = await supabase.rpc('reopen_deal', { p_deal_id: deal.id, p_target_stage: reopenStage });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal reopened');
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-darkbg-border bg-darkbg-800 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-white">{deal.client_name}</h2>
            <p className="mt-1 text-sm text-soft">{deal.package || deal.deal_type} · {money(deal.setup_fee || deal.monthly_retainer)}</p>
          </div>
          <button onClick={onClose} className="text-soft hover:text-white"><X size={18} /></button>
        </div>

        <div className="mt-4 inline-flex items-center rounded-full border border-darkbg-border bg-darkbg-900/60 px-3 py-1 text-xs uppercase tracking-wide text-white">
          {STAGE_LABEL[deal.stage] || deal.stage}
        </div>

        {/* Advance */}
        {!mode && allowed.length > 0 && (
          <div className="mt-6 space-y-3 rounded-xl border border-darkbg-border bg-darkbg-900/40 p-4">
            <label className="block text-sm text-soft">Advance to:
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white">
                <option value="">Select stage…</option>
                {allowed.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="block text-sm text-soft">Notes (optional)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white" />
            </label>
            <button onClick={onAdvance} disabled={busy} className="btn-primary w-full disabled:opacity-40">Advance</button>
          </div>
        )}

        {/* Lost / Reopen triggers */}
        <div className="mt-3 flex gap-2">
          {!isClosedLost && deal.stage !== 'closed_won' && mode !== 'lost' && (
            <button onClick={() => setMode('lost')} className="flex-1 rounded-full border border-brandred/40 bg-brandred/10 px-3 py-2 text-xs font-semibold text-brandred transition hover:bg-brandred/20">Mark Lost</button>
          )}
          {isClosedLost && mode !== 'reopen' && (
            <button onClick={() => setMode('reopen')} className="flex-1 rounded-full border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-xs font-semibold text-soft transition hover:text-white">Reopen</button>
          )}
        </div>

        {mode === 'lost' && (
          <div className="mt-3 space-y-3 rounded-xl border border-brandred/30 bg-brandred/5 p-4">
            <label className="block text-sm text-soft">Reason (required)
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white" />
            </label>
            <label className="block text-sm text-soft">Notes (optional)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white" />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setMode(null)} className="flex-1 rounded-full border border-darkbg-border px-3 py-2 text-xs text-soft">Cancel</button>
              <button onClick={onMarkLost} disabled={busy} className="flex-1 rounded-full bg-brandred px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Confirm lost</button>
            </div>
          </div>
        )}

        {mode === 'reopen' && (
          <div className="mt-3 space-y-3 rounded-xl border border-darkbg-border bg-darkbg-900/40 p-4">
            <label className="block text-sm text-soft">Reopen to stage
              <select value={reopenStage} onChange={(e) => setReopenStage(e.target.value)} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white">
                {['contacted', 'qualified', 'proposal_sent', 'negotiation'].map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </label>
            <div className="flex gap-2">
              <button onClick={() => setMode(null)} className="flex-1 rounded-full border border-darkbg-border px-3 py-2 text-xs text-soft">Cancel</button>
              <button onClick={onReopen} disabled={busy} className="flex-1 rounded-full bg-brandred px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Reopen</button>
            </div>
          </div>
        )}

        {/* Stage history */}
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-soft">
            <History size={14} /> Stage history
          </h3>
          {(history ?? []).length === 0 ? (
            <p className="text-sm text-soft">No transitions yet.</p>
          ) : (
            <ul className="space-y-3">
              {(history ?? []).map((h) => (
                <li key={h.id} className="rounded-lg border border-darkbg-border bg-darkbg-900/40 p-3 text-sm">
                  <p className="text-white">{STAGE_LABEL[h.from_stage] || h.from_stage || '—'} → {STAGE_LABEL[h.to_stage] || h.to_stage}</p>
                  <p className="mt-1 text-[11px] text-soft">
                    {new Date(h.created_at).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {h.changed_by_role ? ` · ${h.changed_by_role}` : ''}
                  </p>
                  {h.notes && <p className="mt-1 text-soft">{h.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
