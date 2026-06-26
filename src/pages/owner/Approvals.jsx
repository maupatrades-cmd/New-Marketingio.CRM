import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DollarSign, FileText, Handshake, Target, Package,
  ClipboardCheck, FolderOpen, Settings, RefreshCw,
  Clock, CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import Modal from '../../components/Modal.jsx';

const TABS = [
  { key: 'commissions', label: 'Commissions & Pay',    icon: DollarSign,      sla: 3,  ownerOnly: true },
  { key: 'payroll',     label: 'Payroll & Payslips',   icon: FileText,        sla: 1,  ownerOnly: true,  soon: true },
  { key: 'sales',       label: 'Sales & Deals',        icon: Handshake,       sla: 2 },
  { key: 'leads',       label: 'Leads',                icon: Target,          sla: 1 },
  { key: 'fulfilment',  label: 'Fulfilment',           icon: Package,         sla: 5 },
  { key: 'paperwork',   label: 'Paperwork',            icon: ClipboardCheck,  sla: 2 },
  { key: 'tasks',       label: 'Tasks & Tickets',      icon: FolderOpen,      sla: 7 },
  { key: 'finance',     label: 'Finance & Billing',    icon: Settings,        sla: 2 },
];

const ACTION_LABELS = {
  approve:         { label: 'Approve',   cls: 'bg-green-600 hover:bg-green-500 text-white' },
  withhold:        { label: 'Withhold',  cls: 'border border-yellow-500 text-yellow-400 hover:bg-yellow-500/10' },
  reject:          { label: 'Reject',    cls: 'border border-red-500 text-red-400 hover:bg-red-500/10' },
  verify:          { label: 'Verify',    cls: 'bg-green-600 hover:bg-green-500 text-white' },
  confirm:         { label: 'Confirm',   cls: 'bg-green-600 hover:bg-green-500 text-white' },
  dispute:         { label: 'Dispute',   cls: 'border border-yellow-500 text-yellow-400 hover:bg-yellow-500/10' },
  request_changes: { label: 'Changes',   cls: 'border border-darkbg-border text-soft hover:text-white' },
};

const MONEY_ACTIONS = new Set(['approve']); // require confirm modal when category is commissions or finance

function AgeBadge({ days, sla }) {
  const cls = days > sla
    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
    : days > 0
      ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
      : 'bg-darkbg-800 text-soft border border-darkbg-border';
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>
      {days === 0 ? 'today' : `${days}d`}
    </span>
  );
}

