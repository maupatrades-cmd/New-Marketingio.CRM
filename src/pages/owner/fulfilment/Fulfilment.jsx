import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, Clock, AlertCircle, XCircle, RotateCcw,
  ChevronDown, Plus, Timer, Paperclip, User, Filter,
  ArrowRight, BarChart3
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const STATUS_ORDER = [
  'client_rejected','client_requested_changes','awaiting_client',
  'in_progress','not_started','approved','deemed_approved','completed','blocked'
];

const STATUS_LABELS = {
  not_started: 'Not Started', in_progress: 'In Progress',
  awaiting_client: 'Awaiting Client', client_reviewing: 'Client Reviewing',
  approved: 'Approved', deemed_approved: 'Auto-Approved', completed: 'Completed',
  blocked: 'Blocked', client_requested_changes: 'Changes Requested',
  client_rejected: 'Rejected',
};

const STATUS_COLORS = {
  not_started: 'bg-darkbg-800 text-soft border border-darkbg-border',
  in_progress: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  awaiting_client: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  client_reviewing: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  deemed_approved: 'bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/20',
  completed: 'bg-emerald-600/20 text-emerald-200 border border-emerald-600/30',
  blocked: 'bg-red-500/20 text-red-300 border border-red-500/30',
  client_requested_changes: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  client_rejected: 'bg-red-600/20 text-red-300 border border-red-600/40',
};

const PHASE_LABELS = { setup: 'Setup', monthly_recurring: 'Recurring', once_off: 'Once-off' };

const NEXT_STATUSES = {
  not_started: ['in_progress','blocked'],
  in_progress: ['awaiting_client','blocked','completed'],
  awaiting_client: [],
  client_reviewing: [],
  client_requested_changes: ['in_progress'],
  client_rejected: ['in_progress'],
  approved: ['completed'],
  deemed_approved: ['completed'],
  blocked: ['not_started','in_progress'],
  completed: [],
};

