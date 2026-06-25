import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Receipt, Plus, Send, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';
import Modal from '../../../components/Modal.jsx';

const STATUSES = ['all', 'draft', 'sent', 'paid', 'partial', 'overdue', 'failed', 'cancelled'];

const BADGE = {
  draft:     'border-darkbg-border bg-darkbg-900/60 text-soft',
  sent:      'border-blue-500/40 bg-blue-500/10 text-blue-300',
  partial:   'border-blue-500/40 bg-blue-500/10 text-blue-300',
  paid:      'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  overdue:   'border-brandred/40 bg-brandred/10 text-brandred',
  failed:    'border-brandred/40 bg-brandred/10 text-brandred',
  cancelled: 'border-darkbg-border bg-darkbg-900/60 text-soft',
};

const INVOICE_TYPES = [
  { value: 'setup_fee',           label: 'Setup Fee' },
  { value: 'monthly_retainer',    label: 'Monthly Retainer' },
  { value: 'add_on_setup',        label: 'Add-on Setup' },
  { value: 'add_on_monthly',      label: 'Add-on Monthly' },
  { value: 'once_off',            label: 'Once-off' },
  { value: 'per_sms',             label: 'Per SMS' },
  { value: 'cancellation_fee',    label: 'Cancellation Fee' },
  { value: 'acceleration_amount', label: 'Acceleration Amount' },
];

const CANCEL_REASONS = [
  { value: 'duplicate',                  label: 'Duplicate invoice' },
  { value: 'billing_error',              label: 'Billing error' },
  { value: 'corrected_replacement',      label: 'Corrected / replacement issued' },
  { value: 'client_dispute',             label: 'Client dispute' },
  { value: 'client_cancelled_service',   label: 'Client cancelled service' },
  { value: 'goodwill_waiver',            label: 'Goodwill waiver' },
  { value: 'debit_failure_writeoff',     label: 'Debit failure write-off' },
];

const PAYMENT_METHODS = ['eft', 'debit_order', 'yoco', 'payfast', 'cash', 'other'];

const money = (n) => 'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const daysLate = (due) => (due ? Math.max(0, Math.floor((Date.now() - new Date(due + 'T00:00:00').getTime()) / 86400000)) : 0);

function isChaseable(inv) {
  if (inv.status === 'overdue') return true;
  if (inv.status === 'sent' && inv.due_date && daysLate(inv.due_date) > 0) return true;
  return false;
}

