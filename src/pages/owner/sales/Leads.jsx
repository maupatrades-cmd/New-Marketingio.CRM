// Slice 2.1 — Leads inbox (owner surface).
//
// Hard rules (from the brief + LB-215 lesson):
//   • Server-filtered, server-paginated. Never load-all-then-filter.
//   • No blob writes — narrow column updates only. Convert goes via
//     convert_lead_to_deal() RPC (single transaction, no orphan deals).
//   • Owner-only at the page level (defense in depth on top of RLS).
//   • Errors surfaced verbatim — no "Failed (unknown)" fallback.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Inbox as InboxIcon, AlertTriangle, Flame, CheckCircle2, XCircle, Copy, Sparkles,
  ArrowRight, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, UserCheck,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';
import QualifyLeadModal from '../../../components/QualifyLeadModal.jsx';
import AssignLeadModal  from '../../../components/AssignLeadModal.jsx';

const PAGE_SIZE = 25;
const STALE_HOURS = 24; // LB-215 / spec — pending > 24h is stale

const STATUS_FILTERS = [
  { id: '__all__',              label: 'All' },
  { id: 'pending_verification', label: 'Pending' },
  { id: 'verified',             label: 'Verified' },
  { id: 'needs_clarification',  label: 'Needs clarification' },
  { id: 'rejected',             label: 'Rejected' },
  { id: 'duplicate',            label: 'Duplicate' },
  { id: 'converted',            label: 'Converted' },
];

const SOURCES = [
  { v: '__all__',             label: 'All sources' },
  { v: 'cpc_outbound',        label: 'CPC outbound' },
  { v: 'field_agent_direct',  label: 'Field agent direct' },
  { v: 'fnc_referral',        label: 'FNC referral' },
  { v: 'inbound',             label: 'Inbound' },
  { v: 'referral',            label: 'Referral' },
  { v: 'phone_call_to_admin', label: 'Phone (admin)' },
  { v: 'other',               label: 'Other' },
];

const STATUS_BADGE = {
  pending_verification: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  verified:             'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  needs_clarification:  'border-sky-400/40 bg-sky-400/10 text-sky-300',
  rejected:             'border-brandred/40 bg-brandred/10 text-brandred',
  duplicate:            'border-darkbg-border bg-darkbg-900/60 text-soft',
  converted:            'border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300',
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
};

const hoursAgo = (iso) => {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
};

const SEED_SQL = `-- Seed 3 leads for smoke testing
INSERT INTO public.leads (business_name, contact_person, phone, email, industry, source, urgency, status, warm_lead_criteria)
VALUES
 ('Smoke A - urgent', 'Alice', '0820000001', 'a@example.com', 'retail',     'cpc_outbound',       'urgent', 'pending_verification',
   '{"has_budget":true,"decision_maker":true,"has_need":true,"is_real_business":true,"reachable":true,"wants_to_start":true,"not_duplicate":true}'::jsonb),
 ('Smoke B - normal', 'Bob',   '0820000002', 'b@example.com', 'services',   'field_agent_direct', 'normal', 'pending_verification', NULL),
 ('Smoke C - verified','Cara', '0820000003', 'c@example.com', 'hospitality','inbound',            'normal', 'verified', NULL);`;