export default function Fulfilment() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [filters, setFilters] = useState({ phase: '', status: [], clientId: '', assignedTo: '', search: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [timeLogModal, setTimeLogModal] = useState(null); // deliverable object
  const [statusModal, setStatusModal] = useState(null);   // { del, newStatus }

  const isManager = ['owner','admin','head_of_tech'].includes(role);

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ['fulfilment', filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_fulfilment_deliverables', {
        p_phase: filters.phase || null,
        p_status: filters.status.length ? filters.status : null,
        p_client_id: filters.clientId || null,
        p_assigned: filters.assignedTo || null,
        p_search: filters.search || null,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isManager,
  });

  // Assignee view — field_agent / cpc see only their own deliverables
  const { data: myDeliverables = [], isLoading: myLoading } = useQuery({
    queryKey: ['my_deliverables'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('deliverables')
        .select('id,service_name,phase,status,client_name,deal_id,due_date,assigned_to_name')
        .eq('assigned_to', user.id)
        .not('status', 'in', '(completed)')
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !isManager,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles').select('id,full_name')
        .order('full_name');
      return data ?? [];
    },
  });

  const { data: clientsList = [] } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('clients').select('id,business_name,contact_person')
        .order('business_name');
      return data ?? [];
    },
  });

  const changeStatusMut = useMutation({
    mutationFn: async ({ id, status, notes }) => {
      const { error } = await supabase.rpc('change_deliverable_status', {
        p_deliverable_id: id, p_new_status: status, p_notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fulfilment'] }); toast.success('Status updated'); setStatusModal(null); },
    onError: (e) => {
      const msg = e.message || '';
      if (msg.includes('obligation_block')) toast.error(msg.split('obligation_block: ')[1] || 'Blocked by client obligation');
      else toast.error(msg);
    },
  });

  const assignMut = useMutation({
    mutationFn: async ({ id, staffId }) => {
      const { error } = await supabase.from('deliverables').update({ assigned_to: staffId || null, assigned_to_name: staff.find(s=>s.id===staffId)?.full_name||null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fulfilment'] }); toast.success('Assigned'); },
    onError: (e) => toast.error(e.message),
  });

  // Stats
  const stats = useMemo(() => ({
    total: deliverables.length,
    inProgress: deliverables.filter(d => d.status === 'in_progress').length,
    awaitingClient: deliverables.filter(d => d.status === 'awaiting_client').length,
    changesRequested: deliverables.filter(d => d.status === 'client_requested_changes').length,
    rejected: deliverables.filter(d => d.status === 'client_rejected').length,
    approved: deliverables.filter(d => ['approved','deemed_approved'].includes(d.status)).length,
  }), [deliverables]);

  if (!isManager) {
    if (myLoading) return <div className="text-soft">Loading your deliverables…</div>;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">My Deliverables</h1>
          <p className="text-soft text-sm mt-1">Active work assigned to you</p>
        </div>
        {myDeliverables.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="font-display text-lg text-white mb-2">No active deliverables</p>
            <p className="text-soft text-sm">You'll see work here once deals are won and deliverables are assigned to you.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myDeliverables.map(d => (
              <div key={d.id} className="card p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{d.service_name}</p>
                  <p className="text-xs text-soft truncate">{d.client_name} · {PHASE_LABELS[d.phase] ?? d.phase}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {d.due_date && (
                    <span className="text-xs text-soft">{new Date(d.due_date).toLocaleDateString('en-ZA', { day:'2-digit', month:'short' })}</span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_COLORS[d.status] || 'text-soft'}`}>
                    {STATUS_LABELS[d.status] ?? d.status}
                  </span>
                  <select
                    className="rounded border border-darkbg-border bg-darkbg-900/60 px-2 py-1 text-xs text-soft focus:border-brandred focus:outline-none"
                    value=""
                    onChange={(e) => { if (e.target.value) setStatusModal({ del: d, newStatus: e.target.value }); }}
                  >
                    <option value="">Move to…</option>
                    {(NEXT_STATUSES[d.status] || []).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
        {statusModal && statusModal.newStatus && (
          <StatusChangeModal
            del={statusModal.del}
            newStatus={statusModal.newStatus}
            onConfirm={(notes) => changeStatusMut.mutate({ id: statusModal.del.id, status: statusModal.newStatus, notes })}
            onClose={() => setStatusModal(null)}
            busy={changeStatusMut.isPending}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Fulfilment Workbench</h1>
          <p className="text-soft text-sm mt-1">Track every deliverable from setup to approval</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/owner/fulfilment/quality')} className="btn-ghost text-xs">
            <BarChart3 size={14}/> Quality
          </button>
          <button onClick={() => navigate('/owner/fulfilment/productivity')} className="btn-ghost text-xs">
            <Timer size={14}/> Productivity
          </button>
          <button onClick={() => setShowFilters(f => !f)} className="btn-ghost text-xs">
            <Filter size={14}/> {showFilters ? 'Hide' : 'Filters'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'In Progress', value: stats.inProgress, color: 'text-blue-400' },
          { label: 'With Client', value: stats.awaitingClient, color: 'text-amber-400' },
          { label: 'Changes Due', value: stats.changesRequested, color: 'text-orange-400' },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
          { label: 'Approved', value: stats.approved, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="card p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-soft text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card p-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="text-xs text-soft mb-1 block">Phase</label>
            <select className="input w-full text-sm" value={filters.phase}
              onChange={e => setFilters(f => ({...f, phase: e.target.value}))}>
              <option value="">All phases</option>
              <option value="setup">Setup</option>
              <option value="monthly_recurring">Recurring</option>
              <option value="once_off">Once-off</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-soft mb-1 block">Client</label>
            <select className="input w-full text-sm" value={filters.clientId}
              onChange={e => setFilters(f => ({...f, clientId: e.target.value}))}>
              <option value="">All clients</option>
              {clientsList.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_person}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-soft mb-1 block">Assigned to</label>
            <select className="input w-full text-sm" value={filters.assignedTo}
              onChange={e => setFilters(f => ({...f, assignedTo: e.target.value}))}>
              <option value="">Anyone</option>
              <option value="__unassigned__">Unassigned</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-soft mb-1 block">Search</label>
            <input className="input w-full text-sm" placeholder="Title or client…"
              value={filters.search} onChange={e => setFilters(f => ({...f, search: e.target.value}))} />
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="card p-12 text-center text-soft">Loading deliverables…</div>
      ) : deliverables.length === 0 ? (
        <div className="card p-12 text-center text-soft">No deliverables match your filters.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-darkbg-border text-left text-xs text-soft uppercase tracking-wider">
                  <th className="px-4 py-3">Deliverable</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Phase</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-darkbg-border">
                {deliverables.map(d => (
                  <DeliverableRow
                    key={d.id} del={d} staff={staff}
                    onStatusChange={(newStatus) => setStatusModal({ del: d, newStatus })}
                    onLogTime={() => setTimeLogModal(d)}
                    onAssign={(staffId) => assignMut.mutate({ id: d.id, staffId })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Time Log Modal */}
      {timeLogModal && (
        <TimeLogModal
          deliverable={timeLogModal}
          onClose={() => setTimeLogModal(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['fulfilment'] }); setTimeLogModal(null); }}
        />
      )}

      {/* Status change confirmation */}
      {statusModal && (
        <StatusChangeModal
          del={statusModal.del}
          newStatus={statusModal.newStatus}
          onConfirm={(notes) => changeStatusMut.mutate({ id: statusModal.del.id, status: statusModal.newStatus, notes })}
          onClose={() => setStatusModal(null)}
          busy={changeStatusMut.isPending}
        />
      )}
    </div>
  );
}

function DeliverableRow({ del, staff, onStatusChange, onLogTime, onAssign }) {
  const [showAssign, setShowAssign] = useState(false);
  const ageDays = Math.floor((Date.now() - new Date(del.created_at).getTime()) / 86400000);
  const isDueSoon = del.due_date && (new Date(del.due_date) - new Date()) / 86400000 < 3;
  const isOverdue = del.due_date && new Date(del.due_date) < new Date();

  const rowBorderColor =
    del.status === 'client_rejected' ? 'border-l-4 border-l-red-500' :
    del.status === 'client_requested_changes' ? 'border-l-4 border-l-orange-400' :
    del.status === 'awaiting_client' ? 'border-l-4 border-l-amber-400' : '';

  return (
    <tr className={`hover:bg-darkbg-800/40 transition ${rowBorderColor}`}>
      <td className="px-4 py-3 max-w-[220px]">
        <p className="font-medium text-white truncate">{del.title}</p>
        {del.product && <p className="text-xs text-soft truncate">{del.product}</p>}
      </td>
      <td className="px-4 py-3">
        <p className="text-sm">{del.client_name}</p>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-darkbg-800 text-soft border border-darkbg-border">
          {PHASE_LABELS[del.phase] ?? del.phase}
        </span>
      </td>
      <td className="px-4 py-3 relative">
        {showAssign ? (
          <div className="absolute z-20 top-0 left-0 mt-8 bg-darkbg-800 border border-darkbg-border rounded-xl shadow-xl min-w-[180px]">
            <div className="p-1">
              <button className="w-full text-left px-3 py-2 text-xs text-soft hover:bg-darkbg-700 rounded-lg"
                onClick={() => { onAssign(null); setShowAssign(false); }}>Unassign</button>
              {staff.map(s => (
                <button key={s.id} className="w-full text-left px-3 py-2 text-xs hover:bg-darkbg-700 rounded-lg"
                  onClick={() => { onAssign(s.id); setShowAssign(false); }}>
                  {s.full_name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button onClick={() => setShowAssign(v => !v)}
          className="flex items-center gap-1.5 text-sm hover:text-white transition">
          <User size={13} className="text-soft"/>
          <span className="text-soft">{del.assigned_name ?? 'Unassigned'}</span>
          <ChevronDown size={12} className="text-soft/50"/>
        </button>
      </td>
      <td className="px-4 py-3">
        <StatusDropdown current={del.status} onSelect={onStatusChange} />
      </td>
      <td className="px-4 py-3">
        {del.due_date ? (
          <span className={`text-xs font-medium ${isOverdue ? 'text-red-400' : isDueSoon ? 'text-amber-400' : 'text-soft'}`}>
            {new Date(del.due_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
          </span>
        ) : <span className="text-soft text-xs">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-soft">
        {del.hours_logged > 0 ? `${del.hours_logged}h` : '—'}
      </td>
      <td className="px-4 py-3">
        <button onClick={onLogTime}
          className="inline-flex items-center gap-1 rounded-lg border border-darkbg-border px-2 py-1 text-xs text-soft hover:text-white hover:border-brandred transition">
          <Plus size={11}/> Log time
        </button>
      </td>
    </tr>
  );
}

function StatusDropdown({ current, onSelect }) {
  const [open, setOpen] = useState(false);
  const nexts = NEXT_STATUSES[current] ?? [];

  return (
    <div className="relative">
      <button onClick={() => nexts.length > 0 && setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[current] ?? ''} ${nexts.length ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
        {STATUS_LABELS[current] ?? current}
        {nexts.length > 0 && <ChevronDown size={11}/>}
      </button>
      {open && (
        <div className="absolute z-20 top-8 left-0 bg-darkbg-800 border border-darkbg-border rounded-xl shadow-xl min-w-[180px]">
          <div className="p-1">
            {nexts.map(s => (
              <button key={s} className="w-full text-left px-3 py-2 text-xs hover:bg-darkbg-700 rounded-lg flex items-center gap-2"
                onClick={() => { onSelect(s); setOpen(false); }}>
                <ArrowRight size={11} className="text-soft"/>
                {STATUS_LABELS[s] ?? s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeLogModal({ deliverable, onClose, onSaved }) {
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const h = parseFloat(hours);
    if (!h || h <= 0 || h > 24) return toast.error('Hours must be 0.5–24');
    setBusy(true);
    try {
      const { error } = await supabase.rpc('log_time_on_deliverable', {
        p_deliverable_id: deliverable.id,
        p_hours: h,
        p_date_worked: date,
        p_description: desc || null,
      });
      if (error) throw error;
      toast.success('Time logged');
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="font-display text-lg font-bold mb-1">Log Time</h2>
        <p className="text-soft text-sm mb-5 truncate">{deliverable.title}</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-soft mb-1 block">Hours worked</label>
            <input type="number" step="0.5" min="0.5" max="24" required className="input w-full"
              placeholder="2.5" value={hours} onChange={e => setHours(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-soft mb-1 block">Date worked</label>
            <input type="date" required className="input w-full" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-soft mb-1 block">Description (optional)</label>
            <textarea className="input w-full resize-none" rows={2} placeholder="What did you work on?"
              value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatusChangeModal({ del, newStatus, onConfirm, onClose, busy }) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="font-display text-lg font-bold mb-1">Confirm Status Change</h2>
        <p className="text-soft text-sm mb-4">
          <span className="text-white">{del.title}</span>
          {' → '}
          <span className={`font-semibold ${STATUS_COLORS[newStatus]?.includes('emerald') ? 'text-emerald-400' : newStatus.includes('reject') ? 'text-red-400' : 'text-amber-400'}`}>
            {STATUS_LABELS[newStatus]}
          </span>
        </p>
        <div className="mb-5">
          <label className="text-xs text-soft mb-1 block">Notes (optional)</label>
          <textarea className="input w-full resize-none" rows={2}
            placeholder="Any notes for this status change…"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onConfirm(notes)} disabled={busy} className="btn-primary">
            {busy ? 'Updating…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