function ApprovalRow({ item, sla, onAction, busy }) {
  const actions = item.action_codes ?? [];
  return (
    <div className="flex items-start gap-3 py-3 border-b border-darkbg-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.title}</p>
        {item.subtitle && <p className="text-xs text-soft mt-0.5 truncate">{item.subtitle}</p>}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <AgeBadge days={item.age_days} sla={sla}/>
          {item.amount_zar && (
            <span className="text-xs text-brandred font-mono">
              R{Number(item.amount_zar).toLocaleString('en-ZA')}
            </span>
          )}
          {item.requester_name && (
            <span className="text-xs text-soft">{item.requester_name}</span>
          )}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {actions.map(code => {
          const cfg = ACTION_LABELS[code];
          if (!cfg) return null;
          return (
            <button key={code}
              disabled={busy}
              onClick={() => onAction(item, code)}
              className={`text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-40 ${cfg.cls}`}>
              {cfg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Approvals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('commissions');
  const [confirmItem, setConfirmItem] = useState(null); // { item, code }
  const [busy, setBusy] = useState(false);

  const { data: counts = {} } = useQuery({
    queryKey: ['approval-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_approval_counts');
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  const currentTab = TABS.find(t => t.key === activeTab);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['approvals', activeTab],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pending_approvals', {
        p_category: activeTab,
        p_limit: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !currentTab?.soon,
  });

  const urgentItems = items.filter(i => i.age_days > (currentTab?.sla ?? 3));

  async function execAction(item, code) {
    setBusy(true);
    try {
      let error;
      if (item.category === 'commissions') {
        if (code === 'approve') ({ error } = await supabase.rpc('approve_commission', { p_commission_id: item.id }));
        else if (code === 'withhold') ({ error } = await supabase.rpc('withhold_commission', { p_commission_id: item.id }));
      } else if (item.category === 'leads') {
        if (code === 'verify') ({ error } = await supabase.rpc('verify_lead', { p_lead_id: item.id }));
        else if (code === 'reject') ({ error } = await supabase.rpc('reject_lead', { p_lead_id: item.id }));
      } else if (item.category === 'finance') {
        if (code === 'approve') ({ error } = await supabase.rpc('approve_payment_proof', { p_proof_id: item.id }));
        else if (code === 'reject') ({ error } = await supabase.rpc('reject_payment_proof', { p_proof_id: item.id }));
      } else if (item.category === 'tasks') {
        if (code === 'confirm') ({ error } = await supabase.rpc('confirm_lead_ticket', { p_ticket_id: item.id }));
        else if (code === 'dispute') ({ error } = await supabase.rpc('dispute_lead_ticket', { p_ticket_id: item.id }));
      } else if (item.category === 'sales') {
        if (code === 'approve') ({ error } = await supabase.rpc('approve_lead_ticket', { p_ticket_id: item.id }));
        else if (code === 'reject') ({ error } = await supabase.rpc('reject_lead_ticket', { p_ticket_id: item.id }));
      }

      if (error) throw error;
      toast.success(`${code.charAt(0).toUpperCase() + code.slice(1)} — done`);
      qc.invalidateQueries({ queryKey: ['approvals', activeTab] });
      qc.invalidateQueries({ queryKey: ['approval-counts'] });
    } catch (err) {
      const msg = err?.message ?? String(err);
      if (msg.includes('gate_failed:')) {
        const reason = msg.split('gate_failed:')[1]?.trim().replace(/_/g, ' ');
        toast.error(`🔒 Locked — ${reason}`);
      } else {
        toast.error(msg || 'Action failed');
      }
    } finally {
      setBusy(false);
      setConfirmItem(null);
    }
  }

  function handleAction(item, code) {
    const needsConfirm = MONEY_ACTIONS.has(code) && (item.category === 'commissions' || (item.category === 'finance' && (item.amount_zar ?? 0) >= 5000));
    if (needsConfirm) {
      setConfirmItem({ item, code });
    } else {
      execAction(item, code);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl"><span className="text-gradient">Approvals Centre</span></h1>
        <p className="mt-1 text-sm text-soft">Every pending yes/no across the business — one screen.</p>
      </header>

      {/* Urgent strip */}
      {urgentItems.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-red-400"/>
            <span className="text-sm font-medium text-red-300">Needs you now — {urgentItems.length} item{urgentItems.length > 1 ? 's' : ''} past SLA</span>
          </div>
          <div className="space-y-1">
            {urgentItems.slice(0, 3).map(i => (
              <p key={i.id} className="text-xs text-red-200/70 truncate">{i.title} · {i.age_days}d</p>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(tab => {
          const count = counts[tab.key] ?? 0;
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const hasUrgent = count > 0;
          return (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                isActive
                  ? 'bg-brandred text-white'
                  : 'text-soft hover:text-white hover:bg-darkbg-800'
              }`}>
              <Icon size={12}/>
              {tab.label}
              {count > 0 && (
                <span className={`ml-0.5 text-[10px] rounded-full px-1.5 py-0.5 font-mono ${
                  hasUrgent && !isActive ? 'bg-red-500 text-white' : 'bg-darkbg-800 text-soft'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="card p-4">
        {currentTab?.soon ? (
          <div className="py-12 text-center">
            <FileText className="mx-auto mb-3 text-soft" size={32}/>
            <p className="font-medium text-white">Coming soon</p>
            <p className="text-sm text-soft mt-1">Payroll backend is being built.</p>
          </div>
        ) : isLoading ? (
          <p className="py-8 text-center text-soft text-sm">Loading…</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 text-green-400" size={32}/>
            <p className="font-medium text-white">All clear</p>
            <p className="text-sm text-soft mt-1">Nothing pending in this category.</p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-soft mb-3">{items.length} item{items.length > 1 ? 's' : ''}</p>
            {items.map(item => (
              <ApprovalRow
                key={item.id + item.item_type}
                item={item}
                sla={currentTab?.sla ?? 3}
                onAction={handleAction}
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <Modal
        open={!!confirmItem}
        onClose={() => setConfirmItem(null)}
        title="Confirm action"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmItem(null)} className="btn-ghost text-sm px-4 py-2">Cancel</button>
            <button
              disabled={busy}
              onClick={() => execAction(confirmItem.item, confirmItem.code)}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
              {busy ? 'Processing…' : 'Confirm'}
            </button>
          </div>
        }
      >
        {confirmItem && (
          <div className="space-y-2">
            <p className="text-sm">{confirmItem.code === 'approve' ? 'Approve this item?' : 'Proceed?'}</p>
            <div className="rounded-lg bg-darkbg-800 px-3 py-2">
              <p className="text-sm font-medium text-white">{confirmItem.item.title}</p>
              {confirmItem.item.amount_zar && (
                <p className="text-brandred font-mono text-sm mt-1">
                  R{Number(confirmItem.item.amount_zar).toLocaleString('en-ZA')}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
