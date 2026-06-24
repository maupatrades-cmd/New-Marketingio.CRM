import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Phone, Mail, MapPin, Loader2,
  MessageSquare, Send, X, Plus, Ticket,
  Flame, Thermometer, Snowflake, AlertTriangle, Clock,
  CheckCircle2, XCircle, CornerDownRight,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageDays(iso) { return (Date.now() - new Date(iso).getTime()) / 86_400_000; }
function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtAge(iso) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TempBadge({ temp }) {
  if (!temp || temp === 'cold') return <span className="inline-flex items-center gap-1 text-[10px] text-blue-400"><Snowflake size={10} /> Cold</span>;
  if (temp === 'warm')          return <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400"><Thermometer size={10} /> Warm</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-400"><Flame size={10} /> Hot</span>;
}

function StatusBadge({ status }) {
  const map = {
    pending_verification: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/30',
    verified:             'bg-green-500/15 text-green-400 ring-green-500/30',
    rejected:             'bg-red-500/15 text-red-400 ring-red-500/30',
    contacted:            'bg-blue-500/15 text-blue-400 ring-blue-500/30',
    converted:            'bg-purple-500/15 text-purple-400 ring-purple-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest ring-1 ${map[status] ?? 'bg-darkbg-700 text-soft ring-darkbg-border'}`}>
      {(status ?? '—').replace(/_/g, ' ')}
    </span>
  );
}

