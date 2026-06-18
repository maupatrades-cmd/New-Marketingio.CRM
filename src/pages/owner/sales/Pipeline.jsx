// Slice 2.2 — Sales Opportunities kanban.
// 4-column pre-close pipeline. Closing happens in the Log Sale form (the
// only path that calls close_sale()) — drop-zones here either route there
// pre-filled (Close Won) or do a single-row stage flip (Close Lost).
// Drag between the 4 pre-close columns is a single-row UPDATE.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  TrendingUp, Trophy, XCircle, Clock, Building2, PackageOpen,
  ArrowRight, AlertTriangle, MoveRight,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { ZAR as fmtZar } from '../../../lib/sales.js';

const PIPELINE_STAGES = [
  { id: 'new_lead',        label: 'New lead' },
  { id: 'discovery_visit', label: 'Discovery' },
  { id: 'proposal_sent',   label: 'Proposal sent' },
  { id: 'negotiation',     label: 'Negotiation' },
];
const STAGE_IDS = new Set(PIPELINE_STAGES.map(s => s.id));

function daysBetween(then, now = new Date()) {
  if (!then) return null;
  return Math.max(0, Math.floor((now - new Date(then)) / 86_400_000));
}

function pkgLabel(d) {
  if (d.deal_type === 'add_on') return d.add_on_name || 'Add-on';
  if (!d.package || d.package === 'none') return '—';
  return d.package;
}