export default function Leads() {
  const { role, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('pending_verification');
  const [sourceFilter, setSourceFilter] = useState('__all__');
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(0);
  const [expandedId, setExpandedId]     = useState(null);

  // Debounce search input → committed search value (server query).
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Reset to page 0 when filters change.
  useEffect(() => { setPage(0); }, [statusFilter, sourceFilter]);

  // -----------------------------------------------------------------
  // Server-filtered, server-paginated query (LB-215 rule).
  // Never SELECT *-then-client-filter. Push every filter + page into
  // PostgREST so RLS scopes the rows and we only ship PAGE_SIZE over
  // the wire.
  // -----------------------------------------------------------------
  const leadsQ = useQuery({
    queryKey: ['leads_inbox', { statusFilter, sourceFilter, search, page }],
    enabled:   role === 'owner' || role === 'admin',
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select(
          'id,business_name,contact_person,phone,email,industry,source,urgency,status,'
          + 'submitted_by_name,verified_date,rejection_reason,warm_lead_criteria,notes,'
          + 'lead_temperature,qualification_answers,'
          + 'created_at,converted_to_deal_id,assigned_to,'
          + 'profiles!leads_assigned_to_fkey(full_name)',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (statusFilter !== '__all__') q = q.eq('status', statusFilter);
      if (sourceFilter !== '__all__') q = q.eq('source', sourceFilter);
      if (search) {
        const esc = search.replace(/[%_,()]/g, ' ').slice(0, 80);
        q = q.or(`business_name.ilike.%${esc}%,contact_person.ilike.%${esc}%,email.ilike.%${esc}%`);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const rows  = leadsQ.data?.rows ?? [];
  const total = leadsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // -----------------------------------------------------------------
  // Status flips — narrow column updates only. RLS + check constraints
  // protect against PATCHing arbitrary columns.
  // -----------------------------------------------------------------
  const flipStatus = useMutation({
    mutationFn: async ({ id, patch, optimisticLabel }) => {
      const { error } = await supabase.from('leads').update(patch).eq('id', id);
      if (error) throw error;
      return { id, optimisticLabel };
    },
    onSuccess: ({ optimisticLabel }) => {
      qc.invalidateQueries({ queryKey: ['leads_inbox'] });
      qc.invalidateQueries({ queryKey: ['owner_dashboard'] });
      toast.success(optimisticLabel);
    },
    onError: (err) => {
      // PR #133 rule — never "unknown".
      toast.error(err?.message || 'Could not update lead');
      console.error('[leads]', err);
    },
  });

  const convertLead = useMutation({
    mutationFn: async (leadId) => {
      const { data, error } = await supabase.rpc('convert_lead_to_deal', { p_lead_id: leadId });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads_inbox'] });
      qc.invalidateQueries({ queryKey: ['pipeline_deals'] });
      qc.invalidateQueries({ queryKey: ['owner_dashboard'] });
      toast.success(`Lead converted to deal ${String(data?.deal_id || '').slice(0, 8)}…`);
      navigate('/owner/sales');
    },
    onError: (err) => {
      toast.error(err?.message || 'Convert failed');
      console.error('[leads:convert]', err);
    },
  });

  // -----------------------------------------------------------------
  // Modals (reject reason, needs-clarification note, duplicate confirm,
  // qualify_lead RPC modal)
  // -----------------------------------------------------------------
  const [modal, setModal] = useState(null); // { kind, lead, text }
  const [qualifyTarget, setQualifyTarget] = useState(null);
  const [assignTarget,  setAssignTarget]  = useState(null);

  // -----------------------------------------------------------------
  // Role gate — defense in depth on top of RLS.
  // -----------------------------------------------------------------
  if (authLoading) return <div className="text-soft">Loading…</div>;
  if (role !== 'owner' && role !== 'admin') {
    return (
      <div className="card p-8 text-center">
        <h1 className="font-display text-2xl">
          <span className="text-gradient">Leads</span>
        </h1>
        <p className="mt-3 text-soft">Owner / admin only surface.</p>
        <p className="mt-1 text-xs text-soft">You're signed in as: {role || 'no role'}</p>
      </div>
    );
  }

  if (leadsQ.isLoading && !leadsQ.data) return <div className="text-soft">Loading leads…</div>;

  if (leadsQ.error) {
    return (
      <div className="card p-6">
        <p className="mb-2 flex items-center gap-2 text-brandred">
          <AlertTriangle size={18}/> Inbox error
        </p>
        <p className="text-sm">{leadsQ.error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Leads</span>
          </h1>
          <p className="text-sm text-soft">
            {total} matching · page {page + 1} of {totalPages}
            {leadsQ.isFetching && ' · loading…'}
          </p>
        </div>
        <InboxIcon size={28} className="text-soft"/>
      </header>

      {/* Filter bar */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatusFilter(s.id)}
              className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
                statusFilter === s.id
                  ? 'border-brandred bg-brandred/15 text-white'
                  : 'border-darkbg-border bg-darkbg-900/60 text-soft hover:text-white'
              }`}
            >{s.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-widest text-soft">Search business, contact or email</span>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft"/>
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Acme…"
                className="w-full rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 pl-9 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none"/>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-widest text-soft">Source</span>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="w-full rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white focus:border-brandred focus:outline-none"
            >
              {SOURCES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Table or empty state */}
      {total === 0 ? (
        <EmptyState />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-darkbg-border bg-darkbg-900/40 text-left text-[10px] uppercase tracking-widest text-soft">
                <tr>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2 hidden lg:table-cell">Source</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 hidden md:table-cell">Captured by</th>
                  <th className="px-3 py-2 hidden lg:table-cell">Assigned to</th>
                  <th className="px-3 py-2 hidden lg:table-cell">Created</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-darkbg-border">
                {rows.map(lead => (
                  <Row
                    key={lead.id}
                    lead={lead}
                    expanded={expandedId === lead.id}
                    onToggleExpand={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                    onQualify={() => setQualifyTarget(lead)}
                    onDuplicate={() => setModal({ kind: 'duplicate', lead, text: '' })}
                    onConvert={() => convertLead.mutate(lead.id)}
                    onAssign={() => setAssignTarget(lead)}
                    busy={flipStatus.isPending || convertLead.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <footer className="flex items-center justify-between border-t border-darkbg-border p-3 text-xs text-soft">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="inline-flex items-center gap-1 rounded-md border border-darkbg-border bg-darkbg-900/60 px-2 py-1 text-soft hover:text-white disabled:opacity-40"
              ><ChevronLeft size={14}/> Prev</button>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                className="inline-flex items-center gap-1 rounded-md border border-darkbg-border bg-darkbg-900/60 px-2 py-1 text-soft hover:text-white disabled:opacity-40"
              >Next <ChevronRight size={14}/></button>
            </div>
          </footer>
        </div>
      )}

      {qualifyTarget && (
        <QualifyLeadModal
          lead={qualifyTarget}
          onClose={() => setQualifyTarget(null)}
        />
      )}

      {assignTarget && (
        <AssignLeadModal
          lead={assignTarget}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {modal && (
        <ReasonModal
          kind={modal.kind}
          lead={modal.lead}
          value={modal.text}
          onChange={(text) => setModal(m => ({ ...m, text }))}
          onCancel={() => setModal(null)}
          submitting={flipStatus.isPending}
          onConfirm={() => {
            const { kind, lead, text } = modal;
            const reason = text.trim();
            if (kind === 'reject') {
              if (!reason) { toast.error('Please give a reason'); return; }
              flipStatus.mutate({
                id: lead.id,
                patch: { status: 'rejected', rejection_reason: reason },
                optimisticLabel: 'Rejected',
              }, { onSuccess: () => setModal(null) });
            } else if (kind === 'clarify') {
              if (!reason) { toast.error('Please add a note'); return; }
              const appended = [lead.notes, `[needs clarification] ${reason}`].filter(Boolean).join('\n');
              flipStatus.mutate({
                id: lead.id,
                patch: { status: 'needs_clarification', notes: appended },
                optimisticLabel: 'Marked needs clarification',
              }, { onSuccess: () => setModal(null) });
            } else if (kind === 'duplicate') {
              flipStatus.mutate({
                id: lead.id,
                patch: { status: 'duplicate' },
                optimisticLabel: 'Marked duplicate',
              }, { onSuccess: () => setModal(null) });
            }
          }}
        />
      )}
    </div>
  );
}

function Row({ lead, expanded, onToggleExpand, onQualify, onDuplicate, onConvert, onAssign, busy }) {
  const isStale = lead.status === 'pending_verification' && hoursAgo(lead.created_at) >= STALE_HOURS;
  const isUrgent = lead.urgency === 'urgent';
  const isPending = lead.status === 'pending_verification';
  const isVerified = lead.status === 'verified';
  const isConverted = lead.status === 'converted';
  const isRejected = lead.status === 'rejected';
  const hasCriteria = lead.warm_lead_criteria && typeof lead.warm_lead_criteria === 'object' && Object.keys(lead.warm_lead_criteria).length > 0;

  return (
    <>
      <tr className="hover:bg-darkbg-900/40">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            {hasCriteria && (
              <button type="button" onClick={onToggleExpand} className="text-soft hover:text-white" aria-label="Toggle criteria">
                {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
              </button>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{lead.business_name || '—'}</p>
              <p className="truncate text-[11px] text-soft">{lead.industry || '—'}</p>
            </div>
            {isUrgent && (
              <span className="inline-flex items-center gap-1 rounded-full border border-brandred/40 bg-brandred/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-brandred">
                <Flame size={10}/> Urgent
              </span>
            )}
            {isStale && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-300">
                <Clock size={10}/> &gt;24h
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          <p className="text-white">{lead.contact_person || '—'}</p>
          <p className="text-[11px] text-soft">{lead.email || lead.phone || '—'}</p>
        </td>
        <td className="px-3 py-2 hidden lg:table-cell text-soft">{lead.source}</td>
        <td className="px-3 py-2">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${STATUS_BADGE[lead.status] || 'border-darkbg-border bg-darkbg-900/60 text-soft'}`}>
            {lead.status.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="px-3 py-2 hidden md:table-cell text-soft">{lead.submitted_by_name || '—'}</td>
        <td className="px-3 py-2 hidden lg:table-cell text-soft">
          {lead.profiles?.full_name ?? <span className="text-soft/50">Unassigned</span>}
        </td>
        <td className="px-3 py-2 hidden lg:table-cell text-soft">{fmtDateTime(lead.created_at)}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center justify-end gap-1">
            {!isConverted && (isPending || lead.status === 'needs_clarification') && (
              <ActionBtn icon={Sparkles} label="Qualify" onClick={onQualify} disabled={busy} tone="ok"/>
            )}
            {isRejected && (
              <ActionBtn icon={Sparkles} label="Approve" onClick={onQualify} disabled={busy} tone="ok"/>
            )}
            {!isConverted && isPending && (
              <ActionBtn icon={Copy} label="Dup" onClick={onDuplicate} disabled={busy}/>
            )}
            {!isConverted && (
              <ActionBtn icon={UserCheck} label={lead.assigned_to ? 'Reassign' : 'Assign'} onClick={onAssign} disabled={busy}/>
            )}
            {!isConverted && (isPending || isVerified || lead.status === 'needs_clarification') && (
              <ActionBtn icon={ArrowRight} label="Convert" onClick={onConvert} disabled={busy} tone="primary"/>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasCriteria && (
        <tr className="bg-darkbg-900/30">
          <td colSpan={8} className="px-3 py-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-soft">Warm criteria (read-only)</p>
            <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(lead.warm_lead_criteria).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  {v
                    ? <CheckCircle2 size={12} className="text-emerald-400"/>
                    : <XCircle size={12} className="text-soft"/>}
                  <span className="text-soft">{k.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
            {lead.rejection_reason && (
              <p className="mt-3 text-xs text-soft"><span className="text-brandred">Rejected:</span> {lead.rejection_reason}</p>
            )}
            {lead.notes && (
              <p className="mt-2 whitespace-pre-wrap text-xs text-soft">{lead.notes}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ActionBtn({ icon: Icon, label, onClick, disabled, tone }) {
  const palette = {
    ok:      'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10',
    warn:    'border-brandred/40 text-brandred hover:bg-brandred/10',
    primary: 'border-fuchsia-400/40 text-fuchsia-300 hover:bg-fuchsia-400/10',
  }[tone] || 'border-darkbg-border text-soft hover:text-white hover:bg-darkbg-900/60';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition disabled:opacity-40 ${palette}`}
    >
      <Icon size={12}/> {label}
    </button>
  );
}

function ReasonModal({ kind, lead, value, onChange, onCancel, onConfirm, submitting }) {
  const config = {
    reject:    { title: 'Reject lead',       cta: 'Reject',        prompt: 'Reason (required) — saved to rejection_reason.' },
    clarify:   { title: 'Needs clarification', cta: 'Mark + note', prompt: 'Note (required) — appended to notes; status flips to needs_clarification.' },
    duplicate: { title: 'Mark duplicate',    cta: 'Mark duplicate', prompt: 'Confirm — status flips to duplicate.' },
  }[kind];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-darkbg-900/80 p-4">
      <div className="card w-full max-w-md p-6">
        <header className="mb-3">
          <h2 className="font-display text-lg">{config.title}</h2>
          <p className="text-xs text-soft">{lead.business_name}</p>
        </header>
        <p className="mb-2 text-xs text-soft">{config.prompt}</p>
        {kind !== 'duplicate' && (
          <textarea
            rows={4}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none"
            placeholder={kind === 'reject' ? 'e.g. duplicate of #X, not a real business…' : 'What needs clarifying?'}
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm text-soft hover:text-white">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={submitting}
            className="rounded-md bg-brandred px-3 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50">
            {submitting ? 'Saving…' : config.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card grid place-items-center p-10 text-center">
      <p className="mb-2 font-display text-xl">No leads here</p>
      <p className="mb-4 text-sm text-soft">
        Your filter returned zero rows. The lead-creation feeder (signup / CPC / field-agent submissions → leads) lands in a later slice.
        For now, seed test rows directly:
      </p>
      <pre className="max-w-full overflow-x-auto rounded-md border border-darkbg-border bg-darkbg-900/60 p-3 text-left text-[11px] text-soft">
        <code>{SEED_SQL}</code>
      </pre>
    </div>
  );
}
