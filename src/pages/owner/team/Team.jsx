import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Users, TrendingUp, LayoutGrid, DollarSign, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';

const TABS = [
  { key: 'roster', label: 'Staff Roster', icon: Users },
  { key: 'kpis', label: 'Performance', icon: TrendingUp },
  { key: 'assignments', label: 'Assignments', icon: LayoutGrid },
  { key: 'payroll', label: 'Payroll', icon: DollarSign },
];
const ROLE_TONE = {
  owner: 'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20',
  admin: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
  head_of_tech: 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20',
  field_agent: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  cpc: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
};
const STATUS_TONE = {
  active: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  on_leave: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  terminated: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
};
const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
const roleLabel = (r) => (r ?? '').replace(/_/g, ' ');

export default function Team() {
  const [tab, setTab] = useState('roster');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Team</h1>
        <p className="text-sm text-gray-400 mt-1">Roster, performance, assignments and payroll.</p>
      </div>
      <div className="flex gap-1 rounded-xl bg-white/[0.04] border border-white/[0.06] p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t.key ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'roster' && <Roster />}
      {tab === 'kpis' && <Performance />}
      {tab === 'assignments' && <Assignments />}
      {tab === 'payroll' && <Payroll />}
    </div>
  );
}

function Roster() {
  const q = useQuery({
    queryKey: ['team-roster'],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_team_roster'); if (error) throw error; return data ?? []; },
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <Err msg={q.error?.message} />;
  const rows = q.data ?? [];
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.06] card p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.user_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
              <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.employee_code ?? '—'}</td>
              <td className="px-4 py-3 text-white">{r.full_name ?? '—'}</td>
              <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${ROLE_TONE[r.role] ?? 'bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20'}`}>{roleLabel(r.role)}</span></td>
              <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${STATUS_TONE[r.employment_status] ?? STATUS_TONE.active}`}>{roleLabel(r.employment_status)}</span></td>
              <td className="px-4 py-3 text-gray-400">{r.phone ?? '—'}</td>
              <td className="px-4 py-3 text-gray-400">{r.email ?? '—'}</td>
              <td className="px-4 py-3 text-gray-400">{r.joined_date ? new Date(r.joined_date).toLocaleDateString('en-ZA') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Performance() {
  const q = useQuery({
    queryKey: ['staff-kpis'],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_staff_kpis'); if (error) throw error; return data ?? []; },
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <Err msg={q.error?.message} />;
  const rows = q.data ?? [];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map(s => (
        <div key={s.user_id} className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-white">{s.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${ROLE_TONE[s.role] ?? 'bg-gray-500/10 text-gray-400'}`}>{roleLabel(s.role)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Deals closed" value={s.deals_closed} />
            <Kpi label="Commission" value={fmtZar(s.commission_earned)} />
            <Kpi label="Leads" value={s.leads_submitted} />
            <Kpi label="Tasks done" value={s.tasks_completed} />
            <Kpi label="Pipeline" value={fmtZar(s.pipeline_value)} />
            <Kpi label="Contracts loaded" value={s.contracts_loaded} />
          </div>
        </div>
      ))}
    </div>
  );
}
function Kpi({ label, value }) {
  return (
    <div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
    </div>
  );
}

function Assignments() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['client-assignments'],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_client_assignments'); if (error) throw error; return data ?? []; },
  });
  const staffQ = useQuery({
    queryKey: ['team-roster'],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_team_roster'); if (error) throw error; return data ?? []; },
  });
  const mut = useMutation({
    mutationFn: async ({ client_id, role, user_id }) => {
      const { error } = await supabase.rpc('assign_staff_to_client', { p_client_id: client_id, p_role: role, p_user_id: user_id || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Assignment updated'); qc.invalidateQueries({ queryKey: ['client-assignments'] }); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <Err msg={q.error?.message} />;
  const rows = q.data ?? [];
  const staff = staffQ.data ?? [];
  const agents = staff.filter(s => s.role === 'field_agent');
  const cpcs = staff.filter(s => s.role === 'cpc');

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.06] card p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Client</th><th className="px-4 py-3">Field Agent</th><th className="px-4 py-3">CPC</th><th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const fully = r.field_agent_id && r.cpc_id;
            return (
              <tr key={r.client_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white">{r.client_name}</td>
                <td className="px-4 py-3">
                  <AssignSelect value={r.field_agent_id} options={agents}
                                onChange={(v) => mut.mutate({ client_id: r.client_id, role: 'field_agent', user_id: v })} />
                </td>
                <td className="px-4 py-3">
                  <AssignSelect value={r.cpc_id} options={cpcs}
                                onChange={(v) => mut.mutate({ client_id: r.client_id, role: 'cpc', user_id: v })} />
                </td>
                <td className="px-4 py-3">
                  {fully
                    ? <span className="inline-flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 size={12} /> Assigned</span>
                    : <span className="inline-flex items-center gap-1 text-amber-400 text-xs"><AlertTriangle size={12} /> {!r.field_agent_id ? 'No agent' : 'No CPC'}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function AssignSelect({ value, options, onChange }) {
  return (
    <select className="input py-1 text-xs" value={value ?? ''} onChange={e => onChange(e.target.value)}>
      <option value="">— unassigned —</option>
      {options.map(o => <option key={o.user_id} value={o.user_id}>{o.full_name}</option>)}
    </select>
  );
}

function Payroll() {
  const q = useQuery({
    queryKey: ['payroll-summary'],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_payroll_summary'); if (error) throw error; return data; },
  });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <Err msg={q.error?.message} />;
  const staff = q.data?.staff ?? [];
  const rows = staff.map(s => ({ ...s, net: Number(s.commission ?? 0) + Number(s.contract_loaded_fees ?? 0) }));

  const exportCsv = () => {
    const header = ['Staff', 'Role', 'Commission', 'Contract-loaded fees', 'Net'];
    const lines = rows.map(r => [r.name, r.role, r.commission, r.contract_loaded_fees, r.net].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `payroll-${q.data.month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-400">Cycle {q.data?.month} · cut-off {q.data?.cutoff}th · pay date {q.data?.pay_date}th</p>
        <button onClick={exportCsv} className="btn-secondary text-xs"><Download size={14} /> Export CSV</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/[0.06] card p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Staff</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Commission</th>
              <th className="px-4 py-3">Loaded fees</th><th className="px-4 py-3">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.user_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white">{r.name}</td>
                <td className="px-4 py-3 text-gray-400">{roleLabel(r.role)}</td>
                <td className="px-4 py-3 text-gray-300">{fmtZar(r.commission)}</td>
                <td className="px-4 py-3 text-gray-300">{fmtZar(r.contract_loaded_fees)}</td>
                <td className="px-4 py-3 text-white font-semibold">{fmtZar(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Spinner() { return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>; }
function Err({ msg }) { return <div className="text-red-400 text-sm">{msg}</div>; }
