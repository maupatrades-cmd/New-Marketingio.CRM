import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Plus, RefreshCw, Loader2, ExternalLink,
  Send, Copy, ClipboardList, PhoneCall, Eye, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { toast } from 'sonner';

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { label: 'All',                  value: 'all' },
  { label: 'Draft',                value: 'draft' },
  { label: 'Sent',                 value: 'sent' },
  { label: 'Awaiting Checklist',   value: 'awaiting_checklist' },
  { label: 'Awaiting Verify-Call', value: 'awaiting_verify' },
  { label: 'In Mismatch',          value: 'in_mismatch' },
  { label: 'Active',               value: 'active' },
  { label: 'Arrears',              value: 'arrears' },
  { label: 'Cancelled',            value: 'cancelled' },
];

// tabs that are filtered client-side from a broader server fetch
const CLIENT_SIDE_TABS = new Set(['awaiting_checklist', 'awaiting_verify', 'in_mismatch']);

const RPC_TAB_MAP = {
  awaiting_checklist: 'all',
  awaiting_verify:    'all',
  in_mismatch:        'all',
};

const PACKAGE_BADGE = {
  ignite:         'border-orange-500/40  bg-orange-500/10  text-orange-300',
  accelerate:     'border-blue-500/40    bg-blue-500/10    text-blue-300',
  dominate:       'border-purple-500/40  bg-purple-500/10  text-purple-300',
  street_pulse:   'border-green-500/40   bg-green-500/10   text-green-300',
  township_pulse: 'border-teal-500/40    bg-teal-500/10    text-teal-300',
};

const PACKAGE_LABEL = {
  ignite:         'Ignite',
  accelerate:     'Accelerate',
  dominate:       'Dominate',
  street_pulse:   'Street Pulse',
  township_pulse: 'Township Pulse',
};