function DragBadge({ days }) {
  if (days == null) return null;
  const tone =
    days >= 21 ? 'border-brandred/60 bg-brandred/15 text-brandred'
    : days >= 7 ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
    : 'border-darkbg-border bg-darkbg-900/60 text-soft';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${tone}`}>
      <Clock size={10}/> {days}d
    </span>
  );
}

function Card({ deal, daysInStage, onDragStart }) {
  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(e, deal)}
      className="cursor-grab rounded-md border border-darkbg-border bg-darkbg-900/60 p-3 text-sm transition hover:border-brandred/40 active:cursor-grabbing"
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-white">{deal.client_name || '—'}</p>
          <p className="truncate text-[11px] text-soft">
            <PackageOpen size={10} className="-mt-0.5 mr-1 inline"/>
            {pkgLabel(deal)}
          </p>
        </div>
        <DragBadge days={daysInStage}/>
      </header>

      <dl className="grid grid-cols-2 gap-1 text-[11px]">
        <div>
          <dt className="text-soft">Setup</dt>
          <dd className="text-white">{deal.setup_fee != null ? fmtZar(deal.setup_fee) : '—'}</dd>
        </div>
        <div>
          <dt className="text-soft">Monthly</dt>
          <dd className="text-white">{deal.monthly_retainer != null ? fmtZar(deal.monthly_retainer) : '—'}</dd>
        </div>
      </dl>

      {deal.closer_name && (
        <p className="mt-2 truncate text-[10px] uppercase tracking-widest text-soft">
          Closer · {deal.closer_name}
        </p>
      )}
    </article>
  );
}

function StageColumn({ stage, deals, stageChangeMap, onDragStart, onDrop, isTarget }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => onDrop(e, stage.id)}
      className={`flex min-h-[60vh] flex-col rounded-lg border bg-darkbg-900/30 p-3 transition ${
        isTarget ? 'border-brandred/60 bg-brandred/5' : 'border-darkbg-border'
      }`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm uppercase tracking-widest text-soft">{stage.label}</h2>
        <span className="rounded-full border border-darkbg-border bg-darkbg-900/60 px-2 py-0.5 text-[10px] text-soft">
          {deals.length}
        </span>
      </header>
      <div className="space-y-2">
        {deals.length === 0 ? (
          <p className="rounded-md border border-dashed border-darkbg-border/60 p-4 text-center text-xs text-soft">
            Drop a deal here
          </p>
        ) : (
          deals.map(d => {
            const changedAt = stageChangeMap.get(d.id) || d.created_at;
            return (
              <Card key={d.id} deal={d}
                daysInStage={daysBetween(changedAt)}
                onDragStart={onDragStart}/>
            );
          })
        )}
      </div>
    </div>
  );
}

function ActionZone({ tone, icon: Icon, title, subtitle, onDrop, isTarget }) {
  const palette = tone === 'win'
    ? { border: 'border-emerald-500/40', tint: 'bg-emerald-500/10', text: 'text-emerald-300' }
    : { border: 'border-brandred/40',    tint: 'bg-brandred/10',    text: 'text-brandred'   };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={onDrop}
      className={`flex flex-col items-start justify-between rounded-lg border-2 border-dashed p-4 transition
        ${palette.border} ${isTarget ? palette.tint : 'bg-darkbg-900/30'}`}
    >
      <div className={`mb-2 inline-flex items-center gap-2 ${palette.text}`}>
        <Icon size={16}/>
        <span className="font-display text-sm uppercase tracking-widest">{title}</span>
      </div>
      <p className="text-xs text-soft">{subtitle}</p>
    </div>
  );
}

export default function Pipeline() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dragOver, setDragOver]   = useState(null);
  const [lostModal, setLostModal] = useState(null); // { deal, reason }

  // ---------------------------------------------------------------------
  // Queries — deals in the 4 pre-close stages + audit_log stage changes
  // ---------------------------------------------------------------------
  const queries = useQueries({
    queries: [
      {
        queryKey: ['pipeline_deals'],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('deals')
            .select('id, client_id, client_name, deal_type, package, add_on_name, setup_fee, monthly_retainer, stage, closer_id, closer_name, cpc_id, source, notes, created_at')
            .in('stage', [...STAGE_IDS])
            .order('created_at', { ascending: false });
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ['pipeline_stage_changes'],
        staleTime: 60_000,
        queryFn: async () => {
          // Latest stage-change timestamp per deal id, derived from audit_log.
          const { data, error } = await supabase
            .from('audit_log')
            .select('row_id, before_data, after_data, created_at')
            .eq('table_name', 'deals')
            .eq('action', 'UPDATE')
            .order('created_at', { ascending: false })
            .limit(500);
          if (error) throw error;
          const map = new Map();
          for (const r of (data ?? [])) {
            if (map.has(r.row_id)) continue;
            const before = r.before_data?.stage;
            const after  = r.after_data?.stage;
            if (before && after && before !== after) {
              map.set(r.row_id, r.created_at);
            }
          }
          return map;
        },
      },
    ],
  });
  const [dealsQ, changesQ] = queries;
  const isLoading = queries.some(q => q.isLoading);
  const loadError = queries.find(q => q.error)?.error;

  const byStage = useMemo(() => {
    const out = Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, []]));
    for (const d of (dealsQ.data || [])) {
      if (out[d.stage]) out[d.stage].push(d);
    }
    return out;
  }, [dealsQ.data]);

  const totalDeals = (dealsQ.data || []).length;

  // ---------------------------------------------------------------------
  // Mutations — move between pre-close stages, mark closed-lost
  // ---------------------------------------------------------------------
  const moveStage = useMutation({
    mutationFn: async ({ id, stage }) => {
      const { error } = await supabase
        .from('deals')
        .update({ stage })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['pipeline_deals'] });
      qc.invalidateQueries({ queryKey: ['pipeline_stage_changes'] });
      toast.success(`Moved to ${vars.stage.replace('_',' ')}`);
    },
    onError: (err) => {
      toast.error(err?.message || 'Move failed');
      console.error('[pipeline:move]', err);
    },
  });

  const markLost = useMutation({
    mutationFn: async ({ id, reason }) => {
      const { error } = await supabase
        .from('deals')
        .update({ stage: 'closed_lost', lost_reason: reason || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline_deals'] });
      qc.invalidateQueries({ queryKey: ['pipeline_stage_changes'] });
      qc.invalidateQueries({ queryKey: ['owner_dashboard'] });
      setLostModal(null);
      toast.success('Deal closed-lost');
    },
    onError: (err) => {
      toast.error(err?.message || 'Could not mark lost');
      console.error('[pipeline:lost]', err);
    },
  });

  // ---------------------------------------------------------------------
  // Drag handlers
  // ---------------------------------------------------------------------
  function onDragStart(e, deal) {
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: deal.id, fromStage: deal.stage,
    }));
    e.dataTransfer.effectAllowed = 'move';
  }

  function readDrag(e) {
    try { return JSON.parse(e.dataTransfer.getData('application/json')); }
    catch { return null; }
  }

  function onDropStage(e, stageId) {
    e.preventDefault();
    setDragOver(null);
    const drag = readDrag(e);
    if (!drag) return;
    if (drag.fromStage === stageId) return;
    moveStage.mutate({ id: drag.id, stage: stageId });
  }

  function onDropCloseWon(e) {
    e.preventDefault();
    setDragOver(null);
    const drag = readDrag(e);
    if (!drag) return;
    const deal = (dealsQ.data || []).find(d => d.id === drag.id);
    if (!deal) return;
    // Route to Log Sale pre-filled. Log Sale runs close_sale() + (on
    // success) deletes the source pipeline deal so we don't double-count.
    navigate('/owner/sales/log', {
      state: {
        sourceDealId: deal.id,
        preFill: {
          isNewClient: !deal.client_id,
          clientId: deal.client_id || '',
          dealType: deal.deal_type,
          pkg: deal.package && deal.package !== 'none' ? deal.package : 'ignite',
          addOnName: deal.add_on_name || '',
          setupFee: deal.setup_fee != null ? String(deal.setup_fee) : '',
          monthlyRetainer: deal.monthly_retainer != null ? String(deal.monthly_retainer) : '',
          source: deal.source || 'other',
          cpcId: deal.cpc_id || '',
          notes: deal.notes || '',
        },
      },
    });
  }

  function onDropCloseLost(e) {
    e.preventDefault();
    setDragOver(null);
    const drag = readDrag(e);
    if (!drag) return;
    const deal = (dealsQ.data || []).find(d => d.id === drag.id);
    if (!deal) return;
    setLostModal({ deal, reason: '' });
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  if (isLoading) return <div className="text-soft">Loading pipeline…</div>;
  if (loadError) {
    return (
      <div className="card p-6">
        <p className="mb-2 flex items-center gap-2 text-brandred">
          <AlertTriangle size={18}/> Pipeline load error
        </p>
        <p className="text-sm">{loadError.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Sales Opportunities</span>
          </h1>
          <p className="text-sm text-soft">
            {totalDeals} open · drag between stages, drop on the action zones to close.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/owner/sales/log')}
          className="inline-flex items-center gap-2 rounded-md bg-brandred px-4 py-2 font-display text-sm text-white hover:brightness-110"
        >
          <TrendingUp size={14}/> Log a sale
        </button>
      </header>

      {totalDeals === 0 ? (
        <div className="card grid place-items-center p-10 text-center">
          <p className="mb-2 font-display text-xl">No deals yet</p>
          <p className="mb-4 text-sm text-soft">Log your first sale to populate the pipeline.</p>
          <button
            type="button"
            onClick={() => navigate('/owner/sales/log')}
            className="inline-flex items-center gap-2 rounded-md bg-brandred px-4 py-2 font-display text-sm text-white hover:brightness-110"
          >
            Log a sale <ArrowRight size={14}/>
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {PIPELINE_STAGES.map(s => (
              <div key={s.id}
                onDragEnter={() => setDragOver(s.id)}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(null); }}
              >
                <StageColumn
                  stage={s}
                  deals={byStage[s.id]}
                  stageChangeMap={changesQ.data || new Map()}
                  onDragStart={onDragStart}
                  onDrop={onDropStage}
                  isTarget={dragOver === s.id}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div
              onDragEnter={() => setDragOver('closed_won')}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(null); }}
            >
              <ActionZone
                tone="win" icon={Trophy} title="Close Won"
                subtitle="Drop here → opens Log Sale pre-filled. close_sale() runs the 13-step atomic close."
                onDrop={onDropCloseWon}
                isTarget={dragOver === 'closed_won'}/>
            </div>
            <div
              onDragEnter={() => setDragOver('closed_lost')}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(null); }}
            >
              <ActionZone
                tone="lose" icon={XCircle} title="Close Lost"
                subtitle="Drop here → enter a lost reason. No commissions, no contract."
                onDrop={onDropCloseLost}
                isTarget={dragOver === 'closed_lost'}/>
            </div>
          </div>
        </>
      )}

      {lostModal && (
        <LostModal
          deal={lostModal.deal}
          reason={lostModal.reason}
          onChange={(reason) => setLostModal(m => ({ ...m, reason }))}
          onCancel={() => setLostModal(null)}
          onConfirm={() => markLost.mutate({ id: lostModal.deal.id, reason: lostModal.reason })}
          submitting={markLost.isPending}
        />
      )}
    </div>
  );
}

function LostModal({ deal, reason, onChange, onCancel, onConfirm, submitting }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-darkbg-900/80 p-4">
      <div className="card w-full max-w-md p-6">
        <header className="mb-4 flex items-center gap-3">
          <XCircle size={20} className="text-brandred"/>
          <div>
            <h2 className="font-display text-lg">Close Lost — {deal.client_name}</h2>
            <p className="text-xs text-soft">
              <MoveRight size={10} className="-mt-0.5 mr-1 inline"/>
              {deal.stage.replace('_',' ')} → closed_lost
            </p>
          </div>
        </header>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-widest text-soft">Lost reason</span>
          <textarea rows={4}
            value={reason}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. budget, picked competitor, deal stalled out…"
            className="w-full rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none"/>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-soft hover:text-white">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={submitting}
            className="rounded-md bg-brandred px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Mark as lost'}
          </button>
        </div>
      </div>
    </div>
  );
}
