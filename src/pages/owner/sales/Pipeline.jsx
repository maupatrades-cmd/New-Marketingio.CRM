// PIPE2 — 3-phase Pipeline kanban
// Phase 1 (Foundation): leads by verification status
// Phase 2 (Working): deals by stage
// Phase 3 (Loading): closed_won deals by fulfilment sub-state

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  UserPlus, Search, CheckCircle2, XCircle, Phone, Target,
  FileText, Handshake, Trophy, Banknote, ClipboardList,
  CreditCard, Star, TrendingUp, ChevronDown, ChevronRight,
  AlertTriangle, Clock, Building2, PackageOpen, ArrowRight,
  Plus,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const ZAR = (v) => v == null ? '—' : `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const days = (iso) => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null;

// ─── Phase definitions ────────────────────────────────────────────────────────

const FOUNDATION_COLS = [
  { id: 'new',       label: 'New Lead',    icon: UserPlus,     tint: 'border-blue-500/30 bg-blue-500/5' },
  { id: 'verifying', label: 'Verifying',   icon: Search,       tint: 'border-blue-500/30 bg-blue-500/5' },
  { id: 'verified',  label: 'Verified',    icon: CheckCircle2, tint: 'border-blue-500/30 bg-blue-500/5' },
];

const WORKING_COLS = [
  { id: 'new_lead',      label: 'New lead',      icon: UserPlus,      prob: 5  },
  { id: 'contacted',     label: 'Contacted',     icon: Phone,         prob: 20 },
  { id: 'qualified',     label: 'Qualified',     icon: Target,        prob: 40 },
  { id: 'proposal_sent', label: 'Proposal sent', icon: FileText,      prob: 60 },
  { id: 'negotiation',   label: 'Negotiation',   icon: Handshake,     prob: 80 },
];

const LOADING_COLS = [
  { id: 'won',      label: 'Just won',        icon: Trophy,        fn: (d) => !d.contract_loaded_date && !d.setup_fee_cleared },
  { id: 'contract', label: 'Contract pending',icon: ClipboardList, fn: (d) => !d.contract_loaded_date && !d.setup_fee_cleared },
  { id: 'invoiced', label: 'Fee invoiced',    icon: FileText,      fn: (d) => d.contract_loaded_date && !d.setup_fee_cleared },
  { id: 'paid',     label: 'Fee PAID',        icon: CreditCard,    fn: (d) => d.setup_fee_cleared && !d.onboarding_complete_date },
];

// simplified loading slot
function loadingSlot(deal) {
  if (deal.setup_fee_cleared) return 'paid';
  if (deal.contract_loaded_date) return 'invoiced';
  return 'won';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PhaseDivider({ label, color }) {
  return (
    <div className={`flex items-center gap-3 mb-3`}>
      <div className={`h-0.5 w-6 ${color}`} />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${color.replace('bg-','text-')}`}>{label}</span>
      <div className={`h-0.5 flex-1 ${color}`} />
    </div>
  );
}