const STATUS_BADGE = {
  draft:            'border-darkbg-border bg-darkbg-900/60 text-soft',
  generated:        'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
  sent:             'border-blue-500/40   bg-blue-500/10   text-blue-300',
  awaiting_checklist:'border-amber-500/40 bg-amber-500/10  text-amber-300',
  awaiting_verify:  'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  in_mismatch:      'border-red-500/40    bg-red-500/10    text-red-300',
  active:           'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  fully_executed:   'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  arrears:          'border-rose-500/40   bg-rose-500/10   text-rose-300',
  cancelled:        'border-darkbg-border bg-darkbg-900/60 text-soft',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const money = (n) =>
  'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });

function contractValue(row) {
  const multiplier = row.package === 'street_pulse' || row.package === 'township_pulse' ? 3 : 12;
  return (row.setup_fee || 0) + (row.monthly_retainer || 0) * multiplier;
}

function holdingParty(row) {
  if (!row.has_sales_checklist) return row.closer_name || 'Closer';
  if (!row.has_admin_checklist) return 'Admin';
  return 'Owner';
}

function daysInState(dateStr) {
  if (!dateStr) return '—';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  return diff === 1 ? '1 day' : `${diff} days`;
}

function applyClientFilter(tab, rows) {
  if (tab === 'awaiting_checklist') return rows.filter((r) => r.has_sales_checklist === false);
  if (tab === 'awaiting_verify')    return rows.filter((r) => r.has_sales_checklist === true && r.has_admin_checklist === false);
  if (tab === 'in_mismatch')        return rows.filter((r) => (r.open_mismatch_count || 0) > 0);
  return rows;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PackageBadge({ pkg }) {
  const cls = PACKAGE_BADGE[pkg] || 'border-darkbg-border bg-darkbg-900/60 text-soft';
  const label = PACKAGE_LABEL[pkg] || pkg || '—';
  return (
    <span className={`inline-flex items-center border rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cls = STATUS_BADGE[status] || 'border-darkbg-border bg-darkbg-900/60 text-soft';
  const label = status ? status.replace(/_/g, ' ') : '—';
  return (
    <span className={`inline-flex items-center border rounded px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}

function ActionButtons({ row, onRefresh }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    const { error } = await supabase.rpc('generate_contract', { p_deal_id: row.deal_id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Contract generated');
    onRefresh();
  }

  async function sendToClient() {
    setBusy(true);
    const { error } = await supabase.rpc('send_contract_for_signing', { p_contract_id: row.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Contract sent to client');
    onRefresh();
  }

  async function resend() {
    setBusy(true);
    const { error } = await supabase.rpc('resend_contract', { p_contract_id: row.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Contract resent');
    onRefresh();
  }

  function copyLink() {
    if (row.signing_url) {
      navigator.clipboard.writeText(row.signing_url);
      toast.success('Link copied');
    } else {
      toast.error('No signing link available');
    }
  }

  const viewPdf = () => window.open(row.document_url, '_blank');

  const btn =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors disabled:opacity-50';
  const primary =
    `${btn} border-brand/40 bg-brand/10 text-brand hover:bg-brand/20`;
  const secondary =
    `${btn} border-darkbg-border bg-darkbg-800 text-soft hover:text-white hover:border-darkbg-600`;

  if (!row.document_url) {
    return (
      <button onClick={generate} disabled={busy} className={primary}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
        Generate
      </button>
    );
  }

  const status = row.status;

  if (status === 'draft' || status === 'generated') {
    return (
      <div className="flex items-center gap-2">
        <button onClick={viewPdf} className={secondary}>
          <Eye size={13} /> View Contract
        </button>
        <button onClick={sendToClient} disabled={busy} className={primary}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Send to Client
        </button>
      </div>
    );
  }

  if (status === 'sent') {
    return (
      <div className="flex items-center gap-2">
        <button onClick={viewPdf} className={secondary}>
          <Eye size={13} /> View Contract
        </button>
        <button onClick={resend} disabled={busy} className={secondary}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Resend
        </button>
        <button onClick={copyLink} className={secondary}>
          <Copy size={13} /> Copy Link
        </button>
      </div>
    );
  }

  if (status === 'awaiting_checklist' || (!row.has_sales_checklist)) {
    return (
      <button
        onClick={() => navigate(`/owner/contracts/${row.id}/sales-checklist`)}
        className={primary}
      >
        <ClipboardList size={13} /> Open Checklist
      </button>
    );
  }

  if (status === 'awaiting_verify' || (row.has_sales_checklist && !row.has_admin_checklist)) {
    return (
      <button
        onClick={() => navigate(`/owner/contracts/${row.id}/verify-call`)}
        className={primary}
      >
        <PhoneCall size={13} /> Open Verify-Call
      </button>
    );
  }

  if (status === 'active' || status === 'fully_executed') {
    return (
      <button onClick={viewPdf} className={secondary}>
        <Eye size={13} /> View Contract
      </button>
    );
  }

  // fallback
  if (row.document_url) {
    return (
      <button onClick={viewPdf} className={secondary}>
        <Eye size={13} /> View Contract
      </button>
    );
  }

  return null;
}

// ─── New Contract Modal ───────────────────────────────────────────────────────

function NewContractModal({ onClose, onCreated }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [specialConditions, setSpecialConditions] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('deals')
      .select('id, client_name, package')
      .eq('stage', 'closed_won')
      .order('client_name')
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setDeals(data || []);
        setLoading(false);
      });
  }, []);

  async function handleGenerate() {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('generate_contract', {
      p_deal_id: selected,
      p_special_conditions: specialConditions || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data?.already_exists) { toast.info('Contract already generated for this deal.'); onClose(); return; }
    toast.success('Contract generation queued — refresh in 15-30 seconds');
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">New Contract</h2>
          <button onClick={onClose} className="text-soft hover:text-white transition-colors">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={22} className="animate-spin text-brand" />
          </div>
        ) : deals.length === 0 ? (
          <p className="text-soft text-sm py-4 text-center">No closed-won deals without a contract.</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
            {deals.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                className={`flex items-center justify-between w-full px-3 py-2.5 rounded border text-left text-sm transition-colors ${
                  selected === d.id
                    ? 'border-brand/60 bg-brand/10 text-white'
                    : 'border-darkbg-border bg-darkbg-800 text-soft hover:text-white hover:border-darkbg-600'
                }`}
              >
                <span>{d.client_name}</span>
                <PackageBadge pkg={d.package} />
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div>
            <label className="block text-sm font-medium text-soft mb-1">
              Special Conditions / Additional Notes (optional)
            </label>
            <textarea
              className="w-full rounded border border-darkbg-border bg-darkbg-800 p-2 text-sm text-white placeholder:text-soft/50"
              rows={3}
              placeholder="Each line becomes a numbered condition in Part 10 of the MSA."
              value={specialConditions}
              onChange={(e) => setSpecialConditions(e.target.value)}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-darkbg-border bg-darkbg-800 text-soft hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!selected || busy}
            className="px-4 py-2 rounded border border-brand/40 bg-brand/10 text-brand hover:bg-brand/20 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Generate Contract
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Contracts() {
  const [tab, setTab] = useState('all');
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const rpcStatus = CLIENT_SIDE_TABS.has(tab) ? (RPC_TAB_MAP[tab] || 'all') : tab;

  async function fetchContracts() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_contracts_list', { p_status: rpcStatus });
    if (error) {
      toast.error(error.message);
      setContracts([]);
    } else {
      const rows = data || [];
      setContracts(CLIENT_SIDE_TABS.has(tab) ? applyClientFilter(tab, rows) : rows);
    }
    setLoading(false);
  }

  useEffect(() => { fetchContracts(); }, [tab]);

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileText size={20} className="text-brand" />
          Contracts
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded border border-brand/40 bg-brand/10 text-brand hover:bg-brand/20 text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          New Contract
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-darkbg-border pb-0">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.value
                ? 'border-brand text-brand'
                : 'border-transparent text-soft hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-brand" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <FileText size={40} className="text-darkbg-600" />
          <p className="text-soft text-sm">No contracts found for this filter.</p>
          {tab === 'all' && (
            <button
              onClick={() => setShowModal(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded border border-brand/40 bg-brand/10 text-brand hover:bg-brand/20 text-sm font-medium transition-colors"
            >
              <Plus size={14} /> Generate your first contract
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border text-soft text-xs uppercase tracking-wide">
                <th className="text-left py-3 px-4 font-medium">Client</th>
                <th className="text-left py-3 px-4 font-medium">Value</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Days in State</th>
                <th className="text-left py-3 px-4 font-medium">Holding</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkbg-border">
              {contracts.map((row) => (
                <tr key={row.id} className="hover:bg-darkbg-800/40 transition-colors">
                  {/* Client + package */}
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-white font-medium">{row.client_name || '—'}</span>
                      <PackageBadge pkg={row.package} />
                    </div>
                  </td>

                  {/* Contract value */}
                  <td className="py-3 px-4 text-white tabular-nums">
                    {money(contractValue(row))}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={row.status} />
                      {(row.open_mismatch_count || 0) > 0 && (
                        <AlertTriangle size={13} className="text-red-400" title="Has mismatches" />
                      )}
                    </div>
                  </td>

                  {/* Days in state */}
                  <td className="py-3 px-4 text-soft">
                    {daysInState(row.status_changed_at)}
                  </td>

                  {/* Holding party */}
                  <td className="py-3 px-4 text-soft">
                    {holdingParty(row)}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <ActionButtons row={row} onRefresh={fetchContracts} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Contract Modal */}
      {showModal && (
        <NewContractModal
          onClose={() => setShowModal(false)}
          onCreated={fetchContracts}
        />
      )}
    </div>
  );
}
