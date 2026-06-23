import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, RotateCcw, XCircle, Star, Upload, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const STATUS_LABELS = {
  awaiting_client: 'Awaiting Your Review',
  client_reviewing: 'Under Review',
  client_requested_changes: 'Changes Requested',
  client_rejected: 'Rejected',
  approved: 'Approved',
  deemed_approved: 'Auto-Approved',
  in_progress: 'In Progress',
  not_started: 'Not Started',
  blocked: 'Blocked',
  completed: 'Completed',
};

export default function ClientDeliverables() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [actionModal, setActionModal] = useState(null); // { type: 'approve'|'changes'|'reject'|'feedback', del }
  const [feedbackModal, setFeedbackModal] = useState(null); // deliverable

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ['client-deliverables'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_deliverables');
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const { data: obligations = [] } = useQuery({
    queryKey: ['client-obligations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_obligations');
      if (error) throw error;
      return data ?? [];
    },
  });

  const approveMut = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('client_approve_deliverable', { p_deliverable_id: id });
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['client-deliverables'] });
      toast.success('Approved!');
      // Open feedback modal
      const del = deliverables.find(d => d.id === id);
      if (del) setFeedbackModal(del);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = deliverables.filter(d => {
    if (filter === 'awaiting') return ['awaiting_client','client_reviewing'].includes(d.status);
    if (filter === 'approved') return ['approved','deemed_approved'].includes(d.status);
    if (filter === 'action_needed') return ['client_requested_changes','client_rejected'].includes(d.status);
    return true;
  });

  const awaitingCount = deliverables.filter(d => ['awaiting_client','client_reviewing'].includes(d.status)).length;
  const pendingObligations = obligations.filter(o => o.status === 'pending');

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Your Deliverables</h1>
        <p className="text-gray-500 text-sm mb-6">Review and approve your marketing work</p>

        {/* Client obligations checklist */}
        {pendingObligations.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
              <AlertTriangle size={16}/> Before we can start your work, we need:
            </h2>
            <div className="space-y-2">
              {pendingObligations.map(o => (
                <ObligationRow key={o.id} obligation={o}
                  onSubmitted={() => qc.invalidateQueries({ queryKey: ['client-obligations'] })} />
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        {awaitingCount > 0 && (
          <div className="mb-5 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3">
            <Clock size={18} className="text-blue-600 shrink-0"/>
            <p className="text-sm text-blue-800 font-medium">
              {awaitingCount} deliverable{awaitingCount > 1 ? 's' : ''} awaiting your review
            </p>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto">
          {[
            { key: 'all', label: 'All' },
            { key: 'awaiting', label: `Awaiting Review${awaitingCount ? ` (${awaitingCount})` : ''}` },
            { key: 'action_needed', label: 'Action Needed' },
            { key: 'approved', label: 'Approved' },
          ].map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                filter === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No deliverables here yet.</div>
        ) : (
          <div className="space-y-4">
            {filtered.map(d => (
              <DeliverableCard key={d.id} del={d}
                onApprove={() => approveMut.mutate(d.id)}
                onChanges={() => setActionModal({ type: 'changes', del: d })}
                onReject={() => setActionModal({ type: 'reject', del: d })}
                onFeedback={() => setFeedbackModal(d)}
                approving={approveMut.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action modal */}
      {actionModal && (
        <ClientActionModal
          type={actionModal.type}
          del={actionModal.del}
          onClose={() => setActionModal(null)}
          onDone={() => { setActionModal(null); qc.invalidateQueries({ queryKey: ['client-deliverables'] }); }}
        />
      )}

      {/* Feedback modal */}
      {feedbackModal && (
        <FeedbackModal
          del={feedbackModal}
          onClose={() => setFeedbackModal(null)}
          onDone={() => { setFeedbackModal(null); qc.invalidateQueries({ queryKey: ['client-deliverables'] }); }}
        />
      )}
    </div>
  );
}

function DeliverableCard({ del, onApprove, onChanges, onReject, onFeedback, approving }) {
  const canAct = ['awaiting_client','client_reviewing'].includes(del.status);
  const needsFeedback = ['approved','deemed_approved'].includes(del.status) && !del.feedback_rating;

  const daysLeft = del.days_left;
  const urgency = daysLeft !== null && daysLeft <= 1 ? 'red' : daysLeft <= 3 ? 'orange' : daysLeft <= 5 ? 'yellow' : null;

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
      del.status === 'client_rejected' ? 'border-red-200' :
      del.status === 'client_requested_changes' ? 'border-orange-200' :
      canAct ? 'border-blue-200' : 'border-gray-200'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <p className="font-semibold text-gray-900">{del.title}</p>
            {del.product && <p className="text-xs text-gray-400 mt-0.5">{del.product}</p>}
          </div>
          <StatusBadge status={del.status} />
        </div>

        {/* Days-left countdown */}
        {canAct && daysLeft !== null && (
          <div className={`mb-3 text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${
            urgency === 'red' ? 'bg-red-50 text-red-700' :
            urgency === 'orange' ? 'bg-orange-50 text-orange-700' :
            urgency === 'yellow' ? 'bg-yellow-50 text-yellow-700' :
            'bg-gray-50 text-gray-600'
          }`}>
            <Clock size={12}/>
            {daysLeft <= 0 ? 'Auto-approving today' :
             daysLeft === 1 ? 'Auto-approves tomorrow' :
             `${daysLeft} days left to review`}
          </div>
        )}

        {/* Client notes */}
        {del.changes_requested_notes && (
          <p className="text-xs text-orange-700 bg-orange-50 rounded-lg p-2 mb-3">
            Your notes: "{del.changes_requested_notes}"
          </p>
        )}
        {del.rejection_reason && (
          <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2 mb-3">
            Rejection reason: "{del.rejection_reason}"
          </p>
        )}

        {/* Files */}
        {del.file_urls?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {del.file_urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition">
                📎 File {i+1}
              </a>
            ))}
          </div>
        )}

        {/* Stars if already rated */}
        {del.feedback_rating && (
          <div className="flex items-center gap-1 mb-3">
            {[1,2,3,4,5].map(n => (
              <Star key={n} size={14} className={n <= del.feedback_rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}/>
            ))}
            <span className="text-xs text-gray-400 ml-1">Your rating</span>
          </div>
        )}

        {/* Actions */}
        {canAct && (
          <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t border-gray-100">
            <button onClick={onApprove} disabled={approving}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition">
              <CheckCircle2 size={15}/> Approve
            </button>
            <button onClick={onChanges}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition">
              <RotateCcw size={14}/> Request Changes
            </button>
            <button onClick={onReject}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition">
              <XCircle size={14}/> Reject
            </button>
          </div>
        )}

        {/* Rate button after approval */}
        {needsFeedback && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button onClick={onFeedback}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700">
              <Star size={14}/> Leave a rating
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cls = {
    awaiting_client: 'bg-blue-100 text-blue-700',
    client_reviewing: 'bg-blue-100 text-blue-700',
    approved: 'bg-emerald-100 text-emerald-700',
    deemed_approved: 'bg-emerald-50 text-emerald-600',
    client_requested_changes: 'bg-orange-100 text-orange-700',
    client_rejected: 'bg-red-100 text-red-700',
    in_progress: 'bg-gray-100 text-gray-600',
    not_started: 'bg-gray-100 text-gray-500',
    blocked: 'bg-red-50 text-red-500',
  }[status] ?? 'bg-gray-100 text-gray-600';
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function ObligationRow({ obligation, onSubmitted }) {
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_client_obligation', {
        p_obligation_id: obligation.id,
        p_notes: notes || null,
        p_files: [],
      });
      if (error) throw error;
      toast.success('Submitted! We\'ll verify shortly.');
      onSubmitted();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); setOpen(false); }
  }

  const statusIcon = {
    pending: '□', submitted: '⏳', verified: '✓', rejected: '✗', waived_by_admin: '—'
  }[obligation.status] ?? '□';

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-amber-800">
          <span className="font-mono">{statusIcon}</span>
          {obligation.obligation_label}
          {obligation.blocking && <span className="text-xs text-red-600 font-medium">(required)</span>}
        </span>
        {obligation.status === 'pending' && (
          <button onClick={() => setOpen(v => !v)}
            className="shrink-0 text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg px-3 py-1 hover:bg-amber-100 transition">
            Submit
          </button>
        )}
        {obligation.status === 'submitted' && (
          <span className="shrink-0 text-xs text-amber-600">Under review</span>
        )}
        {obligation.status === 'verified' && (
          <span className="shrink-0 text-xs text-emerald-600 font-medium">✓ Verified</span>
        )}
      </div>
      {open && (
        <div className="mt-2 ml-5 space-y-2">
          <textarea className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm resize-none"
            rows={2} placeholder="Add notes or describe what you're providing…"
            value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={submit} disabled={submitting}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientActionModal({ type, del, onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const config = {
    changes: { title: 'Request Changes', placeholder: 'What would you like changed?', rpc: 'client_request_changes', param: 'p_notes', buttonLabel: 'Submit Request', buttonClass: 'bg-orange-600 hover:bg-orange-700' },
    reject:  { title: 'Reject Deliverable', placeholder: 'Please explain why you\'re rejecting this…', rpc: 'client_reject_deliverable', param: 'p_reason', buttonLabel: 'Reject', buttonClass: 'bg-red-600 hover:bg-red-700' },
  }[type];

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return toast.error('Please provide details.');
    setBusy(true);
    try {
      const { error } = await supabase.rpc(config.rpc, {
        p_deliverable_id: del.id,
        [config.param]: text.trim(),
      });
      if (error) throw error;
      toast.success(type === 'changes' ? 'Changes requested' : 'Deliverable rejected');
      onDone();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <h2 className="font-bold text-gray-900 text-lg mb-1">{config.title}</h2>
        <p className="text-gray-500 text-sm mb-4 truncate">{del.title}</p>
        <form onSubmit={submit} className="space-y-4">
          <textarea required rows={4} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 resize-none"
            placeholder={config.placeholder}
            value={text} onChange={e => setText(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={busy}
              className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition ${config.buttonClass} disabled:opacity-50`}>
              {busy ? 'Submitting…' : config.buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FeedbackModal({ del, onClose, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!rating) return toast.error('Please select a star rating');
    setBusy(true);
    try {
      const { error } = await supabase.rpc('record_deliverable_feedback', {
        p_deliverable_id: del.id,
        p_rating: rating,
        p_comment: comment || null,
      });
      if (error) throw error;
      toast.success('Thank you for your feedback!');
      onDone();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 text-center">
        <div className="text-3xl mb-2">⭐</div>
        <h2 className="font-bold text-gray-900 text-lg mb-1">Rate your experience</h2>
        <p className="text-gray-500 text-sm mb-5 truncate">{del.title}</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex justify-center gap-2">
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button" onClick={() => setRating(n)}
                className={`text-3xl transition ${n <= rating ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}>
                ★
              </button>
            ))}
          </div>
          <textarea rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none text-left focus:outline-none focus:border-gray-400"
            placeholder="Optional comment…"
            value={comment} onChange={e => setComment(e.target.value)} />
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Skip</button>
            <button type="submit" disabled={busy || !rating}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 transition">
              {busy ? 'Saving…' : 'Submit Rating'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
