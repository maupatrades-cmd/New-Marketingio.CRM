import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Flame, Thermometer, Snowflake, Clock, AlertTriangle,
  Inbox as InboxIcon, Phone, Mail, MapPin,
  ChevronRight, Ticket, Send, Users,
  AlertCircle, CheckCircle2, XCircle, Loader2,
  CornerDownRight, RefreshCw,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageMs(iso) { return Date.now() - new Date(iso).getTime(); }
function ageDays(iso) { return ageMs(iso) / 86_400_000; }

function fmtAge(iso) {
  const hrs = Math.floor(ageMs(iso) / 3_600_000);
  if (hrs < 1) return `${Math.max(1, Math.floor(ageMs(iso) / 60_000))}m`;
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(ageDays(iso))}d`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Small badge atoms ────────────────────────────────────────────────────────

function AgeBadge({ iso, size = 'sm' }) {
  const days = ageDays(iso);
  const age  = fmtAge(iso);
  const base = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
  if (days >= 3) return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-red-500/15 font-bold text-red-400 ring-1 ring-red-500/30 ${base}`}>
      <AlertTriangle size={8} /> {age} old
    </span>
  );
  if (days >= 1) return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-yellow-500/15 font-bold text-yellow-400 ring-1 ring-yellow-500/30 ${base}`}>
      <Clock size={8} /> {age} old
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-green-500/15 font-bold text-green-400 ring-1 ring-green-500/30 ${base}`}>
      New
    </span>
  );
}

function TempBadge({ temp }) {
  if (!temp || temp === 'cold') return (
    <span className="inline-flex items-center gap-1 text-[10px] text-blue-400"><Snowflake size={10} /> Cold</span>
  );
  if (temp === 'warm') return (
    <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400"><Thermometer size={10} /> Warm</span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-400"><Flame size={10} /> Hot</span>
  );
}

function PriorityBadge({ priority }) {
  const map = {
    urgent: 'bg-red-500/20 text-red-400 ring-red-500/40',
    high:   'bg-orange-500/15 text-orange-400 ring-orange-500/30',
    normal: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
    low:    'bg-darkbg-700 text-soft ring-darkbg-border',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ${map[priority] ?? map.normal}`}>
      {priority}
    </span>
  );
}

function StatusDot({ status }) {
  const map = {
    open:      'bg-blue-400',
    actioned:  'bg-yellow-400',
    confirmed: 'bg-green-400',
    closed:    'bg-darkbg-border',
    cancelled: 'bg-red-400/50',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] ?? 'bg-soft'}`} />;
}

