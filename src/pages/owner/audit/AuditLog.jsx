import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ScrollText, Filter } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';

const RANGES = [{ d: 7, label: '7d' }, { d: 14, label: '14d' }, { d: 30, label: '30d' }, { d: 90, label: '90d' }];
const ENTITIES = ['', 'leads', 'deals', 'contracts', 'invoices', 'commissions', 'clients', 'tasks', 'deliverables'];
const ACTIONS = ['', 'INSERT', 'UPDATE', 'DELETE'];

const ENTITY_TONE = {
  deals: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
  invoices: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  leads: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  commissions: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  contracts: 'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20',
};
const ACTION_TONE = {
  INSERT: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  UPDATE: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
  DELETE: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
};
const CUSTOM_EVENT = {
  lead_qualified: '✅ Lead verified', lead_converted: '🎯 Lead converted to deal',
  cpc_r87_accrued: '💰 CPC lead fee earned (R87)', admin_load_deduction: '📋 Admin contract-loaded fee (R25)',
  hot_lead_alert_dispatched: '🔥 Hot lead alert sent', cold_lead_scan_completed: '❄️ Cold lead scan ran',
  lead_milestone_dispatched: '📊 Lead milestone notification', contract_approved: '📝 Contract approved by owner',
};

const RECORD_PATH = {
  deals: (id) => `/owner/sales`, contracts: (id) => `/owner/contracts/${id}`,
  invoices: () => `/owner/money/invoices`, leads: (id) => `/owner/leads/${id}/inbox`,
};

export default function AuditLog() {
  const [days, setDays] = useState(7);
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [search, setSearch] = useState('');

  const sumQ = useQuery({
    queryKey: ['audit-summary', days],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_audit_summary', { p_days: days }); if (error) throw error; return data; },
  });
  const logQ = useQuery({
    queryKey: ['audit-log', days, table, action, actor, search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_audit_log', {
        p_days: days, p_table: table || null, p_action: action || null,
        p_actor: actor || null, p_search: search || null, p_limit: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = logQ.data ?? [];
  const grouped = groupByDate(rows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ScrollText size={22} /> Audit Log</h1>
        <p className="text-sm text-gray-400 mt-1">Every material change across the CRM.</p>
      </div>

      {/* Summary */}
      {sumQ.data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SumCard label="Total" value={sumQ.data.total_events} />
          <SumCard label="Inserts" value={sumQ.data.inserts} tone="text-emerald-400" />
          <SumCard label="Updates" value={sumQ.data.updates} tone="text-blue-400" />
          <SumCard label="Deletes" value={sumQ.data.deletes} tone="text-red-400" />
          <SumCard label="Custom" value={sumQ.data.custom} tone="text-purple-400" />
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500"><Filter size={12} /> Filters</div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
            {RANGES.map(r => (
              <button key={r.d} onClick={() => setDays(r.d)}
                      className={`rounded px-2.5 py-1 text-xs ${days === r.d ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}>{r.label}</button>
            ))}
          </div>
          <select className="input py-1.5 text-xs w-auto" value={table} onChange={e => setTable(e.target.value)}>
            {ENTITIES.map(e => <option key={e} value={e}>{e || 'All entities'}</option>)}
          </select>
          <select className="input py-1.5 text-xs w-auto" value={action} onChange={e => setAction(e.target.value)}>
            {ACTIONS.map(a => <option key={a} value={a}>{a || 'All actions'}</option>)}
          </select>
          <input className="input py-1.5 text-xs w-auto flex-1 min-w-[160px]" placeholder="Search table / action / actor…"
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Timeline */}
      {logQ.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-12">No events match these filters.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, events]) => (
            <div key={date}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">{date}</p>
              <div className="space-y-2">
                {events.map(ev => <AuditRow key={ev.id} ev={ev} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditRow({ ev }) {
  const custom = CUSTOM_EVENT[ev.action];
  const time = new Date(ev.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const path = RECORD_PATH[ev.table_name]?.(ev.row_id);
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <span className="font-mono">{time}</span>
        <span className="text-white font-semibold uppercase">{ev.actor_name}</span>
      </div>
      {custom ? (
        <p className="text-sm text-white">{custom}</p>
      ) : (
        <p className="text-sm text-gray-300">
          <span className="capitalize">{ev.action?.toLowerCase()}</span> on <span className="text-white">{ev.table_name}</span>
        </p>
      )}
      {ev.action === 'UPDATE' && <AuditDiff before={ev.before_data} after={ev.after_data} />}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${ENTITY_TONE[ev.table_name] ?? 'bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20'}`}>{ev.table_name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${ACTION_TONE[ev.action] ?? 'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20'}`}>{ev.action}</span>
        {path && <a href={`#${path}`} onClick={(e) => { e.preventDefault(); window.location.hash = ''; window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }} className="text-xs text-red-400 hover:underline ml-auto">View record →</a>}
      </div>
    </div>
  );
}

function AuditDiff({ before, after }) {
  if (!after || typeof after !== 'object') return null;
  const changed = Object.keys(after).filter(k => JSON.stringify(before?.[k]) !== JSON.stringify(after[k])).slice(0, 8);
  if (!changed.length) return null;
  return (
    <div className="space-y-1 mt-2">
      {changed.map(key => (
        <div key={key} className="text-xs">
          <span className="text-gray-500 font-mono">{key}:</span>{' '}
          <span className="text-red-400 line-through">{fmtVal(before?.[key])}</span>
          {' → '}
          <span className="text-emerald-400">{fmtVal(after[key])}</span>
        </div>
      ))}
    </div>
  );
}
function fmtVal(v) { if (v == null) return 'null'; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 60 ? s.slice(0, 60) + '…' : s; }

function SumCard({ label, value, tone = 'text-white' }) {
  return (
    <div className="card p-4 text-center">
      <p className={`text-2xl font-bold ${tone}`}>{value ?? 0}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function groupByDate(rows) {
  const out = {};
  for (const r of rows) {
    const d = new Date(r.created_at).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
    (out[d] ??= []).push(r);
  }
  return out;
}
