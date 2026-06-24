import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Ticket as TicketIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import Modal from '../../components/Modal.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];

const STATUS_BADGE = {
  open:      'border-blue-500/40 bg-blue-500/10 text-blue-300',
  actioned:  'border-amber-500/40 bg-amber-500/10 text-amber-300',
  confirmed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  closed:    'border-darkbg-border bg-darkbg-900/60 text-soft',
  cancelled: 'border-darkbg-border bg-darkbg-900/60 text-soft line-through',
  disputed:  'border-brandred/40 bg-brandred/10 text-brandred',
};

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Tickets() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isManager = MANAGER_ROLES.includes(role);
  const [filter, setFilter] = useState('mine'); // 'mine' | 'all'

  // Reassign / dispute modals.
  const [reassign, setReassign] = useState(null); // ticket
  const [reassignTo, setReassignTo] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [dispute, setDispute] = useState(null); // ticket
  const [disputeReason, setDisputeReason] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets', filter, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('lead_tickets').select('*').order('created_at', { ascending: false }).limit(200);
      if (filter === 'mine') {
        q = q.or(`to_user_id.eq.${user.id},from_user_id.eq.${user.id}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: people } = useQuery({
    queryKey: ['tickets-people'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email');
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameById = useMemo(() => {
    const m = new Map();
    for (const p of people ?? []) m.set(p.id, p.full_name || p.email);
    return m;
  }, [people]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  }

  async function callRpc(fn, params, successMsg) {
    const { error } = await supabase.rpc(fn, params);
    if (error) toast.error(error.message);
    else { toast.success(successMsg); refresh(); }
  }

  async function onAction(t) {
    const notes = window.prompt('Notes (optional)') || null;
    await callRpc('action_lead_ticket', { p_ticket_id: t.id, p_notes: notes }, 'Ticket actioned');
  }
  async function onConfirm(t) {
    const notes = window.prompt('Confirmation notes (optional)') || null;
    await callRpc('confirm_lead_ticket', { p_ticket_id: t.id, p_notes: notes }, 'Ticket confirmed');
  }
  async function onClose(t) {
    await callRpc('close_lead_ticket', { p_ticket_id: t.id }, 'Ticket closed');
  }

  async function submitReassign() {
    if (!reassignTo) { toast.error('Pick an assignee'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('reassign_lead_ticket', {
      p_ticket_id: reassign.id, p_new_to_user_id: reassignTo, p_reason: reassignReason || null,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success('Ticket reassigned'); setReassign(null); setReassignTo(''); setReassignReason(''); refresh(); }
  }

  async function submitDispute() {
    if (!disputeReason.trim()) { toast.error('Reason is required'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('dispute_lead_ticket', {
      p_ticket_id: dispute.id, p_reason: disputeReason,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success('Ticket disputed'); setDispute(null); setDisputeReason(''); refresh(); }
  }

  function buttonsFor(t) {
    const mineToMe = t.to_user_id === user.id;
    const mineFromMe = t.from_user_id === user.id;
    const btns = [];

    if (t.status === 'open' && mineToMe) {
      btns.push(<Btn key="a" kind="primary" onClick={() => onAction(t)}>Mark actioned</Btn>);
      if (isManager) btns.push(<Btn key="r" onClick={() => setReassign(t)}>Reassign</Btn>);
      btns.push(<Btn key="d" kind="danger" onClick={() => setDispute(t)}>Dispute</Btn>);
    } else if (t.status === 'actioned' && mineFromMe) {
      btns.push(<Btn key="c" kind="primary" onClick={() => onConfirm(t)}>Confirm</Btn>);
      btns.push(<Btn key="d" kind="danger" onClick={() => setDispute(t)}>Dispute</Btn>);
    } else if (t.status === 'actioned' && mineToMe) {
      return <span className="text-xs text-soft">Waiting on {nameById.get(t.from_user_id) || 'creator'} to confirm</span>;
    } else if (t.status === 'confirmed') {
      if (isManager || mineToMe || mineFromMe) btns.push(<Btn key="cl" kind="primary" onClick={() => onClose(t)}>Close</Btn>);
    } else if (t.status === 'disputed') {
      if (role === 'owner') {
        btns.push(<Btn key="re" onClick={() => setReassign(t)}>Reassign</Btn>);
        btns.push(<Btn key="cl" onClick={() => onClose(t)}>Resolve &amp; close</Btn>);
      } else {
        return <span className="text-xs text-brandred">Disputed — awaiting owner</span>;
      }
    } else if (t.status === 'closed' || t.status === 'cancelled') {
      return <span className="text-xs text-soft">{t.status === 'closed' ? 'Closed' : 'Cancelled'} {when(t.closed_at || t.cancelled_at)}</span>;
    }
    return btns.length ? <div className="flex flex-wrap gap-2">{btns}</div> : null;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Sales</p>
          <h1 className="font-display text-3xl text-gradient">Tickets</h1>
          <p className="mt-1 text-sm text-soft">Lead hand-offs move through open → actioned → confirmed → closed.</p>
        </div>
        <div className="flex items-center gap-2">
          <FilterPill active={filter === 'mine'} onClick={() => setFilter('mine')}>Mine</FilterPill>
          {isManager && <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterPill>}
        </div>
      </header>

      {isLoading ? (
        <div className="grid place-items-center py-20"><Loader2 size={28} className="animate-spin text-soft" /></div>
      ) : (tickets ?? []).length === 0 ? (
        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-12 text-center">
          <TicketIcon size={28} className="mx-auto text-soft" />
          <p className="mt-3 font-display text-lg text-white">No tickets</p>
          <p className="mt-1 text-sm text-soft">Hand-offs you raise or receive will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {(tickets ?? []).map((t) => (
            <li key={t.id} className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[t.status] || STATUS_BADGE.open}`}>
                      {t.status}
                    </span>
                    {t.ticket_type_code && <span className="text-[11px] uppercase tracking-wide text-soft">{t.ticket_type_code}</span>}
                  </div>
                  <p className="mt-1.5 font-semibold text-white">{t.subject || 'Ticket'}</p>
                  {t.body && <p className="mt-1 text-sm text-soft">{t.body}</p>}
                  <p className="mt-2 text-[11px] text-soft">
                    {nameById.get(t.from_user_id) || '—'} → {nameById.get(t.to_user_id) || t.to_role || '—'} · {when(t.created_at)}
                  </p>
                </div>
                <div className="flex-none">{buttonsFor(t)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Reassign modal */}
      <Modal
        open={!!reassign}
        onClose={() => setReassign(null)}
        title="Reassign ticket"
        footer={<>
          <Btn onClick={() => setReassign(null)}>Cancel</Btn>
          <Btn kind="primary" disabled={busy} onClick={submitReassign}>Reassign</Btn>
        </>}
      >
        <label className="block text-sm text-soft">New assignee
          <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white">
            <option value="">Select…</option>
            {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </label>
        <label className="block text-sm text-soft">Reason (optional)
          <textarea value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white" />
        </label>
      </Modal>

      {/* Dispute modal */}
      <Modal
        open={!!dispute}
        onClose={() => setDispute(null)}
        title="Dispute ticket"
        footer={<>
          <Btn onClick={() => setDispute(null)}>Cancel</Btn>
          <Btn kind="danger" disabled={busy} onClick={submitDispute}>Submit dispute</Btn>
        </>}
      >
        <label className="block text-sm text-soft">Reason (required)
          <textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white" />
        </label>
      </Modal>
    </div>
  );
}

function Btn({ children, kind, onClick, disabled }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40';
  const styles = {
    primary: 'bg-brandred/90 text-white hover:bg-brandred',
    danger:  'bg-brandred/15 text-brandred hover:bg-brandred/25',
    default: 'border border-darkbg-border bg-darkbg-900/60 text-soft hover:text-white',
  };
  return <button onClick={onClick} disabled={disabled} className={`${base} ${styles[kind] || styles.default}`}>{children}</button>;
}

function FilterPill({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-full border px-4 py-1.5 text-sm transition ${active ? 'border-brandred bg-brandred/15 text-white' : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'}`}>
      {children}
    </button>
  );
}