function LeadStatusBadge({ status }) {
  const map = {
    pending_verification: { cls: 'text-yellow-400',  label: 'Unverified' },
    verified:             { cls: 'text-green-400',   label: 'Verified' },
    rejected:             { cls: 'text-red-400',     label: 'Rejected' },
    contacted:            { cls: 'text-blue-400',    label: 'Contacted' },
    converted:            { cls: 'text-purple-400',  label: 'Converted' },
  };
  const s = map[status] ?? { cls: 'text-soft', label: status ?? '—' };
  return <span className={`text-[10px] font-semibold ${s.cls}`}>{s.label}</span>;
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ summary, isLoading }) {
  if (isLoading) return (
    <div className="h-14 animate-pulse rounded-xl bg-darkbg-700/40" />
  );
  const stats = [
    { label: 'Tickets to me',   value: summary?.open_tickets_to_me  ?? 0, cls: summary?.open_tickets_to_me  > 0 ? 'text-brandred' : 'text-white' },
    { label: 'Urgent',          value: summary?.urgent_tickets       ?? 0, cls: summary?.urgent_tickets       > 0 ? 'text-red-400'  : 'text-white' },
    { label: 'My leads',        value: summary?.leads_created        ?? 0, cls: 'text-white' },
    { label: 'Assigned to me',  value: summary?.leads_assigned       ?? 0, cls: 'text-white' },
    { label: 'Overwhelmed',     value: summary?.overwhelmed_leads    ?? 0, cls: summary?.overwhelmed_leads    > 0 ? 'text-orange-400' : 'text-white' },
  ];
  return (
    <div className="flex flex-wrap gap-4 rounded-xl border border-darkbg-border bg-darkbg-800/40 px-5 py-3">
      {stats.map(s => (
        <div key={s.label} className="text-center min-w-[60px]">
          <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
          <p className="text-[9px] uppercase tracking-widest text-soft">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Stream 1: Ticket card ────────────────────────────────────────────────────

function TicketCard({ ticket, userId, onAction, onConfirm, onCancel }) {
  const [expanded, setExpanded] = useState(false);
  const canAction  = ticket.status === 'open'     && (ticket.to_user_id === userId || ticket.from_user_id === userId);
  const canConfirm = ticket.status === 'actioned' && ticket.actioned_by !== userId;
  const canCancel  = ticket.status === 'open'     && ticket.from_user_id === userId;
  const isToMe     = ticket.to_user_id === userId;
  const isDisputable = ticket.status === 'confirmed' && ticket.auto_confirmed
    && ticket.dispute_deadline && new Date(ticket.dispute_deadline) > new Date();

  return (
    <div className={`rounded-xl border bg-darkbg-800/60 transition ${
      ticket.priority === 'urgent' ? 'border-red-500/40' :
      ticket.priority === 'high'   ? 'border-orange-500/30' :
      'border-darkbg-border'
    }`}>
      <div className="flex flex-wrap items-start gap-3 p-4">
        {/* Status dot + age */}
        <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
          <StatusDot status={ticket.status} />
          <span className="text-[9px] text-soft/50">{fmtAge(ticket.created_at)}</span>
        </div>

        {/* Core info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <PriorityBadge priority={ticket.priority} />
            <span className="text-[10px] uppercase tracking-widest text-soft/50">
              {ticket.ticket_type_code.replace(/_/g, ' ')}
            </span>
            {isToMe
              ? <span className="text-[9px] font-bold uppercase text-brandred/80">→ To me</span>
              : <span className="text-[9px] text-soft/40">Sent by me</span>
            }
          </div>
          <p className="text-sm font-semibold text-white leading-snug">{ticket.subject}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-soft">
            <span className="font-semibold text-white/70">{ticket.lead_business_name ?? '—'}</span>
            {ticket.lead_phone && <span>{ticket.lead_phone}</span>}
            <TempBadge temp={ticket.lead_temperature} />
          </div>
          <div className="mt-1 text-[10px] text-soft/50">
            {isToMe
              ? <>From <span className="text-soft">{ticket.from_user_name ?? '—'}</span></>
              : <>To <span className="text-soft">{ticket.to_user_name ?? ticket.to_role ?? '—'}</span></>
            }
            {' · '}{fmtDate(ticket.created_at)}
          </div>
          {ticket.auto_confirmed && ticket.status === 'confirmed' && (
            <p className="mt-1 text-[10px] text-yellow-400/80">Auto-confirmed
              {isDisputable && <span className="text-orange-400"> · Dispute before {fmtDate(ticket.dispute_deadline)}</span>}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {canAction && (
            <button
              onClick={() => onAction(ticket.id)}
              className="inline-flex items-center gap-1 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-yellow-400 transition hover:bg-yellow-500/20"
            >
              <CheckCircle2 size={11} /> Action
            </button>
          )}
          {canConfirm && (
            <button
              onClick={() => onConfirm(ticket.id)}
              className="inline-flex items-center gap-1 rounded-md border border-green-500/40 bg-green-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-green-400 transition hover:bg-green-500/20"
            >
              <CheckCircle2 size={11} /> Confirm
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => onCancel(ticket.id)}
              className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/20"
            >
              <XCircle size={11} /> Cancel
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="rounded-md border border-darkbg-border bg-darkbg-700/60 px-2 py-1.5 text-[11px] text-soft transition hover:text-white"
          >
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      {expanded && ticket.body && (
        <div className="border-t border-darkbg-border/40 px-4 py-3">
          <p className="text-xs text-soft whitespace-pre-wrap">{ticket.body}</p>
          {ticket.actioned_notes && (
            <div className="mt-2 flex items-start gap-2">
              <CornerDownRight size={11} className="mt-0.5 text-yellow-400/60 shrink-0" />
              <p className="text-xs text-yellow-300/80">{ticket.actioned_notes}</p>
            </div>
          )}
          {ticket.confirmed_notes && (
            <div className="mt-2 flex items-start gap-2">
              <CornerDownRight size={11} className="mt-0.5 text-green-400/60 shrink-0" />
              <p className="text-xs text-green-300/80">{ticket.confirmed_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stream 2 & 3: Lead row ───────────────────────────────────────────────────

function LeadRow({ lead, navigate }) {
  const days = ageDays(lead.created_at);

  return (
    <button
      onClick={() => navigate(`/owner/leads/${lead.id}/inbox`)}
      className={`flex w-full items-start gap-3 rounded-xl border bg-darkbg-800/60 p-4 text-left transition hover:bg-darkbg-700/60 ${
        days >= 3 ? 'border-red-500/30' : days >= 1 ? 'border-yellow-500/20' : 'border-darkbg-border'
      }`}
    >
      {/* Age column */}
      <div className="shrink-0 min-w-[80px]">
        <p className="text-xs font-bold text-white">{fmtDate(lead.created_at)}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <AgeBadge iso={lead.created_at} size="xs" />
        </div>
      </div>

      {/* Lead info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-white leading-tight truncate">{lead.business_name}</p>
          <TempBadge temp={lead.lead_temperature} />
          <LeadStatusBadge status={lead.status} />
        </div>
        {lead.contact_person && <p className="text-[11px] text-soft mt-0.5">{lead.contact_person}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-soft/60">
          {lead.phone && <span className="flex items-center gap-1"><Phone size={9} /> {lead.phone}</span>}
          {lead.industry && <span>{lead.industry}</span>}
        </div>
      </div>

      {/* Open tickets + chevron */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        {(lead.open_ticket_count ?? 0) > 0 && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
            lead.open_ticket_count >= 5
              ? 'bg-red-500/20 text-red-400 ring-red-500/40'
              : 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
          }`}>
            <Ticket size={9} /> {lead.open_ticket_count} {lead.open_ticket_count === 1 ? 'ticket' : 'tickets'}
          </span>
        )}
        <ChevronRight size={14} className="text-soft/40" />
      </div>
    </button>
  );
}

// ─── Stream tab bar ───────────────────────────────────────────────────────────

function StreamTabs({ active, onChange, counts }) {
  const tabs = [
    { key: 'tickets', label: 'Tickets To Me', icon: InboxIcon, count: counts.tickets },
    { key: 'created', label: 'My Leads',      icon: Send,      count: counts.created },
    { key: 'assigned', label: 'Assigned To Me', icon: Users,   count: counts.assigned },
  ];
  return (
    <div className="flex gap-1 rounded-xl border border-darkbg-border bg-darkbg-800/40 p-1">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            active === t.key
              ? 'bg-darkbg-700 text-white shadow'
              : 'text-soft hover:text-white'
          }`}
        >
          <t.icon size={13} />
          <span className="hidden sm:inline">{t.label}</span>
          {t.count > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              active === t.key ? 'bg-brandred/80 text-white' : 'bg-darkbg-600 text-soft'
            }`}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Action note modal ────────────────────────────────────────────────────────

function ActionNoteModal({ title, onConfirm, onClose }) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
        <h2 className="font-display text-lg text-gradient mb-3">{title}</h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Add a note (optional)"
          className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button
            onClick={() => onConfirm(notes.trim())}
            className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white hover:bg-brandred/80"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ label, sub }) {
  return (
    <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/40 py-14 text-center">
      <InboxIcon size={26} className="mx-auto mb-3 text-soft/30" />
      <p className="font-display text-base text-white">{label}</p>
      <p className="mt-1 text-sm text-soft">{sub}</p>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function LeadsInbox() {
  const { user } = useAuth();
  const qc       = useQueryClient();
  const navigate = useNavigate();

  const [stream,  setStream]  = useState('tickets');
  const [modal,   setModal]   = useState(null); // { type: 'action'|'confirm', ticketId }
  const [statusFilter, setStatusFilter] = useState('open');

  // ── Summary ──────────────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['li-summary', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_inbox_summary');
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // ── Stream 1: Tickets to me (via RPC) ────────────────────────────────────
  const { data: allTickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['li-tickets', statusFilter],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_inbox_tickets', {
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // Filter to only tickets directed at me for Stream 1
  const myTickets = useMemo(() => {
    if (!user) return allTickets;
    return allTickets.filter(t => t.to_user_id === user.id || t.from_user_id === user.id);
  }, [allTickets, user]);

  const ticketsToMe  = useMemo(() => myTickets.filter(t => t.to_user_id   === user?.id), [myTickets, user]);
  const ticketsFromMe = useMemo(() => myTickets.filter(t => t.from_user_id === user?.id && t.to_user_id !== user?.id), [myTickets, user]);

  // ── Stream 2: Leads I created ─────────────────────────────────────────────
  const { data: myLeads = [], isLoading: myLeadsLoading, refetch: refetchMyLeads } = useQuery({
    queryKey: ['li-my-leads', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id,business_name,contact_person,phone,industry,lead_temperature,status,open_ticket_count,created_at')
        .eq('submitted_by', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // ── Stream 3: Leads assigned to me ────────────────────────────────────────
  const { data: assignedLeads = [], isLoading: assignedLoading, refetch: refetchAssigned } = useQuery({
    queryKey: ['li-assigned', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id,business_name,contact_person,phone,industry,lead_temperature,status,open_ticket_count,created_at')
        .eq('assigned_to', user.id)
        .not('status', 'in', '("rejected","converted")')
        .order('created_at', { ascending: true }) // oldest first — work the backlog
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  function refetchAll() {
    refetchTickets();
    refetchMyLeads();
    refetchAssigned();
    qc.invalidateQueries({ queryKey: ['li-summary'] });
  }

  // ── Ticket mutations ──────────────────────────────────────────────────────
  async function handleAction(ticketId, notes) {
    const { error } = await supabase.rpc('action_lead_ticket', {
      p_ticket_id: ticketId,
      p_notes: notes || null,
    });
    if (error) { toast.error(`Action failed: ${error.message}`); return; }
    toast.success('Ticket actioned — waiting for confirmation');
    setModal(null);
    refetchTickets();
    qc.invalidateQueries({ queryKey: ['li-summary'] });
  }

  async function handleConfirm(ticketId, notes) {
    const { error } = await supabase.rpc('confirm_lead_ticket', {
      p_ticket_id: ticketId,
      p_notes: notes || null,
    });
    if (error) { toast.error(`Confirm failed: ${error.message}`); return; }
    toast.success('Ticket confirmed');
    setModal(null);
    refetchTickets();
    qc.invalidateQueries({ queryKey: ['li-summary'] });
  }

  async function handleCancel(ticketId) {
    const { error } = await supabase.rpc('cancel_lead_ticket', {
      p_ticket_id: ticketId,
    });
    if (error) { toast.error(`Cancel failed: ${error.message}`); return; }
    toast.success('Ticket cancelled');
    refetchTickets();
    qc.invalidateQueries({ queryKey: ['li-summary'] });
  }

  const tabCounts = {
    tickets:  (summary?.open_tickets_to_me ?? 0),
    created:  myLeads.length,
    assigned: assignedLeads.length,
  };

  const streamLoading =
    (stream === 'tickets'  && ticketsLoading)  ||
    (stream === 'created'  && myLeadsLoading)  ||
    (stream === 'assigned' && assignedLoading);

  // ── Ticket sub-filter pills ───────────────────────────────────────────────
  const TICKET_STATUS_FILTERS = [
    { key: 'open',      label: 'Open' },
    { key: 'actioned',  label: 'Actioned' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'all',       label: 'All' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Leads</p>
          <h1 className="font-display text-3xl text-gradient">Leads Inbox</h1>
          <p className="mt-1 text-sm text-soft">Tickets, your leads, and assigned leads in one place.</p>
        </div>
        <button
          onClick={refetchAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft transition hover:text-white"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </header>

      {/* Summary strip */}
      <SummaryStrip summary={summary} isLoading={summaryLoading} />

      {/* Stream tabs */}
      <StreamTabs active={stream} onChange={setStream} counts={tabCounts} />

      {/* ── Stream 1: Tickets to me ─────────────────────────────────────── */}
      {stream === 'tickets' && (
        <div className="space-y-4">
          {/* Status sub-filter */}
          <div className="flex flex-wrap gap-1.5">
            {TICKET_STATUS_FILTERS.map(f => (
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
          </div>

          {streamLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-darkbg-700/40" />)}
            </div>
          ) : ticketsToMe.length === 0 && ticketsFromMe.length === 0 ? (
            <EmptyState
              label={statusFilter === 'open' ? 'No open tickets' : 'No tickets found'}
              sub={statusFilter === 'open' ? 'When someone raises a ticket directed at you, it appears here.' : 'Try a different filter.'}
            />
          ) : (
            <div className="space-y-3">
              {ticketsToMe.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-soft/50">📨 Directed at me</p>
                  {ticketsToMe.map(t => (
                    <TicketCard
                      key={t.id} ticket={t} userId={user?.id}
                      onAction={() => setModal({ type: 'action', ticketId: t.id })}
                      onConfirm={() => setModal({ type: 'confirm', ticketId: t.id })}
                      onCancel={() => handleCancel(t.id)}
                    />
                  ))}
                </>
              )}

              {ticketsFromMe.length > 0 && (
                <>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-soft/50">📤 Sent by me</p>
                  {ticketsFromMe.map(t => (
                    <TicketCard
                      key={t.id} ticket={t} userId={user?.id}
                      onAction={() => setModal({ type: 'action', ticketId: t.id })}
                      onConfirm={() => setModal({ type: 'confirm', ticketId: t.id })}
                      onCancel={() => handleCancel(t.id)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Stream 2: My leads ──────────────────────────────────────────── */}
      {stream === 'created' && (
        <div className="space-y-2">
          {streamLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-darkbg-700/40" />)}
            </div>
          ) : myLeads.length === 0 ? (
            <EmptyState
              label="No leads submitted yet"
              sub="Leads you submit will appear here with their ticket activity."
            />
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-soft/50 mb-2">
                {myLeads.length} lead{myLeads.length !== 1 ? 's' : ''} · newest first
              </p>
              {myLeads.map(l => (
                <LeadRow key={l.id} lead={l} navigate={navigate} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Stream 3: Assigned to me ────────────────────────────────────── */}
      {stream === 'assigned' && (
        <div className="space-y-2">
          {streamLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-darkbg-700/40" />)}
            </div>
          ) : assignedLeads.length === 0 ? (
            <EmptyState
              label="No leads assigned to you"
              sub="Leads assigned by a manager appear here — oldest first so you work the backlog."
            />
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-soft/50 mb-2">
                {assignedLeads.length} lead{assignedLeads.length !== 1 ? 's' : ''} · oldest first
              </p>
              {assignedLeads.map(l => (
                <LeadRow key={l.id} lead={l} navigate={navigate} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Action modal */}
      {modal?.type === 'action' && (
        <ActionNoteModal
          title="Action Ticket"
          onConfirm={notes => handleAction(modal.ticketId, notes)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'confirm' && (
        <ActionNoteModal
          title="Confirm Ticket"
          onConfirm={notes => handleConfirm(modal.ticketId, notes)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