function StatusDot({ status }) {
  const map = {
    open:'bg-blue-400', actioned:'bg-yellow-400', confirmed:'bg-green-400',
    closed:'bg-darkbg-border', cancelled:'bg-red-400/50',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status] ?? 'bg-soft'}`} />;
}

// ─── New ticket modal ─────────────────────────────────────────────────────────

function NewTicketModal({ leadId, ticketTypes, staff, onClose, onCreated }) {
  const [step, setStep]         = useState('pick'); // 'pick' | 'fill'
  const [chosen, setChosen]     = useState(null);
  const [toUserId, setToUserId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [body, setBody]         = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Group by category, keyed by category_label for display (RPC returns both).
  const grouped = useMemo(() => {
    const out = {};
    for (const t of ticketTypes ?? []) {
      const key = t.category_label ?? t.category ?? 'Other';
      (out[key] ??= []).push(t);
    }
    return out;
  }, [ticketTypes]);

  async function submit() {
    setSubmitting(true);
    const { error } = await supabase.rpc('create_lead_ticket', {
      p_lead_id: leadId,
      p_ticket_type_code: chosen.code,
      p_to_user_id: toUserId || null,
      p_to_role: null,
      p_subject: null,
      p_body: body.trim() || null,
      p_priority: priority,
      p_related_deal_id: null,
    });
    setSubmitting(false);
    if (error) { toast.error(`Couldn't create ticket: ${error.message}`); return; }
    toast.success(`Ticket created: ${chosen.label}`);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-darkbg-border bg-darkbg-800 shadow-2xl">
        <header className="flex items-center justify-between border-b border-darkbg-border/50 px-6 py-4 shrink-0">
          <div>
            <h2 className="font-display text-lg text-gradient">
              {step === 'pick' ? 'New Ticket — pick type' : `New Ticket: ${chosen?.emoji} ${chosen?.label}`}
            </h2>
            {step === 'pick' && <p className="text-xs text-soft mt-0.5">{ticketTypes.length} actions · {Object.keys(grouped).length} categories</p>}
          </div>
          <button onClick={onClose} className="text-soft hover:text-white"><X size={18} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'pick' ? (
            <div className="space-y-5">
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-soft/60 mb-2">
                    {cat}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map(t => (
                      <button
                        key={t.code}
                        onClick={() => { setChosen(t); setStep('fill'); }}
                        className="flex items-center gap-2 rounded-lg border border-darkbg-border bg-darkbg-700/40 px-3 py-2 text-left transition hover:border-brandred/50 hover:bg-darkbg-700"
                      >
                        <span className="text-base">{t.emoji}</span>
                        <span className="text-xs font-semibold text-white">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Ticket hint — plain English, no internal routing codes */}
              {chosen.notes && (
                <div className="rounded-lg border border-darkbg-border/50 bg-darkbg-700/30 px-3 py-2">
                  <p className="text-[11px] text-soft">{chosen.notes}</p>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-soft mb-1.5 block">Send to</label>
                <select
                  value={toUserId}
                  onChange={e => setToUserId(e.target.value)}
                  className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white focus:border-brandred focus:outline-none"
                >
                  <option value="">— No specific person (general ticket) —</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} · {({ field_agent:'Field Agent', cpc:'CPC', admin:'Admin', owner:'Owner', head_of_tech:'Head of Tech' })[s.role] ?? s.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-soft mb-1.5 block">Priority</label>
                <div className="flex gap-1.5">
                  {['low', 'normal', 'high', 'urgent'].map(p => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                        priority === p
                          ? p === 'urgent' ? 'border-red-500 bg-red-500/15 text-red-400'
                          : p === 'high'   ? 'border-orange-500 bg-orange-500/15 text-orange-400'
                          : 'border-brandred bg-brandred/15 text-white'
                          : 'border-darkbg-border bg-darkbg-700/40 text-soft hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-soft mb-1.5 block">Notes (optional)</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={4}
                  placeholder="Add context, instructions, or what you need…"
                  className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {step === 'fill' && (
          <footer className="flex justify-between gap-2 border-t border-darkbg-border/50 px-6 py-4 shrink-0">
            <button onClick={() => setStep('pick')} className="btn-ghost text-xs">← Back</button>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white hover:bg-brandred/80 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Create ticket
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

// ─── Timeline entry ───────────────────────────────────────────────────────────

function TimelineEntry({ entry, userId, onAction, onConfirm, onCancel, onClose }) {
  const isTicket = entry.entry_type === 'ticket';
  const isMine   = entry.actor_id === userId;

  if (!isTicket) {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center shrink-0">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-darkbg-700 ring-2 ring-darkbg-border">
            <MessageSquare size={12} className="text-soft" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="rounded-lg border border-darkbg-border bg-darkbg-800/50 p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-white">{entry.actor_name}</span>
              <span className="text-[10px] text-soft/60">{fmtDateTime(entry.created_at)} · {fmtAge(entry.created_at)}</span>
            </div>
            <p className="text-sm text-soft whitespace-pre-wrap">{entry.detail}</p>
          </div>
        </div>
      </div>
    );
  }

  // Ticket entry — needs latest state, but timeline gives snapshot at create time.
  // For actions we need the live status — entry.status is current status from RPC.
  const canAction  = entry.status === 'open';
  const canConfirm = entry.status === 'actioned';
  const canCancel  = entry.status === 'open' && isMine;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-blue-500/15 ring-2 ring-blue-500/30">
          <Ticket size={12} className="text-blue-400" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`rounded-lg border bg-darkbg-800/50 p-3 ${
          entry.priority === 'urgent' ? 'border-red-500/40' :
          entry.priority === 'high'   ? 'border-orange-500/30' :
          'border-darkbg-border'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <StatusDot status={entry.status} />
              <span className="text-xs font-semibold text-white truncate">{entry.event_label}</span>
            </div>
            <span className="text-[10px] text-soft/60 shrink-0">{fmtDateTime(entry.created_at)} · {fmtAge(entry.created_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-soft mb-1.5">
            <span>by <span className="text-white/80">{entry.actor_name}</span></span>
            <span>·</span>
            <span className="uppercase tracking-widest">{entry.priority}</span>
            <span>·</span>
            <span className="uppercase tracking-widest">{entry.status}</span>
          </div>
          {entry.detail && <p className="text-sm text-soft whitespace-pre-wrap">{entry.detail}</p>}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {canAction && (
              <button onClick={() => onAction(entry.entry_id)}
                className="inline-flex items-center gap-1 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-[11px] font-semibold text-yellow-400 hover:bg-yellow-500/20">
                <CheckCircle2 size={10} /> Action
              </button>
            )}
            {canConfirm && (
              <button onClick={() => onConfirm(entry.entry_id)}
                className="inline-flex items-center gap-1 rounded-md border border-green-500/40 bg-green-500/10 px-2 py-1 text-[11px] font-semibold text-green-400 hover:bg-green-500/20">
                <CheckCircle2 size={10} /> Confirm
              </button>
            )}
            {entry.status === 'confirmed' && (
              <button onClick={() => onClose(entry.entry_id)}
                className="inline-flex items-center gap-1 rounded-md border border-darkbg-border bg-darkbg-700/60 px-2 py-1 text-[11px] font-semibold text-soft hover:text-white">
                Close
              </button>
            )}
            {canCancel && (
              <button onClick={() => onCancel(entry.entry_id)}
                className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20">
                <XCircle size={10} /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function LeadDetail() {
  const { leadId }  = useParams();
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const qc          = useQueryClient();

  const [newTicket, setNewTicket] = useState(false);
  const [comment,   setComment]   = useState('');
  const [posting,   setPosting]   = useState(false);

  // ── Lead ──────────────────────────────────────────────────────────────────
  const { data: lead, isLoading: leadLoading, error: leadError } = useQuery({
    queryKey: ['lead-detail', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id,business_name,contact_person,phone,email,address,industry,source,status,lead_temperature,interest_package,keenness,notes,rejection_reason,submitted_by,submitted_by_name,submitted_by_role,assigned_to,open_ticket_count,last_activity_at,last_activity_type,created_at')
        .eq('id', leadId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ── Timeline (tickets + comments via RPC) ─────────────────────────────────
  const { data: timeline = [], isLoading: timelineLoading, refetch: refetchTimeline } = useQuery({
    queryKey: ['lead-timeline', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_lead_full_history', { p_lead_id: leadId });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });

  // ── Ticket types (role-filtered, lead-state-filtered via RPC) ────────────
  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['ticket-types', leadId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_available_ticket_types', {
        p_lead_id: leadId,
        p_include_system: false,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    enabled: !!leadId,
  });

  // ── Staff (for routing) ───────────────────────────────────────────────────
  const { data: staff = [] } = useQuery({
    queryKey: ['lead-detail-staff'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, role, profiles(id, full_name)')
        .in('role', ['owner','admin','head_of_tech','field_agent','cpc']);
      return (data ?? []).map(r => ({
        id: r.user_id,
        full_name: r.profiles?.full_name ?? 'Unknown',
        role: r.role,
      }));
    },
    staleTime: 300_000,
  });

  function refetchAll() {
    refetchTimeline();
    qc.invalidateQueries({ queryKey: ['lead-detail', leadId] });
    qc.invalidateQueries({ queryKey: ['li-summary'] });
    qc.invalidateQueries({ queryKey: ['li-tickets'] });
  }

  async function postComment() {
    if (!comment.trim()) return;
    setPosting(true);
    const { error } = await supabase.rpc('add_lead_comment', {
      p_lead_id: leadId, p_body: comment.trim(),
    });
    setPosting(false);
    if (error) { toast.error(`Couldn't post comment: ${error.message}`); return; }
    setComment('');
    toast.success('Comment posted');
    refetchTimeline();
  }

  async function actionTicket(id) {
    const { error } = await supabase.rpc('action_lead_ticket', { p_ticket_id: id, p_notes: null });
    if (error) { toast.error(`Action failed: ${error.message}`); return; }
    toast.success('Ticket actioned'); refetchAll();
  }
  async function confirmTicket(id) {
    const { error } = await supabase.rpc('confirm_lead_ticket', { p_ticket_id: id, p_notes: null });
    if (error) { toast.error(`Confirm failed: ${error.message}`); return; }
    toast.success('Ticket confirmed'); refetchAll();
  }
  async function closeTicket(id) {
    const { error } = await supabase.rpc('close_lead_ticket', { p_ticket_id: id });
    if (error) { toast.error(`Close failed: ${error.message}`); return; }
    toast.success('Ticket closed'); refetchAll();
  }
  async function cancelTicket(id) {
    const { error } = await supabase.rpc('cancel_lead_ticket', { p_ticket_id: id, p_reason: null });
    if (error) { toast.error(`Cancel failed: ${error.message}`); return; }
    toast.success('Ticket cancelled'); refetchAll();
  }

  // Chronological — oldest first inside the timeline
  const ordered = useMemo(
    () => [...timeline].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [timeline],
  );

  if (leadLoading) {
    return <div className="grid place-items-center py-20"><Loader2 size={28} className="animate-spin text-soft" /></div>;
  }
  if (leadError || !lead) {
    return (
      <div className="space-y-3">
        <Link to="/owner/leads/inbox" className="inline-flex items-center gap-1 text-sm text-soft hover:text-white"><ArrowLeft size={14} /> Back to Inbox</Link>
        <p className="text-red-400">Couldn't load lead: {leadError?.message ?? 'not found'}</p>
      </div>
    );
  }

  const overdue = ageDays(lead.created_at) >= 3;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link to="/owner/leads/inbox" className="inline-flex items-center gap-1 text-xs text-soft hover:text-white">
        <ArrowLeft size={12} /> Back to Inbox
      </Link>

      {/* Lead header */}
      <div className={`rounded-2xl border bg-darkbg-800/60 p-5 ${
        overdue ? 'border-red-500/30' : 'border-darkbg-border'
      }`}>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-soft mb-1">Lead</p>
            <h1 className="font-display text-2xl text-white">{lead.business_name}</h1>
            {lead.contact_person && <p className="text-sm text-soft mt-0.5">{lead.contact_person}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={lead.status} />
              <TempBadge temp={lead.lead_temperature} />
              {(lead.open_ticket_count ?? 0) > 0 && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                  lead.open_ticket_count >= 5
                    ? 'bg-red-500/20 text-red-400 ring-red-500/40'
                    : 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
                }`}>
                  <Ticket size={9} /> {lead.open_ticket_count} open
                </span>
              )}
              {overdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400 ring-1 ring-red-500/30">
                  <AlertTriangle size={9} /> {Math.floor(ageDays(lead.created_at))}d old
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setNewTicket(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white hover:bg-brandred/80"
          >
            <Plus size={12} /> New Ticket
          </button>
        </div>

        {/* Contact grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs text-soft">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 hover:text-white">
              <Phone size={11} /> {lead.phone}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 hover:text-white truncate">
              <Mail size={11} /> {lead.email}
            </a>
          )}
          {lead.address && (
            <span className="flex items-center gap-2"><MapPin size={11} /> {lead.address}</span>
          )}
        </div>

        {/* Meta footer */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-darkbg-border/40 pt-3 text-[10px] text-soft/60">
          <span>Created {fmtDateTime(lead.created_at)} · {fmtAge(lead.created_at)}</span>
          {lead.submitted_by_name && <span>Submitted by {lead.submitted_by_name}</span>}
          {lead.industry && <span>Industry: {lead.industry}</span>}
          {lead.source && <span>Source: {lead.source}</span>}
        </div>

        {lead.rejection_reason && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-[10px] uppercase tracking-widest text-red-400/70">Rejection Reason</p>
            <p className="text-xs text-red-300 mt-1">{lead.rejection_reason}</p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/40 p-5">
        <header className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-gradient">Timeline</h2>
          <span className="text-[10px] uppercase tracking-widest text-soft">
            {ordered.length} {ordered.length === 1 ? 'entry' : 'entries'}
          </span>
        </header>

        {timelineLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-darkbg-700/40" />)}
          </div>
        ) : ordered.length === 0 ? (
          <p className="py-8 text-center text-sm text-soft">
            No activity yet. Open a ticket or post a comment to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {ordered.map(e => (
              <TimelineEntry
                key={`${e.entry_type}-${e.entry_id}`}
                entry={e} userId={user?.id}
                onAction={actionTicket} onConfirm={confirmTicket}
                onClose={closeTicket} onCancel={cancelTicket}
              />
            ))}
          </div>
        )}

        {/* Comment composer */}
        <div className="mt-5 rounded-xl border border-darkbg-border bg-darkbg-900/40 p-3">
          <p className="text-[10px] uppercase tracking-widest text-soft mb-2 flex items-center gap-1.5">
            <MessageSquare size={11} /> Add a comment
          </p>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={2}
            placeholder="Share an update, an insight, or context with anyone who has access to this lead…"
            className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none resize-none"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={postComment}
              disabled={!comment.trim() || posting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brandred px-3 py-1.5 text-xs font-semibold text-white hover:bg-brandred/80 disabled:opacity-40"
            >
              {posting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              Post
            </button>
          </div>
        </div>
      </div>

      {newTicket && (
        <NewTicketModal
          leadId={leadId}
          ticketTypes={ticketTypes}
          staff={staff}
          onClose={() => setNewTicket(false)}
          onCreated={refetchAll}
        />
      )}
    </div>
  );
}
