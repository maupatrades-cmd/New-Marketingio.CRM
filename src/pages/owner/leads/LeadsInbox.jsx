import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Flame, Thermometer, Snowflake, Clock, CheckCircle,
  X, ChevronDown, UserCheck, AlertTriangle, Inbox,
  Phone, Mail, MapPin, RefreshCw, Filter,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageMs(iso) {
  return Date.now() - new Date(iso).getTime();
}

function ageDays(iso) {
  return ageMs(iso) / 86_400_000;
}

/** Absolute date + relative label */
function fmtDate(iso) {
  const d   = new Date(iso);
  const abs = d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  const hrs = Math.floor(ageMs(iso) / 3_600_000);
  const rel = hrs < 1
    ? `${Math.max(1, Math.floor(ageMs(iso) / 60_000))}m ago`
    : hrs < 24
    ? `${hrs}h ago`
    : `${Math.floor(ageDays(iso))}d ago`;
  return { abs, rel };
}

function fmtRole(role) {
  const map = { field_agent: 'Field', cpc: 'CPC', admin: 'Admin', owner: 'Owner', head_of_tech: 'HoT' };
  return map[role] ?? role;
}

// ─── Age badge ────────────────────────────────────────────────────────────────

function AgeBadge({ createdAt }) {
  const days = ageDays(createdAt);
  if (days >= 3) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400 ring-1 ring-red-500/30">
      <AlertTriangle size={9} /> {Math.floor(days)}d old
    </span>
  );
  if (days >= 1) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-bold text-yellow-400 ring-1 ring-yellow-500/30">
      <Clock size={9} /> {Math.floor(days)}d old
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-400 ring-1 ring-green-500/30">
      New
    </span>
  );
}

// ─── Temperature badge ────────────────────────────────────────────────────────

function TempBadge({ temp }) {
  if (!temp || temp === 'cold') return (
    <span className="inline-flex items-center gap-1 text-blue-400 text-[11px]"><Snowflake size={11} /> Cold</span>
  );
  if (temp === 'warm') return (
    <span className="inline-flex items-center gap-1 text-yellow-400 text-[11px]"><Thermometer size={11} /> Warm</span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-orange-400 text-[11px] font-bold"><Flame size={11} /> Hot</span>
  );
}

// ─── Row border based on age ──────────────────────────────────────────────────

function rowBorderClass(createdAt) {
  const days = ageDays(createdAt);
  if (days >= 3) return 'border-l-red-500/60';
  if (days >= 1) return 'border-l-yellow-500/40';
  return 'border-l-darkbg-border/0';
}

// ─── Assign dropdown ─────────────────────────────────────────────────────────

