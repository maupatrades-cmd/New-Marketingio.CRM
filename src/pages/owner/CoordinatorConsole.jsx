import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Shield, Phone, Calendar, ClipboardList,
  CheckCircle2, XCircle, RotateCcw, Bell,
  UserPlus, AlertTriangle, Clock, ChevronRight,
  MessageSquare, RefreshCw, TrendingUp, TrendingDown,
  Minus, BarChart2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

// ─── Urgency badge ─────────────────────────────────────────────────────────────
function UrgencyBadge({ urgency }) {
  const map = {
    unassigned: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
    overdue:    'border-red-500/40 bg-red-500/10 text-red-300',
    due_today:  'border-amber-500/40 bg-amber-500/10 text-amber-300',
    on_time:    'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  };
  const icon = { unassigned: '⚪', overdue: '🔴', due_today: '🟡', on_time: '🟢' };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${map[urgency] || ''}`}>
      {icon[urgency] || ''} {urgency?.replace('_', ' ')}
    </span>
  );
}

// ─── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ icon: Icon, title, badge, badgeColor, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const badgeStyle = badgeColor === 'red' ? 'bg-red-500' : badgeColor === 'amber' ? 'bg-amber-500' : 'bg-brand';
  return (
    <div className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 p-5 text-left hover:bg-white/5 transition"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-soft shrink-0"/>
          <span className="font-display text-lg text-white">{title}</span>
          {badge != null && badge > 0 && (
            <span className={`rounded-full px-2 py-0.5 text-xs text-white ${badgeStyle}`}>
              {badge}
            </span>
          )}
        </div>
        <ChevronRight size={16} className={`text-soft transition-transform ${open ? 'rotate-90' : ''}`}/>
      </button>
      {open && <div className="border-t border-darkbg-border px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

// ─── Panel 1: Verification Gate ────────────────────────────────────────────────
function VerificationGate() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['coordinator-verif'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pending_lead_verifications', { p_limit: 50 });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  async function verify(leadId) {
    setBusyId(leadId);
    const { error } = await supabase.rpc('verify_lead', { p_lead_id: leadId });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead verified ✓');
    qc.invalidateQueries({ queryKey: ['coordinator-verif'] });
  }

  async function reject(leadId) {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason?.trim()) return;
    setBusyId(leadId);
    const { error } = await supabase.rpc('reject_lead', { p_lead_id: leadId, p_reason: reason.trim() });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead rejected');
    qc.invalidateQueries({ queryKey: ['coordinator-verif'] });
  }

  const redCount = leads.filter(l => l.hours_since_submission > 8).length;

  return (
    <Panel icon={Shield} title="Verification Gate" badge={leads.length} badgeColor={redCount > 0 ? 'red' : 'brand'}>
      {isLoading ? (
        <p className="text-soft text-sm">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="text-soft text-sm">No leads pending verification ✓</p>
      ) : (
        <div className="space-y-2">
          {leads.map(l => (
            <div key={l.lead_id} className="rounded-lg border border-darkbg-border bg-darkbg-800/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{l.business_name}</p>
                  <p className="text-xs text-soft mt-0.5">
                    {l.submitted_by_name} · {l.submitted_by_role} · {l.hours_since_submission}h ago
                  </p>
                  {l.industry && <p className="text-xs text-soft">{l.industry} · {l.source}</p>}
                </div>
                {l.hours_since_submission > 8 && (
                  <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                    🔴 {Math.round(l.hours_since_submission)}h
                  </span>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => verify(l.lead_id)}
                  disabled={busyId === l.lead_id}
                  className="inline-flex items-center gap-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition">
                  <CheckCircle2 size={12}/> Verify
                </button>
                <button
                  onClick={() => reject(l.lead_id)}
                  disabled={busyId === l.lead_id}
                  className="inline-flex items-center gap-1.5 rounded bg-red-500/10 border border-red-500/30 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition">
                  <XCircle size={12}/> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── Panel 2: Follow-Up Tracker ────────────────────────────────────────────────
function FollowUpTracker() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [reassignId, setReassignId] = useState(null);
  const [reassignTarget, setReassignTarget] = useState('');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['coordinator-followups', filter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_follow_ups', { p_filter: filter });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['coordinator-staff'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, role, profiles!inner(full_name, email)')
        .in('role', ['field_agent', 'cpc', 'admin', 'owner']);
      return (data || []).map(r => ({ id: r.user_id, name: r.profiles?.full_name || r.profiles?.email, role: r.role }));
    },
    staleTime: 300_000,
  });

  async function nudge(taskId) {
    setBusyId(taskId);
    const { error } = await supabase.rpc('nudge_task_owner', { p_task_id: taskId });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Nudge sent ✓');
  }

  async function reassign(taskId) {
    if (!reassignTarget) return;
    setBusyId(taskId);
    const { error } = await supabase.rpc('reassign_task', { p_task_id: taskId, p_new_assignee_id: reassignTarget });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Task reassigned ✓');
    setReassignId(null);
    setReassignTarget('');
    qc.invalidateQueries({ queryKey: ['coordinator-followups'] });
  }

  const unassigned = tasks.filter(t => t.urgency === 'unassigned').length;
  const overdue = tasks.filter(t => t.urgency === 'overdue').length;
  const badgeCount = unassigned + overdue;

  const FILTERS = ['all', 'unassigned', 'overdue', 'due_today'];

  return (
    <Panel icon={Phone} title="Follow-Up Tracker" badge={badgeCount} badgeColor={badgeCount > 0 ? 'red' : 'brand'}>
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === f ? 'border-brand bg-brand/20 text-white' : 'border-darkbg-border text-soft hover:border-white/30'
            }`}>
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-soft text-sm">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-soft text-sm">No follow-ups matching this filter ✓</p>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => (
            <div key={t.task_id} className="rounded-lg border border-darkbg-border bg-darkbg-800/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{t.title}</p>
                  <p className="text-xs text-soft mt-0.5">
                    {t.lead_name || t.client_name || '—'} ·{' '}
                    {t.assigned_to_name || <span className="text-amber-300">⚪ Unassigned</span>}
                    {t.due_date && ` · Due ${t.due_date}`}
                    {t.days_overdue > 0 && <span className="text-red-300"> · {t.days_overdue}d overdue</span>}
                  </p>
                </div>
                <UrgencyBadge urgency={t.urgency}/>
              </div>

              {reassignId === t.task_id ? (
                <div className="mt-2 flex gap-2 items-center">
                  <select value={reassignTarget} onChange={e => setReassignTarget(e.target.value)} className="input flex-1 text-xs py-1">
                    <option value="">Select staff…</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                  </select>
                  <button onClick={() => reassign(t.task_id)} disabled={!reassignTarget || busyId === t.task_id}
                    className="rounded bg-brand/20 border border-brand/30 px-2 py-1 text-xs text-white hover:bg-brand/30 disabled:opacity-50">
                    Save
                  </button>
                  <button onClick={() => { setReassignId(null); setReassignTarget(''); }}
                    className="rounded border border-darkbg-border px-2 py-1 text-xs text-soft hover:text-white">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => nudge(t.task_id)} disabled={busyId === t.task_id}
                    className="inline-flex items-center gap-1.5 rounded bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition">
                    <Bell size={12}/> Nudge
                  </button>
                  <button onClick={() => { setReassignId(t.task_id); setReassignTarget(''); }}
                    className="inline-flex items-center gap-1.5 rounded bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-xs text-blue-300 hover:bg-blue-500/20 transition">
                    <UserPlus size={12}/> {t.assigned_to ? 'Reassign' : 'Assign'}
                  </button>
                  {(t.lead_id) && (
                    <button onClick={() => navigate(`/owner/leads/${t.lead_id}/inbox`)}
                      className="inline-flex items-center gap-1.5 rounded border border-darkbg-border px-3 py-1 text-xs text-soft hover:text-white transition">
                      <ChevronRight size={12}/> View Lead
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── Panel 3: Appointment Oversight ────────────────────────────────────────────
function AppointmentOversight() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);

  const { data: appts = [], isLoading } = useQuery({
    queryKey: ['coordinator-appointments'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_appointment_oversight', { p_window_days: 7 });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  async function confirm(apptId) {
    setBusyId(apptId);
    const { error } = await supabase.rpc('confirm_appointment', { p_appointment_id: apptId });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Appointment confirmed ✓');
    qc.invalidateQueries({ queryKey: ['coordinator-appointments'] });
  }

  async function cancel(apptId) {
    setBusyId(apptId);
    const { error } = await supabase.rpc('cancel_appointment', { p_appointment_id: apptId });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Appointment cancelled');
    qc.invalidateQueries({ queryKey: ['coordinator-appointments'] });
  }

  const TYPE_EMOJI = {
    shop_visit: '🏪', pitch_meeting: '🎯', onboarding_call: '📞', strategy_session: '🧠',
    review_meeting: '📊', contract_signing: '✍️', photo_shoot: '📸', video_shoot: '🎬',
    follow_up: '🔄', client_check_in: '👋', site_survey: '📍', other: '📋',
  };

  const unconfirmed = appts.filter(a => !a.confirmed_at && !a.is_past).length;

  return (
    <Panel icon={Calendar} title="Appointment Oversight" badge={unconfirmed > 0 ? unconfirmed : appts.length} badgeColor={unconfirmed > 0 ? 'amber' : 'brand'}>
      {isLoading ? (
        <p className="text-soft text-sm">Loading…</p>
      ) : appts.length === 0 ? (
        <p className="text-soft text-sm">No appointments in the next 7 days</p>
      ) : (
        <div className="space-y-2">
          {appts.map(a => (
            <div key={a.appointment_id} className="rounded-lg border border-darkbg-border bg-darkbg-800/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="text-xl shrink-0">{TYPE_EMOJI[a.appointment_type] || '📋'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {a.appointment_type.replace(/_/g, ' ')}
                      {a.lead_name && <span className="text-soft"> · {a.lead_name}</span>}
                      {a.client_name && !a.lead_name && <span className="text-soft"> · {a.client_name}</span>}
                    </p>
                    <p className="text-xs text-soft mt-0.5">
                      {new Date(a.scheduled_at).toLocaleString()} · {a.duration_minutes}min
                      {a.assigned_to_name && ` · ${a.assigned_to_name}`}
                    </p>
                    {a.location && <p className="text-xs text-soft">{a.location}</p>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {a.confirmed_at ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">✓ Confirmed</span>
                  ) : a.is_past ? (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">No-show?</span>
                  ) : (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">Unconfirmed</span>
                  )}
                  {!a.is_past && a.hours_until != null && (
                    <span className="text-xs text-soft">{a.hours_until > 0 ? `${a.hours_until}h away` : 'Now'}</span>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {!a.confirmed_at && !a.is_past && (
                  <button onClick={() => confirm(a.appointment_id)} disabled={busyId === a.appointment_id}
                    className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition">
                    <CheckCircle2 size={12}/> Confirm
                  </button>
                )}
                {a.is_past && a.status === 'scheduled' && (
                  <button onClick={() => navigate(`/owner/appointments/new${a.lead_id ? '?lead=' + a.lead_id : ''}`)}
                    className="inline-flex items-center gap-1.5 rounded bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-xs text-blue-300 hover:bg-blue-500/20 transition">
                    <RotateCcw size={12}/> Re-book
                  </button>
                )}
                {a.status === 'scheduled' && (
                  <button onClick={() => cancel(a.appointment_id)} disabled={busyId === a.appointment_id}
                    className="inline-flex items-center gap-1.5 rounded bg-red-500/10 border border-red-500/30 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition">
                    <XCircle size={12}/> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── Panel 5: Document & Obligations Board ─────────────────────────────────────
function ObligationsBoard() {
  const qc = useQueryClient();
  const [scope, setScope] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const { data: obligations = [], isLoading } = useQuery({
    queryKey: ['coordinator-obligations', scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_obligations', { p_scope: scope });
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  async function verify(obligationId) {
    setBusyId(obligationId);
    const { error } = await supabase.rpc('verify_client_obligation', { p_obligation_id: obligationId });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Obligation verified ✓');
    qc.invalidateQueries({ queryKey: ['coordinator-obligations'] });
  }

  const blockers = obligations.filter(o => o.is_blocker).length;
  const old = obligations.filter(o => o.days_open > 7).length;
  const badgeCount = blockers + old;

  return (
    <Panel icon={ClipboardList} title="Document & Obligations" badge={obligations.length} badgeColor={badgeCount > 0 ? 'red' : 'brand'}>
      <div className="flex flex-wrap gap-2 mb-4">
        {['all', 'client', 'staff'].map(s => (
          <button key={s} onClick={() => setScope(s)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
              scope === s ? 'border-brand bg-brand/20 text-white' : 'border-darkbg-border text-soft hover:border-white/30'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-soft text-sm">Loading…</p>
      ) : obligations.length === 0 ? (
        <p className="text-soft text-sm">No open obligations ✓</p>
      ) : (
        <div className="space-y-2">
          {obligations.map(o => (
            <div key={o.obligation_id} className="rounded-lg border border-darkbg-border bg-darkbg-800/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{o.entity_name}</p>
                    {o.is_blocker && (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-xs text-red-300">🚨 blocker</span>
                    )}
                    <span className={`rounded-full border px-1.5 py-0.5 text-xs ${
                      o.scope === 'client' ? 'border-blue-500/30 text-blue-300' : 'border-purple-500/30 text-purple-300'
                    }`}>{o.scope}</span>
                  </div>
                  <p className="text-xs text-soft mt-0.5">
                    {o.obligation_type.replace(/_/g, ' ')} · {o.days_open}d open
                    {o.assigned_to_name && ` · ${o.assigned_to_name}`}
                  </p>
                  {o.description && o.description !== o.obligation_type && (
                    <p className="text-xs text-soft">{o.description}</p>
                  )}
                </div>
                {o.days_open > 7 && (
                  <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                    🔴 {o.days_open}d
                  </span>
                )}
              </div>
              {o.scope === 'client' && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => verify(o.obligation_id)} disabled={busyId === o.obligation_id}
                    className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition">
                    <CheckCircle2 size={12}/> Verify
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CoordinatorConsole() {
  const { role } = useAuth();
  const qc = useQueryClient();

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['coordinator-verif'] });
    qc.invalidateQueries({ queryKey: ['coordinator-followups'] });
    qc.invalidateQueries({ queryKey: ['coordinator-appointments'] });
    qc.invalidateQueries({ queryKey: ['coordinator-obligations'] });
    toast.success('Refreshed');
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl"><span className="text-gradient">Coordinator Console</span></h1>
          <p className="mt-1 text-sm text-soft">Track, assign and chase — your whole day on one screen.</p>
        </div>
        <button onClick={refreshAll}
          className="inline-flex items-center gap-2 rounded-lg border border-darkbg-border px-3 py-2 text-sm text-soft hover:text-white transition">
          <RefreshCw size={14}/> Refresh
        </button>
      </header>

      <VerificationGate/>
      <FollowUpTracker/>
      <AppointmentOversight/>
      <ObligationsBoard/>
      <WeeklyNumbers/>
    </div>
  );
}

// ─── Panel 6: Weekly Numbers ──────────────────────────────────────────────────
const WEEK_OPTIONS = [
  { label: 'This week', offset: 0 },
  { label: 'Last week', offset: 7 },
  { label: '2 weeks ago', offset: 14 },
];

function delta(curr, prev) {
  if (prev == null || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function DeltaBadge({ curr, prev, invert = false }) {
  const pct = delta(curr, prev);
  if (pct == null) return null;
  const positive = invert ? pct < 0 : pct > 0;
  const zero = pct === 0;
  if (zero) return <span className="text-xs text-soft flex items-center gap-0.5"><Minus size={10}/> 0%</span>;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${positive ? 'text-green-400' : 'text-red-400'}`}>
      {positive ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
      {Math.abs(pct)}%
    </span>
  );
}

function StatCard({ label, value, prev, invert, unit = '', format }) {
  const display = format ? format(value) : (value ?? '—');
  return (
    <div className="card p-4 space-y-1">
      <p className="text-xs text-soft">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-display font-bold text-white">
          {unit}{display}
        </span>
        {prev != null && <DeltaBadge curr={value} prev={prev} invert={invert}/>}
      </div>
    </div>
  );
}

function ComplianceBar({ due, onTime }) {
  const pct = due > 0 ? Math.round((onTime / due) * 100) : null;
  return (
    <div className="card p-4 space-y-2">
      <p className="text-xs text-soft">Follow-up compliance</p>
      {pct == null
        ? <p className="text-soft text-sm">— no data</p>
        : <>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-display font-bold text-white">{pct}%</span>
              <span className="text-xs text-soft">{onTime}/{due} tasks</span>
            </div>
            <div className="h-2 rounded-full bg-darkbg-800 overflow-hidden">
              <div className="h-full rounded-full bg-brandred transition-all" style={{ width: `${pct}%` }}/>
            </div>
          </>
      }
    </div>
  );
}

function WeeklyNumbers() {
  const [open, setOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekStart = (offset) => {
    const d = new Date();
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((day + 6) % 7) - offset);
    return mon.toISOString().split('T')[0];
  };

  const weekStart = getWeekStart(weekOffset);

  const { data, isLoading } = useQuery({
    queryKey: ['coordinator-weekly', weekStart],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_coordinator_weekly_summary', { p_week_start: weekStart });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const fmt = (n) => n?.toLocaleString('en-ZA') ?? '—';

  return (
    <Panel
      icon={<BarChart2 size={16}/>}
      title="Weekly Numbers"
      badge={null}
      open={open}
      onToggle={() => setOpen(o => !o)}
    >
      {/* Week selector */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {WEEK_OPTIONS.map(opt => (
          <button key={opt.offset}
            onClick={() => setWeekOffset(opt.offset)}
            className={`px-3 py-1 rounded-full text-xs border transition ${
              weekOffset === opt.offset
                ? 'bg-brandred border-brandred text-white'
                : 'border-darkbg-border text-soft hover:text-white'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-soft text-sm py-4 text-center">Loading…</p>}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Leads in" value={data.leads_in} prev={data.leads_in_prev}/>
          <StatCard label="Leads qualified" value={data.leads_qualified} prev={data.leads_qualified_prev}/>
          <StatCard label="Appointments held" value={data.appts_held} prev={data.appts_held_prev}/>
          <StatCard label="No-shows" value={data.no_shows} prev={data.no_shows_prev} invert/>
          <StatCard label="Deals closed" value={data.deals_count} prev={data.deals_count_prev}/>
          <StatCard label="Deals value" value={data.deals_value} prev={data.deals_value_prev}
            format={v => 'R' + (v?.toLocaleString('en-ZA') ?? '0')}/>
          <ComplianceBar due={data.follow_up_tasks_due} onTime={data.follow_up_tasks_on_time}/>
          <div className="card p-4 space-y-2">
            <p className="text-xs text-soft">Invoices</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-soft">Issued</span><span>{data.invoices_issued}</span></div>
              <div className="flex justify-between"><span className="text-soft">Paid</span><span className="text-green-400">{data.invoices_paid}</span></div>
              <div className="flex justify-between"><span className="text-soft">Overdue</span><span className="text-red-400">{data.invoices_overdue}</span></div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
