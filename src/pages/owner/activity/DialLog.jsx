import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Phone, Plus, Play, Square, RotateCcw, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';

const OUTCOMES = [
  { key: 'connected_qualified',   label: 'Qualified ✓',   tone: 'emerald' },
  { key: 'connected_unqualified', label: 'Unqualified',   tone: 'amber' },
  { key: 'connected_callback',    label: 'Callback set',  tone: 'blue' },
  { key: 'voicemail',             label: 'Voicemail',     tone: 'gray' },
  { key: 'no_answer',             label: 'No answer',     tone: 'gray' },
  { key: 'busy',                  label: 'Busy',          tone: 'gray' },
  { key: 'disconnected',          label: 'Disconnected',  tone: 'red' },
  { key: 'wrong_number',          label: 'Wrong number',  tone: 'red' },
  { key: 'do_not_call',           label: 'Do not call',   tone: 'red' },
];
const TONE = {
  emerald: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  blue: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
  gray: 'bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20',
  red: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
};
const outcomeMeta = (k) => OUTCOMES.find(o => o.key === k) ?? { label: k, tone: 'gray' };
const fmtDur = (s) => { if (!s) return '—'; const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const fmtTime = (d) => new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function DialLog() {
  const [modal, setModal] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [days, setDays] = useState(7);

  const statsQ = useQuery({ queryKey: ['call-stats'], queryFn: async () => (await supabase.rpc('get_call_stats', { p_days: 1 })).data });
  const logsQ = useQuery({
    queryKey: ['call-logs', days, outcomeFilter],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_call_logs', { p_days: days, p_outcome: outcomeFilter || null }); if (error) throw error; return data ?? []; },
  });
  const s = statsQ.data ?? {};
  const rows = logsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Phone size={22} /> Dial Log</h1>
          <p className="text-sm text-gray-400 mt-1">CPC cold-call tracker.</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16} /> Log Call</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Calls today" value={s.total_calls ?? 0} />
        <Stat label="Qualified" value={s.qualified ?? 0} tone="text-emerald-400" />
        <Stat label="Avg duration" value={fmtDur(s.avg_duration)} />
        <Stat label="Conversion" value={`${s.conversion_rate ?? 0}%`} tone="text-blue-400" />
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {[1, 7, 30].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`rounded px-2.5 py-1 text-xs ${days === d ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}>{d === 1 ? 'Today' : `${d}d`}</button>
          ))}
        </div>
        <select className="input py-1.5 text-xs w-auto" value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}>
          <option value="">All outcomes</option>
          {OUTCOMES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {logsQ.isLoading ? <Spinner /> : rows.length === 0 ? <Empty label="No calls logged in this range." /> : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] card p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Time</th><th className="px-4 py-3">CPC</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Warm?</th><th className="px-4 py-3">Follow-up</th>
            </tr></thead>
            <tbody>
              {rows.map(r => { const m = outcomeMeta(r.outcome); return (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtTime(r.created_at)}</td>
                  <td className="px-4 py-3 text-white">{r.cpc_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono">{r.prospect_phone}</td>
                  <td className="px-4 py-3 text-gray-300">{r.prospect_business_name ?? '—'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] ${TONE[m.tone]}`}>{m.label}</span></td>
                  <td className="px-4 py-3 text-gray-400">{fmtDur(r.call_duration_seconds)}</td>
                  <td className="px-4 py-3">{r.led_to_warm_lead ? <span className="text-emerald-400 text-xs">Yes</span> : <span className="text-gray-600 text-xs">—</span>}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.next_step ? `${r.next_step}${r.next_step_due_date ? ' · ' + r.next_step_due_date : ''}` : '—'}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {modal && <LogCallModal onClose={() => setModal(false)} />}
    </div>
  );
}

function LogCallModal({ onClose }) {
  const qc = useQueryClient();
  const [secs, setSecs] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef(null);
  const [form, setForm] = useState({ prospect_phone: '', prospect_business_name: '', outcome: '', notes: '', led_to_warm_lead: false, next_step: '', next_step_due_date: '' });

  useEffect(() => {
    if (running) timerRef.current = setInterval(() => setSecs(s => s + 1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [running]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('log_call', { p_payload: { ...form, call_duration_seconds: secs ? String(secs) : '' } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Call logged!');
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      qc.invalidateQueries({ queryKey: ['call-stats'] });
      if (form.led_to_warm_lead) { onClose(); window.history.pushState({}, '', '/owner/leads/new'); window.dispatchEvent(new PopStateEvent('popstate')); return; }
      setForm({ prospect_phone: '', prospect_business_name: '', outcome: '', notes: '', led_to_warm_lead: false, next_step: '', next_step_due_date: '' });
      setSecs(0); setRunning(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const canSave = form.prospect_phone.trim() && form.outcome;

  return (
    <Modal onClose={onClose} title="Log Call">
      <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 flex items-center justify-between mb-4">
        <span className="font-mono text-2xl text-white">{fmtDur(secs) === '—' ? '0:00' : fmtDur(secs)}</span>
        <div className="flex gap-2">
          {!running ? <button onClick={() => setRunning(true)} className="btn-secondary text-xs"><Play size={12} /> Start</button>
                    : <button onClick={() => setRunning(false)} className="btn-secondary text-xs"><Square size={12} /> Stop</button>}
          <button onClick={() => { setSecs(0); setRunning(false); }} className="btn-ghost text-xs"><RotateCcw size={12} /></button>
        </div>
      </div>

      <Field label="Phone number *"><input type="tel" className="input" value={form.prospect_phone} onChange={e => set('prospect_phone', e.target.value)} placeholder="082 000 0000" /></Field>
      <Field label="Business name"><input className="input" value={form.prospect_business_name} onChange={e => set('prospect_business_name', e.target.value)} /></Field>

      <div className="mb-3">
        <label className="label">Outcome *</label>
        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.map(o => (
            <button key={o.key} type="button" onClick={() => set('outcome', o.key)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${form.outcome === o.key ? 'border-red-500 bg-red-500/20 text-white' : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-white'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Field label={`Notes (${form.notes.length}/200)`}>
        <textarea className="input min-h-[70px]" maxLength={200} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </Field>

      <label className="flex items-center gap-2 mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 cursor-pointer">
        <input type="checkbox" checked={form.led_to_warm_lead} onChange={e => set('led_to_warm_lead', e.target.checked)} className="accent-emerald-500" />
        <span className="text-sm text-emerald-300">Convert to warm lead (opens lead form on save)</span>
      </label>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Field label="Next step"><input className="input" value={form.next_step} onChange={e => set('next_step', e.target.value)} placeholder="e.g. Send proposal" /></Field>
        <Field label="Due date"><input type="date" className="input" value={form.next_step_due_date} onChange={e => set('next_step_due_date', e.target.value)} /></Field>
      </div>

      <button onClick={() => mut.mutate()} disabled={!canSave || mut.isPending} className="btn-primary w-full">
        {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : null} Save {form.led_to_warm_lead ? '& open lead' : '& next'}
      </button>
    </Modal>
  );
}

// shared bits
export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-white/[0.08] shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({ label, children }) {
  return <div className="mb-3"><label className="label">{label}</label>{children}</div>;
}
function Stat({ label, value, tone = 'text-white' }) {
  return <div className="card p-4 text-center"><p className={`text-2xl font-bold ${tone}`}>{value}</p><p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</p></div>;
}
function Spinner() { return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>; }
function Empty({ label }) { return <p className="text-center text-sm text-gray-500 py-12">{label}</p>; }