function AssignDropdown({ lead, staff, onAssign }) {
  const [open, setOpen] = useState(false);

  const assignable = useMemo(
    () => staff.filter(s => ['field_agent', 'cpc', 'admin', 'owner'].includes(s.role)),
    [staff],
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-darkbg-border bg-darkbg-700/60 px-2 py-1 text-[11px] font-semibold text-soft transition hover:border-blue-500/50 hover:text-white"
      >
        {lead.assigned_to
          ? <><UserCheck size={11} className="text-green-400" /> Reassign</>
          : <><UserCheck size={11} /> Assign</>
        }
        <ChevronDown size={10} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-darkbg-border bg-darkbg-800 shadow-xl">
            <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-soft/50">Assign to</p>
            {assignable.map(s => (
              <button
                key={s.id}
                onClick={() => { onAssign(lead.id, s.id, s.full_name); setOpen(false); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-soft hover:bg-darkbg-700 hover:text-white"
              >
                <span>{s.full_name}</span>
                <span className="text-[9px] uppercase tracking-widest text-soft/50">{fmtRole(s.role)}</span>
              </button>
            ))}
            {lead.assigned_to && (
              <>
                <div className="mx-3 my-1 h-px bg-darkbg-border/50" />
                <button
                  onClick={() => { onAssign(lead.id, null, null); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-darkbg-700"
                >
                  <X size={10} /> Unassign
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Reject modal ─────────────────────────────────────────────────────────────

function RejectModal({ lead, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
        <h2 className="font-display text-lg text-gradient mb-1">Reject Lead</h2>
        <p className="text-sm text-soft mb-4">
          Rejecting <span className="font-semibold text-white">{lead.business_name}</span>. Give a reason (required):
        </p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Duplicate, outside service area, no contact info…"
          className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button
            onClick={() => reason.trim() && onConfirm(lead.id, reason.trim())}
            disabled={!reason.trim()}
            className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:bg-brandred/80"
          >
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lead row ─────────────────────────────────────────────────────────────────

function LeadRow({ lead, staff, onVerify, onAssign, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const { abs, rel } = fmtDate(lead.created_at);

  const assignedName = useMemo(() => {
    if (!lead.assigned_to) return null;
    return staff.find(s => s.id === lead.assigned_to)?.full_name ?? 'Assigned';
  }, [lead.assigned_to, staff]);

  const isVerified  = lead.status === 'verified';
  const isRejected  = lead.status === 'rejected';
  const isPending   = !isVerified && !isRejected;

  return (
    <>
      <div
        className={`border-l-4 ${rowBorderClass(lead.created_at)} bg-darkbg-800/60 rounded-xl border border-darkbg-border mb-2 transition hover:border-darkbg-border/80`}
      >
        {/* Main row */}
        <div className="flex flex-wrap items-start gap-3 p-4">
          {/* Date block */}
          <div className="min-w-[120px] shrink-0">
            <p className="text-xs font-bold text-white">{abs}</p>
            <p className="text-[10px] text-soft/60">{rel}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <AgeBadge createdAt={lead.created_at} />
              <TempBadge temp={lead.lead_temperature} />
            </div>
          </div>

          {/* Business + contact */}
          <div className="flex-1 min-w-[160px]">
            <p className="text-sm font-bold text-white leading-tight">{lead.business_name}</p>
            {lead.contact_person && <p className="text-xs text-soft">{lead.contact_person}</p>}
            {lead.industry && <p className="text-[10px] uppercase tracking-widest text-soft/50 mt-0.5">{lead.industry}</p>}
          </div>

          {/* Submitted by */}
          <div className="min-w-[110px] shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-soft/40 mb-0.5">Submitted by</p>
            <p className="text-xs font-semibold text-white">
              {lead.submitted_by_name || '—'}
            </p>
            {lead.submitted_by_role && (
              <p className="text-[10px] text-soft/60">{fmtRole(lead.submitted_by_role)}</p>
            )}
          </div>

          {/* Status */}
          <div className="min-w-[100px] shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-soft/40 mb-0.5">Status</p>
            {isVerified  && <span className="text-xs font-semibold text-green-400">Verified</span>}
            {isRejected  && <span className="text-xs font-semibold text-red-400">Rejected</span>}
            {isPending   && <span className="text-xs font-semibold text-yellow-400">Unverified</span>}
          </div>

          {/* Assigned */}
          <div className="min-w-[110px] shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-soft/40 mb-0.5">Assigned</p>
            {assignedName
              ? <p className="text-xs font-semibold text-white">{assignedName}</p>
              : <p className="text-xs text-soft/50">Unassigned</p>
            }
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto shrink-0">
            {isPending && (
              <button
                onClick={() => onVerify(lead.id)}
                className="inline-flex items-center gap-1 rounded-md border border-green-500/40 bg-green-500/10 px-2 py-1 text-[11px] font-semibold text-green-400 transition hover:bg-green-500/20"
              >
                <CheckCircle size={11} /> Verify
              </button>
            )}

            <AssignDropdown lead={lead} staff={staff} onAssign={onAssign} />

            {!isRejected && (
              <button
                onClick={() => setRejectOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20"
              >
                <X size={11} /> Reject
              </button>
            )}

            <button
              onClick={() => setExpanded(v => !v)}
              className="rounded-md border border-darkbg-border bg-darkbg-700/60 px-2 py-1 text-[11px] text-soft transition hover:text-white"
            >
              {expanded ? 'Less' : 'More'}
            </button>
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-darkbg-border/50 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {lead.phone && (
              <div className="flex items-center gap-2">
                <Phone size={11} className="text-soft/50 shrink-0" />
                <a href={`tel:${lead.phone}`} className="text-xs text-blue-400 hover:underline">{lead.phone}</a>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2">
                <Mail size={11} className="text-soft/50 shrink-0" />
                <a href={`mailto:${lead.email}`} className="text-xs text-blue-400 hover:underline truncate">{lead.email}</a>
              </div>
            )}
            {lead.address && (
              <div className="flex items-center gap-2 col-span-2">
                <MapPin size={11} className="text-soft/50 shrink-0" />
                <p className="text-xs text-soft">{lead.address}</p>
              </div>
            )}
            {lead.source && (
              <div>
                <p className="text-[9px] uppercase tracking-widest text-soft/40">Source</p>
                <p className="text-xs text-white">{lead.source}</p>
              </div>
            )}
            {lead.interest_package && (
              <div>
                <p className="text-[9px] uppercase tracking-widest text-soft/40">Package Interest</p>
                <p className="text-xs text-white capitalize">{lead.interest_package.replace(/_/g, ' ')}</p>
              </div>
            )}
            {lead.keenness && (
              <div>
                <p className="text-[9px] uppercase tracking-widest text-soft/40">Keenness</p>
                <p className="text-xs text-white capitalize">{lead.keenness}</p>
              </div>
            )}
            {lead.best_time && (
              <div>
                <p className="text-[9px] uppercase tracking-widest text-soft/40">Best Time</p>
                <p className="text-xs text-white">{lead.best_time}</p>
              </div>
            )}
            {lead.notes && (
              <div className="col-span-full">
                <p className="text-[9px] uppercase tracking-widest text-soft/40">Notes</p>
                <p className="text-xs text-soft">{lead.notes}</p>
              </div>
            )}
            {lead.rejection_reason && (
              <div className="col-span-full">
                <p className="text-[9px] uppercase tracking-widest text-red-400/60">Rejection Reason</p>
                <p className="text-xs text-red-300">{lead.rejection_reason}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {rejectOpen && (
        <RejectModal
          lead={lead}
          onConfirm={(id, reason) => { onReject(id, reason); setRejectOpen(false); }}
          onClose={() => setRejectOpen(false)}
        />
      )}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { key: 'pending', label: 'Unverified' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export default function LeadsInbox() {
  const { role } = useAuth();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('pending');
  const [tempFilter,   setTempFilter]   = useState('all');

  // Leads query — oldest first so stale leads surface at the top
  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: ['leads-inbox', statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('id,business_name,contact_person,phone,email,address,industry,source,submitted_by,submitted_by_name,submitted_by_role,urgency,status,lead_temperature,interest_package,keenness,best_time,preferred_channel,notes,rejection_reason,assigned_to,assigned_at,verified_by,verified_date,created_at,updated_at')
        .order('created_at', { ascending: true }); // oldest first

      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter === 'pending' ? 'pending_verification' : statusFilter);
      } else {
        q = q.not('status', 'eq', 'converted');
      }

      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // Staff list for assign dropdown
  const { data: staff = [] } = useQuery({
    queryKey: ['inbox-staff'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, role, profiles(id, full_name)')
        .in('role', ['owner', 'admin', 'head_of_tech', 'field_agent', 'cpc']);
      return (data ?? []).map(r => ({
        id:        r.user_id,
        full_name: r.profiles?.full_name ?? 'Unknown',
        role:      r.role,
      }));
    },
    staleTime: 300_000,
  });

  const filtered = useMemo(() => {
    if (tempFilter === 'all') return leads;
    return leads.filter(l => (l.lead_temperature ?? 'cold') === tempFilter);
  }, [leads, tempFilter]);

  // Counts for filter pills
  const counts = useMemo(() => ({
    pending:  leads.length, // already filtered server-side when statusFilter = 'pending'
    hot:      leads.filter(l => l.lead_temperature === 'hot').length,
    warm:     leads.filter(l => l.lead_temperature === 'warm').length,
    overdue:  leads.filter(l => ageDays(l.created_at) >= 3).length,
  }), [leads]);

  async function handleVerify(id) {
    const { error } = await supabase
      .from('leads')
      .update({ status: 'verified', verified_date: new Date().toISOString().slice(0, 10) })
      .eq('id', id);
    if (error) { toast.error(`Verify failed: ${error.message}`); return; }
    toast.success('Lead verified');
    qc.invalidateQueries({ queryKey: ['leads-inbox'] });
  }

  async function handleAssign(id, staffId, staffName) {
    const { error } = await supabase
      .from('leads')
      .update({
        assigned_to: staffId,
        assigned_at: staffId ? new Date().toISOString() : null,
      })
      .eq('id', id);
    if (error) { toast.error(`Assign failed: ${error.message}`); return; }
    toast.success(staffId ? `Assigned to ${staffName}` : 'Unassigned');
    qc.invalidateQueries({ queryKey: ['leads-inbox'] });
  }

  async function handleReject(id, reason) {
    const { error } = await supabase
      .from('leads')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', id);
    if (error) { toast.error(`Reject failed: ${error.message}`); return; }
    toast.success('Lead rejected');
    qc.invalidateQueries({ queryKey: ['leads-inbox'] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Leads</p>
          <h1 className="font-display text-3xl text-gradient">Leads Inbox</h1>
          <p className="mt-1 text-sm text-soft">
            Sorted oldest first — leads going cold rise to the top.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {counts.overdue > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-400 ring-1 ring-red-500/30">
              <AlertTriangle size={11} /> {counts.overdue} overdue 3d+
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft transition hover:text-white"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={13} className="text-soft/40 shrink-0" />
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              statusFilter === f.key
                ? 'border-brandred bg-brandred/15 text-white'
                : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}

        <div className="mx-2 h-4 w-px bg-darkbg-border/50" />

        {/* Temperature sub-filter */}
        {[
          { key: 'all',  label: 'All temps' },
          { key: 'hot',  label: '🔥 Hot' },
          { key: 'warm', label: '🌡 Warm' },
          { key: 'cold', label: '❄ Cold' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setTempFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              tempFilter === f.key
                ? 'border-orange-500/50 bg-orange-500/10 text-white'
                : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      {!isLoading && (
        <div className="flex flex-wrap gap-4 rounded-xl border border-darkbg-border bg-darkbg-800/40 px-4 py-3">
          <div className="text-center">
            <p className="text-lg font-bold text-white">{filtered.length}</p>
            <p className="text-[10px] text-soft uppercase tracking-widest">Shown</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-400">{counts.overdue}</p>
            <p className="text-[10px] text-soft uppercase tracking-widest">3d+ old</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-orange-400">{counts.hot}</p>
            <p className="text-[10px] text-soft uppercase tracking-widest">Hot</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-yellow-400">{counts.warm}</p>
            <p className="text-[10px] text-soft uppercase tracking-widest">Warm</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-soft">
              {leads.filter(l => !l.assigned_to).length}
            </p>
            <p className="text-[10px] text-soft uppercase tracking-widest">Unassigned</p>
          </div>
        </div>
      )}

      {/* Lead rows */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-darkbg-700/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/40 py-16 text-center">
          <Inbox size={28} className="mx-auto mb-3 text-soft/40" />
          <p className="font-display text-lg text-white">
            {statusFilter === 'pending' ? 'No unverified leads' : 'No leads found'}
          </p>
          <p className="mt-1 text-sm text-soft">
            {statusFilter === 'pending' ? 'All caught up! New leads submitted by the team will appear here.' : 'Try a different filter.'}
          </p>
        </div>
      ) : (
        <div>
          {filtered.map(lead => (
            <LeadRow
              key={lead.id}
              lead={lead}
              staff={staff}
              onVerify={handleVerify}
              onAssign={handleAssign}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