function AgeBadge({ iso }) {
  const d = days(iso);
  if (d == null) return null;
  const tone = d >= 21 ? 'border-brandred/60 bg-brandred/15 text-brandred'
    : d >= 7 ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
    : 'border-darkbg-border bg-darkbg-900/60 text-soft';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${tone}`}>
      <Clock size={10}/> {d}d
    </span>
  );
}

function LeadCard({ lead, onClick }) {
  return (
    <div onClick={() => onClick(lead)}
      className="cursor-pointer rounded-md border border-darkbg-border bg-darkbg-900/60 p-3 text-sm transition hover:border-blue-500/40 hover:bg-blue-500/5">
      <p className="truncate font-semibold text-white">{lead.business_name || '—'}</p>
      <p className="truncate text-[11px] text-soft mt-0.5">{lead.source?.replace('_',' ')}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-soft">{lead.contact_person || lead.contact_name || '—'}</span>
        <AgeBadge iso={lead.created_at} />
      </div>
    </div>
  );
}

function DealCard({ deal, hideMoney, onAdvance, canWrite, onClick }) {
  const est = (deal.setup_fee || 0) + (deal.monthly_retainer || 0) * 6;
  return (
    <div className="rounded-md border border-darkbg-border bg-darkbg-900/60 p-3 text-sm transition hover:border-orange-500/30">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{deal.client_name || '—'}</p>
          <p className="truncate text-[11px] text-soft">
            <PackageOpen size={10} className="inline mr-1 -mt-0.5"/>
            {deal.package || deal.deal_type || '—'}
          </p>
        </div>
        <AgeBadge iso={deal.updated_at} />
      </div>
      {!hideMoney && (
        <dl className="grid grid-cols-2 gap-1 text-[11px] mb-2">
          <div><dt className="text-soft">Setup</dt><dd className="text-white">{ZAR(deal.setup_fee)}</dd></div>
          <div><dt className="text-soft">Monthly</dt><dd className="text-white">{ZAR(deal.monthly_retainer)}</dd></div>
        </dl>
      )}
      {hideMoney && (
        <p className="text-[11px] text-soft mb-2">{deal.package || deal.deal_type || '—'}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        {deal.closer_name && (
          <p className="truncate text-[10px] text-soft">{deal.closer_name}</p>
        )}
        {deal.probability != null && (
          <span className="text-[10px] text-emerald-400 font-semibold">{deal.probability}%</span>
        )}
      </div>
      {canWrite && onAdvance && (
        <button onClick={() => onAdvance(deal)}
          className="mt-2 w-full rounded border border-darkbg-border/60 bg-darkbg-800/40 px-2 py-1 text-[11px] text-soft hover:border-brandred/40 hover:text-white transition text-center">
          Advance…
        </button>
      )}
    </div>
  );
}

function LoadingCard({ deal, hideMoney }) {
  return (
    <div className="rounded-md border border-darkbg-border bg-darkbg-900/60 p-3 text-sm transition hover:border-emerald-500/30">
      <p className="truncate font-semibold text-white">{deal.client_name || '—'}</p>
      {!hideMoney && (
        <p className="text-[11px] text-soft mt-0.5">
          {ZAR(deal.setup_fee)} setup · {ZAR(deal.monthly_retainer)}/mo
        </p>
      )}
      {deal.closer_name && (
        <p className="mt-1 text-[10px] text-soft truncate">{deal.closer_name}</p>
      )}
    </div>
  );
}

function KanbanCol({ icon: Icon, label, tint, items, emptyText, children }) {
  return (
    <div className={`flex min-h-[160px] flex-col rounded-lg border p-3 ${tint || 'border-darkbg-border bg-darkbg-900/30'}`}>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={13} className="text-soft/70"/>}
          <h3 className="font-display text-xs uppercase tracking-wider text-soft">{label}</h3>
        </div>
        <span className="rounded-full bg-darkbg-900/60 border border-darkbg-border px-2 py-0.5 text-[10px] text-soft">
          {items}
        </span>
      </header>
      <div className="space-y-2 flex-1">
        {items === 0 ? (
          <p className="rounded border border-dashed border-darkbg-border/50 p-3 text-center text-[11px] text-soft/60">
            {emptyText || 'None here'}
          </p>
        ) : children}
      </div>
    </div>
  );
}

function AdvanceModal({ deal, onConfirm, onClose, busy }) {
  const NEXT = {
    new_lead:      ['contacted'],
    contacted:     ['qualified','closed_lost'],
    qualified:     ['proposal_sent','closed_lost'],
    proposal_sent: ['negotiation','qualified','closed_lost'],
    negotiation:   ['closed_won','closed_lost'],
  };
  const options = NEXT[deal.stage] || [];
  const [target, setTarget] = useState(options[0] || '');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-darkbg-900/80 p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <h2 className="font-display text-lg text-white">Advance deal — {deal.client_name}</h2>
        <p className="text-xs text-soft">Current stage: <span className="text-white">{deal.stage.replace(/_/g,' ')}</span></p>
        <div>
          <label className="block text-xs text-soft mb-1 uppercase tracking-widest">Move to</label>
          <select value={target} onChange={e => setTarget(e.target.value)}
            className="w-full rounded border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white focus:border-brandred focus:outline-none">
            {options.map(o => <option key={o} value={o}>{o.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        {target === 'closed_lost' && (
          <div>
            <label className="block text-xs text-soft mb-1 uppercase tracking-widest">Lost reason (required)</label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. budget, competitor, timing…"
              className="w-full rounded border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none"/>
          </div>
        )}
        {target !== 'closed_lost' && (
          <div>
            <label className="block text-xs text-soft mb-1 uppercase tracking-widest">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none"/>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose}
            className="rounded border border-darkbg-border px-3 py-2 text-sm text-soft hover:text-white">
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ deal, target, notes })}
            disabled={busy || (target === 'closed_lost' && !notes.trim())}
            className="rounded bg-brandred px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50">
            {busy ? 'Moving…' : target === 'closed_won' ? 'Log Sale →' : `Move to ${target.replace(/_/g,' ')}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Pipeline() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();

  const canWrite = ['owner', 'admin', 'head_of_tech'].includes(role);
  const hideMoney = role === 'cpc';
  const isManager = ['owner', 'admin', 'head_of_tech'].includes(role);

  const [advanceModal, setAdvanceModal] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────────

  const leadsQ = useQuery({
    queryKey: ['pipeline_leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id,business_name,contact_person,contact_name,source,verification_status,assigned_to,deal_id,created_at')
        .in('verification_status', ['pending_verification', 'verified', 'rejected'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const dealsQ = useQuery({
    queryKey: ['pipeline_deals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_pipeline');
      if (error) throw error;
      return data ?? [];
    },
  });

  const forecastQ = useQuery({
    queryKey: ['pipeline_forecast'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pipeline_forecast');
      if (error) throw error;
      return data;
    },
    enabled: !hideMoney,
  });

  // ── Advance mutation ──────────────────────────────────────────────────────

  const advanceMut = useMutation({
    mutationFn: async ({ deal, target, notes }) => {
      if (target === 'closed_won') {
        navigate('/owner/sales/log', {
          state: {
            sourceDealId: deal.id,
            preFill: {
              clientId: deal.client_id || '',
              dealType: deal.deal_type,
              pkg: deal.package || 'ignite',
              addOnName: deal.add_on_name || '',
              setupFee: deal.setup_fee != null ? String(deal.setup_fee) : '',
              monthlyRetainer: deal.monthly_retainer != null ? String(deal.monthly_retainer) : '',
              source: deal.source || 'other',
              cpcId: deal.cpc_id || '',
              notes: deal.notes || '',
            },
          },
        });
        return;
      }
      if (target === 'closed_lost') {
        const { error } = await supabase.rpc('mark_deal_lost', {
          p_deal_id: deal.id,
          p_reason:  notes,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('advance_deal_stage', {
          p_deal_id:   deal.id,
          p_new_stage: target,
          p_notes:     notes || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline_deals'] });
      qc.invalidateQueries({ queryKey: ['pipeline_forecast'] });
      setAdvanceModal(null);
      toast.success('Deal updated');
    },
    onError: (e) => {
      toast.error(e.message || 'Update failed');
    },
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  const leads = useMemo(() => {
    const all = leadsQ.data || [];
    return {
      new:       all.filter(l => l.verification_status === 'pending_verification' && !l.assigned_to),
      verifying: all.filter(l => l.verification_status === 'pending_verification' &&  l.assigned_to),
      verified:  all.filter(l => l.verification_status === 'verified' && !l.deal_id),
      rejected:  all.filter(l => l.verification_status === 'rejected'),
    };
  }, [leadsQ.data]);

  const deals = useMemo(() => {
    const all = dealsQ.data || [];
    const working = {
      new_lead:      all.filter(d => d.stage === 'new_lead'),
      contacted:     all.filter(d => d.stage === 'contacted'),
      qualified:     all.filter(d => d.stage === 'qualified'),
      proposal_sent: all.filter(d => d.stage === 'proposal_sent'),
      negotiation:   all.filter(d => d.stage === 'negotiation'),
      closed_lost:   all.filter(d => d.stage === 'closed_lost'),
    };
    const loading = {
      won:      all.filter(d => d.pipeline_phase === 'loading' && loadingSlot(d) === 'won'),
      invoiced: all.filter(d => d.pipeline_phase === 'loading' && loadingSlot(d) === 'invoiced'),
      paid:     all.filter(d => d.pipeline_phase === 'loading' && loadingSlot(d) === 'paid'),
    };
    return { working, loading };
  }, [dealsQ.data]);

  const forecast = forecastQ.data;
  const isLoading = leadsQ.isLoading || dealsQ.isLoading;

  function handleLeadClick(lead) {
    navigate(`/owner/leads/${lead.id}/inbox`);
  }

  function handleAdvanceConfirm({ deal, target, notes }) {
    advanceMut.mutate({ deal, target, notes });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="text-soft">Loading pipeline…</div>;
  }

  if (leadsQ.error || dealsQ.error) {
    return (
      <div className="card p-6">
        <p className="flex items-center gap-2 text-brandred mb-2">
          <AlertTriangle size={18}/> Pipeline load error
        </p>
        <p className="text-sm text-soft">{(leadsQ.error || dealsQ.error)?.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Sales Pipeline</span>
          </h1>
          <p className="text-sm text-soft mt-1">3-phase view: leads → working → loading</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <button onClick={() => navigate('/owner/leads/new')}
              className="inline-flex items-center gap-2 rounded-md border border-darkbg-border bg-darkbg-800/60 px-3 py-2 text-sm text-soft hover:text-white transition">
              <UserPlus size={14}/> New Lead
            </button>
          )}
          <button onClick={() => navigate('/owner/sales/log')}
            className="inline-flex items-center gap-2 rounded-md bg-brandred px-4 py-2 font-display text-sm text-white hover:brightness-110">
            <TrendingUp size={14}/> Log Sale
          </button>
        </div>
      </div>

      {/* Forecast strip — hidden for CPC */}
      {!hideMoney && forecast && !forecast.hidden && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Pipeline value',    value: ZAR(forecast.pipeline_value),    sub: 'If all open deals close' },
            { label: 'Weighted forecast', value: ZAR(forecast.weighted_forecast), sub: 'Probability-adjusted' },
            { label: 'Closed this month', value: ZAR(forecast.closed_value),      sub: `${forecast.closed_count} deal${forecast.closed_count !== 1 ? 's' : ''}` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="card p-4">
              <p className="text-xs text-soft uppercase tracking-widest mb-1">{label}</p>
              <p className="font-display text-2xl text-white">{value}</p>
              <p className="text-[11px] text-soft mt-1">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── PHASE 1: FOUNDATION ── */}
      <section>
        <PhaseDivider label="Phase 1 — Foundation" color="bg-blue-500/40" />
        <div className="grid grid-cols-3 gap-3">
          {/* New */}
          <KanbanCol icon={UserPlus} label="New Lead" items={leads.new.length}
            tint="border-blue-500/20 bg-blue-500/5" emptyText="No unassigned leads">
            {leads.new.map(l => <LeadCard key={l.id} lead={l} onClick={handleLeadClick}/>)}
          </KanbanCol>
          {/* Verifying */}
          <KanbanCol icon={Search} label="Verifying" items={leads.verifying.length}
            tint="border-blue-500/20 bg-blue-500/5" emptyText="None in verification">
            {leads.verifying.map(l => <LeadCard key={l.id} lead={l} onClick={handleLeadClick}/>)}
          </KanbanCol>
          {/* Verified */}
          <KanbanCol icon={CheckCircle2} label="Verified — Ready to convert" items={leads.verified.length}
            tint="border-blue-500/20 bg-blue-500/5" emptyText="No verified leads waiting">
            {leads.verified.map(l => (
              <div key={l.id} className="space-y-1">
                <LeadCard lead={l} onClick={handleLeadClick}/>
                {canWrite && (
                  <button onClick={() => navigate(`/owner/leads/${l.id}/inbox`)}
                    className="w-full rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-300 hover:bg-blue-500/20 transition text-center">
                    Convert to deal →
                  </button>
                )}
              </div>
            ))}
          </KanbanCol>
        </div>
      </section>

      {/* ── PHASE 2: WORKING ── */}
      <section>
        <PhaseDivider label="Phase 2 — Working" color="bg-orange-500/40" />
        <div className="grid grid-cols-5 gap-3">
          {WORKING_COLS.map(col => {
            const colDeals = deals.working[col.id] || [];
            return (
              <KanbanCol key={col.id} icon={col.icon} label={col.label} items={colDeals.length}
                tint="border-orange-500/20 bg-orange-500/5" emptyText="None here">
                {colDeals.map(d => (
                  <DealCard key={d.id} deal={d} hideMoney={hideMoney} canWrite={canWrite}
                    onAdvance={(deal) => setAdvanceModal(deal)}/>
                ))}
              </KanbanCol>
            );
          })}
        </div>
      </section>

      {/* ── PHASE 3: LOADING ── */}
      <section>
        <PhaseDivider label="Phase 3 — Loading (post-win)" color="bg-emerald-500/40" />
        <div className="grid grid-cols-3 gap-3">
          <KanbanCol icon={Trophy} label="Just won" items={deals.loading.won.length}
            tint="border-emerald-500/20 bg-emerald-500/5" emptyText="No deals here">
            {deals.loading.won.map(d => <LoadingCard key={d.id} deal={d} hideMoney={hideMoney}/>)}
          </KanbanCol>
          <KanbanCol icon={CreditCard} label="Contract + fee invoiced" items={deals.loading.invoiced.length}
            tint="border-emerald-500/20 bg-emerald-500/5" emptyText="No deals here">
            {deals.loading.invoiced.map(d => <LoadingCard key={d.id} deal={d} hideMoney={hideMoney}/>)}
          </KanbanCol>
          <KanbanCol icon={Star} label="Setup fee PAID" items={deals.loading.paid.length}
            tint="border-emerald-500/20 bg-emerald-500/5" emptyText="No deals here">
            {deals.loading.paid.map(d => <LoadingCard key={d.id} deal={d} hideMoney={hideMoney}/>)}
          </KanbanCol>
        </div>
      </section>

      {/* ── ARCHIVED (collapsed) ── */}
      <section>
        <button onClick={() => setShowArchived(v => !v)}
          className="flex items-center gap-2 text-sm text-soft hover:text-white transition">
          {showArchived ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
          Archived — rejected leads ({leads.rejected.length}) · lost deals ({deals.working.closed_lost.length})
        </button>
        {showArchived && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <KanbanCol icon={XCircle} label="Rejected leads" items={leads.rejected.length}
              tint="border-red-500/20 bg-red-500/5" emptyText="None rejected">
              {leads.rejected.map(l => <LeadCard key={l.id} lead={l} onClick={handleLeadClick}/>)}
            </KanbanCol>
            <KanbanCol icon={XCircle} label="Lost deals" items={deals.working.closed_lost.length}
              tint="border-red-500/20 bg-red-500/5" emptyText="No lost deals">
              {deals.working.closed_lost.map(d => (
                <div key={d.id} className="rounded-md border border-red-500/20 bg-darkbg-900/60 p-3 text-sm">
                  <p className="font-semibold text-white">{d.client_name}</p>
                  <p className="text-[11px] text-soft mt-0.5">{d.lost_reason || 'No reason given'}</p>
                  {isManager && (
                    <button onClick={() => navigate(`/owner/leads/${d.lead_id}/inbox`)}
                      className="mt-2 text-[11px] text-brandred hover:underline">
                      Review →
                    </button>
                  )}
                </div>
              ))}
            </KanbanCol>
          </div>
        )}
      </section>

      {/* Advance modal */}
      {advanceModal && (
        <AdvanceModal
          deal={advanceModal}
          onConfirm={handleAdvanceConfirm}
          onClose={() => setAdvanceModal(null)}
          busy={advanceMut.isPending}
        />
      )}
    </div>
  );
}
