import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Modal from './Modal.jsx';
import { toast } from 'sonner';

export function ApproveDiscountModal({ open, onClose, ticket, onDone }) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleApprove() {
    setBusy(true);
    const { error } = await supabase.rpc('action_lead_ticket', {
      p_ticket_id: ticket.id,
      p_notes: `Discount approved: R${amount}. ${notes}`.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Discount approved');
    onDone?.();
    window.location.href =
      '/owner/sales/log?lead=' + ticket.lead_id +
      '&from_ticket=' + ticket.id +
      '&custom=1';
  }

  async function handleReject() {
    setBusy(true);
    const { error } = await supabase.rpc('cancel_lead_ticket', {
      p_ticket_id: ticket.id,
      p_notes: 'Discount rejected',
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Discount rejected');
    onDone?.();
    onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Approve Discount"
      footer={<>
        <button className="btn-ghost" onClick={handleReject} disabled={busy}>Reject</button>
        <button className="btn-primary" onClick={handleApprove} disabled={busy || !amount}>
          {busy ? 'Processing...' : 'Approve'}
        </button>
      </>}>
      <p className="text-soft text-sm">{ticket?.subject}</p>
      <p className="text-soft text-sm whitespace-pre-wrap">{ticket?.body}</p>
      <label className="label">Approved discount amount</label>
      <input type="number" className="input" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label className="label">Notes</label>
      <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>
  );
}

export function ApproveSelfSourcedModal({ open, onClose, ticket, onDone }) {
  const [busy, setBusy] = useState(false);

  async function handleApprove() {
    setBusy(true);
    const { error } = await supabase.rpc('action_lead_ticket', { p_ticket_id: ticket.id, p_notes: 'Self-sourced lead approved' });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Self-sourced lead approved');
    onDone?.(); onClose?.();
  }

  async function handleReject() {
    setBusy(true);
    const { error } = await supabase.rpc('cancel_lead_ticket', { p_ticket_id: ticket.id, p_notes: 'Self-sourced claim rejected — insufficient evidence' });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Self-sourced claim rejected');
    onDone?.(); onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Approve Self-Sourced Lead"
      footer={<>
        <button className="btn-ghost" onClick={handleReject} disabled={busy}>Reject</button>
        <button className="btn-primary" onClick={handleApprove} disabled={busy}>{busy ? 'Processing...' : 'Approve'}</button>
      </>}>
      <p className="text-soft text-sm font-medium mb-1">Evidence</p>
      <p className="text-soft text-sm whitespace-pre-wrap">{ticket?.body}</p>
    </Modal>
  );
}

const REJECT_REASONS = [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'not_a_business', label: 'Not a business' },
  { value: 'unreachable', label: 'Unreachable' },
  { value: 'not_in_service_area', label: 'Not in service area' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
];

export function RejectLeadModal({ open, onClose, ticket, onDone }) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    const { error } = await supabase.rpc('action_lead_ticket', { p_ticket_id: ticket.id, p_notes: `Rejection reason: ${reason}. ${notes}`.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead rejected');
    onDone?.(); onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Reject Lead"
      footer={<>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={handleConfirm} disabled={busy || !reason}>{busy ? 'Processing...' : 'Confirm Rejection'}</button>
      </>}>
      <label className="label">Reason</label>
      <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="">Select a reason...</option>
        {REJECT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <label className="label">Notes</label>
      <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>
  );
}

export function BlockClientModal({ open, onClose, ticket, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    const { error } = await supabase.rpc('action_lead_ticket', { p_ticket_id: ticket.id, p_notes: `Client blocked. Reason: ${reason}` });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Client blocked');
    onDone?.(); onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Block Client"
      footer={<>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={handleConfirm} disabled={busy || !reason}>{busy ? 'Processing...' : 'Block Client'}</button>
      </>}>
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
        This will permanently block contact with this client.
      </div>
      <label className="label">Reason (required)</label>
      <textarea className="input" rows={3} placeholder="Why is this client being blocked?" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

export function TranslateModal({ open, onClose, ticket, staffList, onDone }) {
  const [selectedStaff, setSelectedStaff] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    const { error } = await supabase.rpc('reassign_lead_ticket', { p_ticket_id: ticket.id, p_new_assignee_id: selectedStaff });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Ticket reassigned for translation');
    onDone?.(); onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign to Language Speaker"
      footer={<>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={busy || !selectedStaff}>{busy ? 'Assigning...' : 'Assign'}</button>
      </>}>
      <label className="label">Assign to Sepedi/language speaker</label>
      <select className="input" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
        <option value="">Select staff member...</option>
        {(staffList || []).map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
      </select>
      <label className="label">Notes</label>
      <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>
  );
}

export function PauseLeadModal({ open, onClose, ticket, onDone }) {
  const [pauseUntil, setPauseUntil] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    const { error } = await supabase.rpc('action_lead_ticket', { p_ticket_id: ticket.id, p_notes: `Paused until ${pauseUntil}. ${reason}`.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead paused until ' + pauseUntil);
    onDone?.(); onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Pause Lead"
      footer={<>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={busy || !pauseUntil}>{busy ? 'Processing...' : 'Pause Lead'}</button>
      </>}>
      <label className="label">Pause until (required)</label>
      <input type="date" className="input" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} />
      <label className="label">Reason</label>
      <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

const PACKAGES = [
  { value: 'ignite', label: 'Ignite' },
  { value: 'accelerate', label: 'Accelerate' },
  { value: 'dominate', label: 'Dominate' },
  { value: 'street_pulse', label: 'Street Pulse' },
  { value: 'township_pulse', label: 'Township Pulse' },
  { value: 'custom', label: 'Custom' },
];

export function SendProposalModal({ open, onClose, ticket, onDone }) {
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    const { error } = await supabase.rpc('action_lead_ticket', { p_ticket_id: ticket.id, p_notes: `Send proposal: ${selected}. ${notes}`.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Proposal queued');
    onDone?.(); onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Send Proposal"
      footer={<>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={busy || !selected}>{busy ? 'Sending...' : 'Send Proposal'}</button>
      </>}>
      <label className="label">Select package</label>
      <div className="flex flex-wrap gap-2">
        {PACKAGES.map((pkg) => (
          <button key={pkg.value} type="button"
            className={`rounded-full border px-3 py-1 text-sm transition ${selected === pkg.value ? 'border-brand bg-brand/20 text-white' : 'border-darkbg-border text-soft hover:border-white/30'}`}
            onClick={() => setSelected(pkg.value)}>
            {pkg.label}
          </button>
        ))}
      </div>
      <label className="label">Notes</label>
      <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>
  );
}

export function UploadProofModal({ open, onClose, ticket, onDone }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!file) return;
    setBusy(true);
    const path = `${ticket.lead_id}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from('lead-attachments').upload(path, file);
    if (uploadErr) { toast.error(uploadErr.message); setBusy(false); return; }
    const { data: urlData } = supabase.storage.from('lead-attachments').getPublicUrl(path);
    const { error } = await supabase.rpc('action_lead_ticket', { p_ticket_id: ticket.id, p_notes: `Proof uploaded: ${urlData?.publicUrl || path}` });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Proof uploaded');
    onDone?.(); onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload Proof"
      footer={<>
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={busy || !file}>{busy ? 'Uploading...' : 'Upload'}</button>
      </>}>
      <label className="label">Select file</label>
      <input type="file" accept="image/*,.pdf" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      {file && <p className="text-soft text-sm">Selected: {file.name}</p>}
    </Modal>
  );
}