export default function Invoices() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const isManager = ['owner', 'admin'].includes(role);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Mark-paid modal
  const [payModal, setPayModal] = useState(null);
  const [payMethod, setPayMethod] = useState('eft');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payBusy, setPayBusy] = useState(false);

  // Create invoice modal
  const [showCreate, setShowCreate] = useState(false);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState(null);

  // Chase modal
  const [chaseModal, setChaseModal] = useState(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', status],
    queryFn: async () => {
      let q = supabase.from('invoices').select('*, client:clients(email)').order('issue_date', { ascending: false }).limit(500);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (invoices ?? []).filter((i) => !s || (i.client_name || '').toLowerCase().includes(s) || (i.invoice_number || '').toLowerCase().includes(s));
  }, [invoices, search]);

  function refresh() { qc.invalidateQueries({ queryKey: ['invoices'] }); }

  async function onRefreshOverdue() {
    setRefreshing(true);
    const { error } = await supabase.rpc('detect_overdue_invoices');
    setRefreshing(false);
    if (error) toast.error(error.message);
    else { toast.success('Overdue invoices refreshed'); refresh(); }
  }

  async function submitPaid() {
    setPayBusy(true);
    const { error } = await supabase.rpc('mark_invoice_paid_eft', {
      p_invoice_id: payModal.id,
      p_payment_method: payMethod,
      p_payment_date: payDate,
    });
    setPayBusy(false);
    if (error) toast.error(error.message);
    else { toast.success('Invoice marked paid'); setPayModal(null); refresh(); }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-soft">Money</p>
          <h1 className="font-display text-3xl text-gradient">Invoices</h1>
          <p className="mt-1 text-sm text-soft">Setup and recurring billing across all clients.</p>
        </div>
        <div className="flex items-center gap-2">
          {role === 'owner' && (
            <button onClick={onRefreshOverdue} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-darkbg-border bg-darkbg-800/60 px-4 py-2 text-sm text-white hover:bg-darkbg-800 disabled:opacity-40">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh overdue
            </button>
          )}
          {isManager && (
            <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
              <Plus size={14} /> Create Invoice
            </button>
          )}
        </div>
      </header>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${status === s ? 'border-brandred bg-brandred/15 text-white' : 'border-darkbg-border bg-darkbg-800/60 text-soft hover:text-white'}`}>
            {s}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client or number…"
          className="ml-auto rounded-full border border-darkbg-border bg-darkbg-900 px-4 py-1.5 text-sm text-white placeholder:text-soft outline-none" />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20"><Loader2 size={28} className="animate-spin text-soft" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-12 text-center">
          <Receipt size={28} className="mx-auto text-soft" />
          <p className="mt-3 font-display text-lg text-white">No invoices found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-darkbg-border">
          <table className="w-full text-sm">
            <thead className="bg-darkbg-800/80 text-left text-[11px] uppercase tracking-widest text-soft">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkbg-border">
              {rows.map((inv) => (
                <tr key={inv.id} className="bg-darkbg-800/30 hover:bg-darkbg-800/60">
                  <td className="px-4 py-3 font-mono text-xs text-white">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-white">{inv.client_name}</td>
                  <td className="px-4 py-3 capitalize text-soft">{(inv.invoice_type || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right text-white">{money(inv.total_amount ?? inv.amount)}</td>
                  <td className="px-4 py-3 text-soft">{fmtDate(inv.issue_date)}</td>
                  <td className="px-4 py-3 text-soft">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE[inv.status] || BADGE.draft}`}>
                      {inv.status}{inv.status === 'overdue' ? ` · ${daysLate(inv.due_date)}d` : ''}
                    </span>
                    {inv.status === 'cancelled' && inv.cancellation_reason_category && (
                      <p className="mt-1 text-[10px] text-soft capitalize">
                        {inv.cancellation_reason_category.replace(/_/g, ' ')}
                        {inv.cancelled_by_name && ` · ${inv.cancelled_by_name}`}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {isManager && isChaseable(inv) && (
                        <button onClick={() => setChaseModal(inv)}
                          className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25">
                          Send chase
                        </button>
                      )}
                      {isManager && !['paid', 'cancelled'].includes(inv.status) && (
                        <button onClick={() => { setPayModal(inv); setPayDate(new Date().toISOString().slice(0, 10)); }}
                          className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25">
                          Mark paid
                        </button>
                      )}
                      {isManager && !['paid', 'cancelled'].includes(inv.status) && (
                        <button onClick={() => setCancelModal(inv)}
                          className="rounded-full border border-darkbg-border px-2.5 py-1 text-[11px] text-soft hover:text-white">
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark-paid modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Mark ${payModal?.invoice_number} paid`}
        footer={<>
          <button onClick={() => setPayModal(null)} className="rounded-full border border-darkbg-border px-4 py-2 text-sm text-soft">Cancel</button>
          <button onClick={submitPaid} disabled={payBusy} className="btn-primary disabled:opacity-40">Confirm</button>
        </>}>
        <label className="block text-sm text-soft">Payment method
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white">
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="block text-sm text-soft">Payment date
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white" />
        </label>
      </Modal>

      {/* Create invoice modal */}
      {showCreate && (
        <CreateInvoiceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {/* Cancel modal */}
      {cancelModal && (
        <CancelInvoiceModal
          invoice={cancelModal}
          onClose={() => setCancelModal(null)}
          onCancelled={() => { setCancelModal(null); refresh(); }}
        />
      )}

      {/* Chase modal */}
      {chaseModal && (
        <ChaseModal
          invoice={chaseModal}
          onClose={() => setChaseModal(null)}
          onChased={() => { setChaseModal(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ── Create Invoice Modal ────────────────────────────────────────────────────

function CreateInvoiceModal({ onClose, onCreated }) {
  const [clientSearch, setClientSearch] = useState('');
  const [debSearch, setDebSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [invoiceType, setInvoiceType] = useState('setup_fee');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebSearch(clientSearch), 300);
    return () => clearTimeout(t);
  }, [clientSearch]);

  const clientsQ = useQuery({
    queryKey: ['invoice_client_search', debSearch],
    enabled: debSearch.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_crm', {
        p_query: debSearch,
        p_limit: 10,
      });
      if (error) throw error;
      return (data ?? [])
        .filter(r => r.result_type === 'client')
        .map(r => ({ id: r.id, business_name: r.display_name, contact_person: r.subtitle, email: r.email }));
    },
    staleTime: 30_000,
  });

  async function handleSubmit() {
    if (!selectedClient) { toast.error('Select a client'); return; }
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return; }
    if (!dueDate) { toast.error('Set a due date'); return; }

    setBusy(true);
    try {
      const { data: inv, error } = await supabase.rpc('create_invoice', {
        p_client_id: selectedClient.id,
        p_deal_id: null,
        p_invoice_type: invoiceType,
        p_amount: Number(amount),
        p_due_date: dueDate,
        p_description: description || null,
        p_assigned_cpc_id: null,
        p_send_email: sendEmail,
      });
      if (error) throw error;

      if (sendEmail && selectedClient.email) {
        await supabase.functions.invoke('send-invoice-email', {
          body: {
            kind: 'issued',
            to: selectedClient.email,
            payload: {
              clientName: selectedClient.business_name,
              invoiceNumber: inv.invoice_number,
              amountZar: money(Number(amount)),
              dueDate: fmtDate(dueDate),
              payUrl: `${window.location.origin}/client/invoices/${inv.invoice_id}`,
              lineItems: [{ name: INVOICE_TYPES.find(t => t.value === invoiceType)?.label || invoiceType, detail: description || '', amount: money(Number(amount)) }],
            },
          },
        });
      }

      toast.success(`Invoice ${inv.invoice_number} created`);
      onCreated();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <button onClick={onClose} className="btn-ghost">Cancel</button>
      <button onClick={handleSubmit} disabled={busy} className="btn-primary disabled:opacity-40">
        {busy ? 'Creating…' : 'Create Invoice'}
      </button>
    </>
  );

  return (
    <Modal open onClose={onClose} title="Create Invoice" footer={footer}>
      <div className="space-y-3">
        {/* Client picker */}
        <div>
          <label className="label">Client *</label>
          {selectedClient ? (
            <div className="flex items-center justify-between rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2">
              <span className="text-sm text-white">{selectedClient.business_name}</span>
              <button onClick={() => setSelectedClient(null)} className="text-soft hover:text-white"><X size={14} /></button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search client name…"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="input"
                autoFocus
              />
              {clientsQ.isFetching && debSearch.length >= 2 && (
                <p className="mt-1 text-xs text-soft">Searching…</p>
              )}
              {clientsQ.isError && (
                <p className="mt-1 text-xs text-brandred">{clientsQ.error?.message || 'Search failed'}</p>
              )}
              {clientsQ.data?.length > 0 && (
                <div className="relative z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-darkbg-border bg-darkbg-900 shadow-xl">
                  {clientsQ.data.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedClient(c); setClientSearch(''); }}
                      className="block w-full px-3 py-2 text-left text-sm text-soft hover:bg-darkbg-700/40 hover:text-white"
                    >
                      {c.business_name} {c.contact_person && <span className="text-xs text-soft">· {c.contact_person}</span>}
                    </button>
                  ))}
                </div>
              )}
              {!clientsQ.isFetching && clientsQ.data?.length === 0 && debSearch.length >= 2 && (
                <p className="mt-1 text-xs text-soft">No clients found for "{debSearch}"</p>
              )}
            </>
          )}
        </div>

        {/* Invoice type */}
        <div>
          <label className="label">Invoice Type *</label>
          <select value={invoiceType} onChange={e => setInvoiceType(e.target.value)} className="input">
            {INVOICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="label">Amount (ZAR) *</label>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="input" />
        </div>

        {/* Due date */}
        <div>
          <label className="label">Due Date *</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea placeholder="Line item detail…" value={description} onChange={e => setDescription(e.target.value)} className="input min-h-[60px]" />
        </div>

        {/* Email toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)}
            className="h-4 w-4 rounded border-darkbg-border bg-darkbg-900 text-brandred focus:ring-brandred" />
          <span className="text-sm text-soft">Email invoice to client</span>
          {sendEmail && !selectedClient?.email && selectedClient && (
            <span className="text-[10px] text-amber-300">No email on file</span>
          )}
        </label>
      </div>
    </Modal>
  );
}

// ── Cancel Invoice Modal ────────────────────────────────────────────────────

function CancelInvoiceModal({ invoice, onClose, onCancelled }) {
  const [reasonCategory, setReasonCategory] = useState('');
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCancel() {
    if (!reasonCategory) { toast.error('Select a reason'); return; }
    setBusy(true);
    try {
      const { data: result, error } = await supabase.rpc('cancel_invoice', {
        p_invoice_id: invoice.id,
        p_reason_category: reasonCategory,
        p_reason: noteText.trim() || null,
      });
      if (error) throw error;

      // TODO: cancellation email (send-invoice-email does not have a 'cancelled' template yet)

      const parts = [];
      parts.push('Cancelled.');
      if (result?.tasks_created?.length) parts.push(`${result.tasks_created.length} follow-up task${result.tasks_created.length !== 1 ? 's' : ''} created.`);
      if (result?.commissions_withheld > 0) parts.push(`${result.commissions_withheld} commission${result.commissions_withheld !== 1 ? 's' : ''} withheld (pending).`);
      toast.success(parts.join(' '));

      onCancelled();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <button onClick={onClose} className="btn-ghost">Back</button>
      <button onClick={handleCancel} disabled={busy || !reasonCategory} className="rounded-full border border-brandred/40 bg-brandred/10 px-4 py-2 text-sm text-brandred hover:bg-brandred/20 disabled:opacity-40">
        {busy ? 'Cancelling…' : 'Confirm Cancel'}
      </button>
    </>
  );

  return (
    <Modal open onClose={onClose} title={`Cancel ${invoice.invoice_number}`} footer={footer}>
      <div className="space-y-3">
        <div>
          <label className="label">Reason *</label>
          <select value={reasonCategory} onChange={e => setReasonCategory(e.target.value)} className="input">
            <option value="">Select a reason…</option>
            {CANCEL_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Additional notes</label>
          <textarea placeholder="Optional detail…" value={noteText} onChange={e => setNoteText(e.target.value)} className="input min-h-[60px]" />
        </div>
      </div>
    </Modal>
  );
}

// ── Chase Modal ─────────────────────────────────────────────────────────────

function ChaseModal({ invoice, onClose, onChased }) {
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('suggest_chase_stage', { p_invoice_id: invoice.id });
      if (cancelled) return;
      setLoading(false);
      if (error) { toast.error(`Chase suggestion failed: ${error.message}`); onClose(); return; }
      setSuggestion(data);
    })();
    return () => { cancelled = true; };
  }, [invoice.id]);

  async function handleSend() {
    setSending(true);
    try {
      if (invoice.client?.email) {
        await supabase.functions.invoke('send-invoice-email', {
          body: {
            kind: 'chase',
            to: invoice.client.email,
            payload: {
              clientName: invoice.client_name,
              invoiceNumber: invoice.invoice_number,
              amountZar: money(invoice.total_amount ?? invoice.amount),
              dueDate: fmtDate(invoice.due_date),
              payUrl: `${window.location.origin}/client/invoices/${invoice.id}`,
              daysOverdue: suggestion?.days_overdue ?? daysLate(invoice.due_date),
            },
          },
        });
      }

      await supabase.rpc('log_invoice_chase_sent', {
        p_invoice_id: invoice.id,
        p_stage: suggestion?.suggested_stage || 'reminder',
      });

      toast.success(`Chase sent (${suggestion?.suggested_stage || 'reminder'})`);
      onChased();
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  const footer = (
    <>
      <button onClick={onClose} className="btn-ghost">Cancel</button>
      <button onClick={handleSend} disabled={sending || loading} className="btn-primary disabled:opacity-40">
        {sending ? 'Sending…' : 'Send Chase'}
      </button>
    </>
  );

  return (
    <Modal open onClose={onClose} title={`Chase ${invoice.invoice_number}`} footer={footer}>
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-soft">
          <Loader2 size={16} className="animate-spin" /> Loading suggestion…
        </div>
      ) : suggestion ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
            <p className="text-xs uppercase tracking-widest text-amber-300">Suggested stage</p>
            <p className="mt-1 font-display text-lg text-white capitalize">{(suggestion.suggested_stage || '').replace(/_/g, ' ')}</p>
          </div>
          {suggestion.suggested_subject && (
            <p className="text-sm text-soft">Subject: <span className="text-white">{suggestion.suggested_subject}</span></p>
          )}
          <p className="text-sm text-soft">
            {invoice.client_name} · {money(invoice.total_amount ?? invoice.amount)} · {suggestion.days_overdue ?? daysLate(invoice.due_date)}d overdue
          </p>
          {!invoice.client?.email && (
            <p className="text-xs text-amber-300">No client email on file — chase will be logged but no email sent.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-soft">Could not load suggestion.</p>
      )}
    </Modal>
  );
}
