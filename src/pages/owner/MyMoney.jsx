import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DollarSign, Download, TrendingUp, Coins, Receipt,
  X as XIcon, Wallet, CheckCircle2, Ban, CreditCard,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];
const ZAR = (v) => v == null ? '—' : `R ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
const STATUS_TONE = {
  pending:      { cls: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',   label: 'pending' },
  paid:         { cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', label: 'paid' },
  withheld:     { cls: 'border-orange-500/40 bg-orange-500/10 text-orange-300',     label: 'withheld' },
  clawback:     { cls: 'border-brandred/40 bg-brandred/10 text-brandred',           label: 'clawback' },
};
const TYPE_COLORS = ['#e63946', '#ffb347', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fbbf24'];
const ROLE_TYPE_FOCUS = {
  cpc:         ['lead_fee', 'cpc_closure_bonus'],
  field_agent: ['setup_commission'],
  admin:       ['admin_contract_load', 'retainer_commission'],
  owner:       [],
  head_of_tech:[],
};

export default function MyMoney() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isManager = MANAGER_ROLES.includes(role);
  const [viewAs, setViewAs] = useState(null);
  const targetUserId = isManager && viewAs ? viewAs : user?.id;
  const [tab, setTab] = useState('commissions');
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [detail, setDetail] = useState(null);
  const [commModal, setCommModal] = useState(null);
  // commModal = null | { type: 'approve'|'pay'|'withhold', row }

  async function handleApprove(row) {
    const { error } = await supabase.rpc('approve_commission', { p_commission_id: row.id });
    if (error) {
      if (error.message?.includes('setup_fee')) {
        toast.error('Cannot approve — setup fee not yet cleared for this deal.');
      } else {
        toast.error(error.message || 'Approve failed');
      }
      return;
    }
    toast.success('Commission approved');
    setCommModal(null);
    qc.invalidateQueries({ queryKey: ['my_commissions', targetUserId] });
    qc.invalidateQueries({ queryKey: ['my_money_summary', targetUserId] });
  }

  async function handlePay(row, payrollMonth) {
    const { error } = await supabase.rpc('pay_commission', {
      p_commission_id: row.id, p_payroll_month: payrollMonth,
    });
    if (error) { toast.error(error.message || 'Pay failed'); return; }
    toast.success('Commission marked as paid');
    setCommModal(null);
    qc.invalidateQueries({ queryKey: ['my_commissions', targetUserId] });
    qc.invalidateQueries({ queryKey: ['my_money_summary', targetUserId] });
  }

  async function handleWithhold(row, reason) {
    const { error } = await supabase.rpc('withhold_commission', {
      p_commission_id: row.id, p_reason: reason,
    });
    if (error) { toast.error(error.message || 'Withhold failed'); return; }
    toast.success('Commission withheld');
    setCommModal(null);
    qc.invalidateQueries({ queryKey: ['my_commissions', targetUserId] });
    qc.invalidateQueries({ queryKey: ['my_money_summary', targetUserId] });
  }

  const staffQ = useQuery({
    queryKey: ['money_staff_list'],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, full_name, email')
        .order('full_name', { ascending: true }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const summaryQ = useQuery({
    queryKey: ['my_money_summary', targetUserId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_money_summary',
        isManager && viewAs ? { p_user_id: viewAs } : {});
      if (error) throw error;
      return data;
    },
  });

  const commissionsQ = useQuery({
    queryKey: ['my_commissions', targetUserId],
    enabled: !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select('id, commission_type, client_name, package_or_addon, base_amount, rate_percent, commission_amount, status, qualifying_event_date, paid_date, payroll_month, deal_id, clawback_reason, notes')
        .eq('staff_id', targetUserId)
        .order('qualifying_event_date', { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invoicesQ = useQuery({
    queryKey: ['my_invoices', targetUserId],
    enabled: !!targetUserId && tab === 'invoices',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_name, invoice_type, total_amount, issue_date, due_date, status, deals!inner(closer_id)')
        .eq('deals.closer_id', targetUserId)
        .order('issue_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthOptions = useMemo(() => {
    const set = new Set();
    (commissionsQ.data ?? []).forEach(c => {
      const d = c.qualifying_event_date || c.paid_date;
      if (d) set.add(d.slice(0, 7));
    });
    return [...set].sort().reverse().slice(0, 12);
  }, [commissionsQ.data]);

  const filteredCommissions = useMemo(() => {
    const rows = commissionsQ.data ?? [];
    return rows.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (monthFilter !== 'all') {
        const d = (c.qualifying_event_date || c.paid_date || '').slice(0, 7);
        if (d !== monthFilter) return false;
      }
      return true;
    });
  }, [commissionsQ.data, statusFilter, monthFilter]);

  const filteredSum = filteredCommissions.reduce((s, c) => s + Number(c.commission_amount || 0), 0);
  const s = summaryQ.data || {};
  const focusTypes = ROLE_TYPE_FOCUS[role] ?? [];

  function exportCSV() {
    const rows = filteredCommissions;
    if (rows.length === 0) { toast.error('Nothing to export'); return; }
    const head = ['date','client','type','base_zar','rate_pct','commission_zar','status','paid_date'];
    const lines = [head.join(',')].concat(rows.map(r => [
      r.qualifying_event_date ?? '',
      JSON.stringify(r.client_name ?? ''),
      r.commission_type ?? '',
      r.base_amount ?? 0,
      r.rate_percent ?? 0,
      r.commission_amount ?? 0,
      r.status ?? '',
      r.paid_date ?? '',
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my_commissions_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} rows`);
  }

  const trendData = useMemo(() => {
    const t = s.monthly_trend ?? [];
    return t.map(r => ({ month: r.month, amount: Number(r.amount || 0) }));
  }, [s.monthly_trend]);

  const typeData = useMemo(() => {
    const cnt = s.count_by_type ?? {};
    return Object.entries(cnt).map(([type, count], i) => ({
      name: type.replace(/_/g, ' '),
      type,
      value: Number(count),
      fill: TYPE_COLORS[i % TYPE_COLORS.length],
    }));
  }, [s.count_by_type]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl"><span className="text-gradient">My Money</span></h1>
          <p className="mt-1 text-sm text-soft">
            Commissions · invoices on deals you closed · 12-month trend
            {focusTypes.length > 0 && <span className="ml-2 text-soft/70">· {role} focus: {focusTypes.map(t => t.replace(/_/g,' ')).join(' + ')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <select
              value={viewAs ?? ''}
              onChange={(e) => setViewAs(e.target.value || null)}
              className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 text-sm text-white"
            >
              <option value="">Self</option>
              {(staffQ.data ?? []).filter(x => x.id !== user?.id).map(x => (
                <option key={x.id} value={x.id}>{x.full_name || x.email}</option>
              ))}
            </select>
          )}
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-sm text-soft hover:text-white"
          >
            <Download size={14}/> Export CSV
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={Wallet}     label="This Month"  value={ZAR(s.paid_this_month)}/>
        <Kpi icon={Wallet}     label="Last Month"  value={ZAR(s.paid_last_month)}    tone="muted"/>
        <Kpi icon={TrendingUp} label="YTD"         value={ZAR(s.paid_ytd)}/>
        <Kpi icon={Coins}      label="Pending"     value={ZAR(s.pending_total)}      tone="pending"/>
        <Kpi icon={DollarSign} label="Lifetime"    value={ZAR(s.paid_lifetime)}/>
      </section>

      {/* Pending approval split — per sale_approval_rules.v1 */}
      {(s.pending_awaiting_approval != null || s.approved_awaiting_payroll != null) && (
        <section className="flex flex-wrap gap-2">
          {s.pending_awaiting_approval != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-300">
              <Coins size={12}/> Awaiting owner approval: {ZAR(s.pending_awaiting_approval)}
            </span>
          )}
          {s.approved_awaiting_payroll != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              <Coins size={12}/> Approved — waiting for payroll: {ZAR(s.approved_awaiting_payroll)}
            </span>
          )}
        </section>
      )}

      <nav className="flex items-center gap-1 border-b border-darkbg-border">
        {[
          { id: 'commissions', label: 'Commissions', icon: Coins },
          { id: 'invoices',    label: 'Invoices',    icon: Receipt },
          { id: 'trend',       label: 'Trend',       icon: TrendingUp },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
              tab === t.id ? 'border-brandred text-white' : 'border-transparent text-soft hover:text-white'}`}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </nav>

      {tab === 'commissions' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {['all','pending','approved','paid','withheld','clawback'].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
                  statusFilter === f ? 'border-brandred bg-brandred/10 text-brandred' : 'border-darkbg-border text-soft hover:text-white'
                }`}>{f.replace('_',' ')}</button>
            ))}
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
              className="ml-2 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1 text-xs text-white">
              <option value="all">All months</option>
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="ml-auto text-xs text-soft">
              {filteredCommissions.length} row{filteredCommissions.length !== 1 ? 's' : ''} · {ZAR(filteredSum)}
            </span>
          </div>

          {commissionsQ.isLoading && <p className="text-soft text-sm">Loading…</p>}
          {!commissionsQ.isLoading && filteredCommissions.length === 0 && (
            <p className="card p-6 text-center text-sm text-soft">No commissions match the filter.</p>
          )}

          {filteredCommissions.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-darkbg-border text-left text-xs uppercase tracking-widest text-soft">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Base</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                    <th className="px-3 py-2">Status</th>
                    {isManager && <th className="px-3 py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredCommissions.map(c => {
                    const t = STATUS_TONE[c.status] || { cls: 'border-darkbg-border text-soft', label: c.status };
                    return (
                      <tr key={c.id} onClick={() => setDetail(c)}
                          className="cursor-pointer border-b border-darkbg-border/40 transition hover:bg-darkbg-900/40">
                        <td className="px-3 py-2 text-soft">{c.qualifying_event_date ?? '—'}</td>
                        <td className="px-3 py-2 text-white">{c.client_name ?? '—'}</td>
                        <td className="px-3 py-2 text-soft">{c.commission_type.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-right text-soft">{ZAR(c.base_amount)}</td>
                        <td className="px-3 py-2 text-right text-soft">{c.rate_percent ?? 0}%</td>
                        <td className="px-3 py-2 text-right text-white">{ZAR(c.commission_amount)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${t.cls}`}>
                            {t.label}
                          </span>
                        </td>
                        {isManager && (
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1">
                              {c.status === 'pending' && (
                                <button onClick={() => setCommModal({ type: 'approve', row: c })}
                                  className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20">
                                  <CheckCircle2 size={10}/> Approve
                                </button>
                              )}
                              {c.status === 'approved' && (
                                <button onClick={() => setCommModal({ type: 'pay', row: c })}
                                  className="inline-flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-300 hover:bg-blue-500/20">
                                  <CreditCard size={10}/> Pay
                                </button>
                              )}
                              {(c.status === 'pending' || c.status === 'approved') && (
                                <button onClick={() => setCommModal({ type: 'withhold', row: c })}
                                  className="inline-flex items-center gap-1 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[11px] text-orange-300 hover:bg-orange-500/20">
                                  <Ban size={10}/> Withhold
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-darkbg-border">
                    <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-widest text-soft">Total</td>
                    <td className="px-3 py-2 text-right font-display text-base text-white">{ZAR(filteredSum)}</td>
                    <td colSpan={isManager ? 2 : 1}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'invoices' && (
        <section className="space-y-3">
          <p className="text-xs text-soft">Invoices on deals you closed.</p>
          {invoicesQ.isLoading && <p className="text-soft text-sm">Loading…</p>}
          {!invoicesQ.isLoading && (invoicesQ.data ?? []).length === 0 && (
            <p className="card p-6 text-center text-sm text-soft">No invoices linked to your deals yet.</p>
          )}
          {(invoicesQ.data ?? []).length > 0 && (
            <div className="card overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-darkbg-border text-left text-xs uppercase tracking-widest text-soft">
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Issued</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesQ.data.map(inv => (
                    <tr key={inv.id} className="border-b border-darkbg-border/40">
                      <td className="px-3 py-2 text-white">{inv.invoice_number ?? '—'}</td>
                      <td className="px-3 py-2 text-soft">{inv.client_name ?? '—'}</td>
                      <td className="px-3 py-2 text-soft">{inv.invoice_type ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-white">{ZAR(inv.total_amount)}</td>
                      <td className="px-3 py-2 text-soft">{inv.issue_date ?? '—'}</td>
                      <td className="px-3 py-2 text-soft">{inv.due_date ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded-full border border-darkbg-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-soft">
                          {inv.status ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'trend' && (
        <section className="space-y-5">
          <div className="card p-5">
            <header className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-lg text-white">Last 12 months — paid</h2>
              <p className="text-xs text-soft">R per month</p>
            </header>
            {trendData.length === 0 ? (
              <p className="py-8 text-center text-sm text-soft">No payouts yet.</p>
            ) : (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <XAxis dataKey="month" stroke="#9aa3b2" fontSize={11}/>
                    <YAxis stroke="#9aa3b2" fontSize={11} tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`}/>
                    <Tooltip
                      contentStyle={{ background: '#11141c', border: '1px solid #232838', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => ZAR(v)}
                    />
                    <Line type="monotone" dataKey="amount" stroke="#e63946" strokeWidth={2} dot/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card p-5">
            <header className="mb-2">
              <h2 className="font-display text-lg text-white">Count by type</h2>
              <p className="text-xs text-soft">How many of each commission type you've earned</p>
            </header>
            {typeData.length === 0 ? (
              <p className="py-8 text-center text-sm text-soft">No commission rows yet.</p>
            ) : (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                      {typeData.map((d, i) => <Cell key={i} fill={d.fill}/>)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11, color: '#9aa3b2' }}/>
                    <Tooltip
                      contentStyle={{ background: '#11141c', border: '1px solid #232838', borderRadius: 8, fontSize: 12 }}
                      formatter={(v, n) => [`${v} row${v !== 1 ? 's' : ''}`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}

      {detail && <CommissionDetailModal row={detail} onClose={() => setDetail(null)}/>}
      {commModal?.type === 'approve' && (
        <CommActionModal title="Approve Commission" confirmLabel="Approve"
          body={`Approve ${ZAR(commModal.row.commission_amount)} for ${commModal.row.client_name}?`}
          onClose={() => setCommModal(null)}
          onConfirm={() => handleApprove(commModal.row)}/>
      )}
      {commModal?.type === 'pay' && (
        <PayModal row={commModal.row} onClose={() => setCommModal(null)} onConfirm={handlePay}/>
      )}
      {commModal?.type === 'withhold' && (
        <WithholdModal row={commModal.row} onClose={() => setCommModal(null)} onConfirm={handleWithhold}/>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }) {
  const cls = tone === 'pending' ? 'border border-yellow-500/30 bg-yellow-500/5'
            : tone === 'muted'   ? 'opacity-70'
            : '';
  return (
    <div className={`card p-4 ${cls}`}>
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-soft">
        <Icon size={13}/> {label}
      </div>
      <p className="font-display text-xl text-white">{value}</p>
    </div>
  );
}

function CommissionDetailModal({ row, onClose }) {
  const t = STATUS_TONE[row.status] || { cls: '', label: row.status };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-darkbg-900/80 p-4">
      <div className="card w-full max-w-lg p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg text-white">{row.client_name}</h2>
            <p className="text-xs text-soft">{row.commission_type.replace(/_/g, ' ')} · {row.qualifying_event_date ?? '—'}</p>
          </div>
          <button onClick={onClose} className="text-soft hover:text-white"><XIcon size={18}/></button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Base"           value={ZAR(row.base_amount)}/>
          <Detail label="Rate"           value={`${row.rate_percent ?? 0}%`}/>
          <Detail label="Commission"     value={ZAR(row.commission_amount)}/>
          <Detail label="Status"         value={<span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${t.cls}`}>{t.label}</span>}/>
          <Detail label="Payroll month"  value={row.payroll_month ?? '—'}/>
          <Detail label="Paid date"      value={row.paid_date ?? '—'}/>
          <Detail label="Package/add-on" value={row.package_or_addon ?? '—'}/>
          <Detail label="Deal"           value={row.deal_id ? <a className="text-brandred hover:underline" href={`/owner/sales/leads?deal=${row.deal_id}`}>Open deal →</a> : '—'}/>
        </dl>
        {row.clawback_reason && (
          <div className="rounded border border-brandred/30 bg-brandred/5 p-3 text-xs text-brandred">
            <p className="font-semibold uppercase tracking-widest">Clawback reason</p>
            <p className="mt-1">{row.clawback_reason}</p>
          </div>
        )}
        {row.notes && <p className="text-xs text-soft whitespace-pre-line">{row.notes}</p>}
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-soft">{label}</dt>
      <dd className="mt-0.5 text-sm text-white">{value}</dd>
    </div>
  );
}

function CommActionModal({ title, body, confirmLabel, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
        <h2 className="mb-3 font-display text-lg text-white">{title}</h2>
        <p className="mb-5 text-sm text-soft">{body}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-darkbg-border px-4 py-2 text-xs text-soft hover:text-white">Cancel</button>
          <button onClick={onConfirm} className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white hover:brightness-110">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function PayModal({ row, onClose, onConfirm }) {
  const defaultMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(defaultMonth);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
        <h2 className="mb-1 font-display text-lg text-white">Mark as Paid</h2>
        <p className="mb-4 text-sm text-soft">{ZAR(row.commission_amount)} for {row.client_name}</p>
        <label className="block text-sm text-soft">Payroll month
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="mt-1 w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-white"/>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-darkbg-border px-4 py-2 text-xs text-soft hover:text-white">Cancel</button>
          <button onClick={() => month && onConfirm(row, month)} disabled={!month}
            className="rounded-lg bg-brandred px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:brightness-110">
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}

function WithholdModal({ row, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-darkbg-border bg-darkbg-800 p-6 shadow-2xl">
        <h2 className="mb-1 font-display text-lg text-white">Withhold Commission</h2>
        <p className="mb-4 text-sm text-soft">{ZAR(row.commission_amount)} for {row.client_name}</p>
        <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Reason for withholding (required)…"
          className="w-full rounded-lg border border-darkbg-border bg-darkbg-900 px-3 py-2 text-sm text-white placeholder:text-soft/40 focus:border-brandred focus:outline-none"/>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-darkbg-border px-4 py-2 text-xs text-soft hover:text-white">Cancel</button>
          <button onClick={() => reason.trim() && onConfirm(row, reason.trim())} disabled={!reason.trim()}
            className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:brightness-110">
            Withhold
          </button>
        </div>
      </div>
    </div>
  );
}
