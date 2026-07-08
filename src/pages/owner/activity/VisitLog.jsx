import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, MapPin, Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { Modal, Field } from './DialLog.jsx';

const VISIT_TYPES = [
  { key: 'discovery', label: 'Discovery' }, { key: 'follow_up', label: 'Follow-up' },
  { key: 'signing', label: 'Signing' }, { key: 'support', label: 'Support' }, { key: 'cold', label: 'Cold walk-in' },
];
const OUTCOMES = [
  { key: 'interested', label: 'Interested', tone: 'emerald' },
  { key: 'signed', label: 'Signed!', tone: 'emerald' },
  { key: 'deferred', label: 'Deferred', tone: 'amber' },
  { key: 'not_interested', label: 'Not interested', tone: 'gray' },
  { key: 'no_show', label: 'No show', tone: 'red' },
];
const TONE = {
  emerald: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  gray: 'bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20',
  red: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
};
const typeLabel = (k) => VISIT_TYPES.find(t => t.key === k)?.label ?? k;
const outcomeMeta = (k) => OUTCOMES.find(o => o.key === k) ?? { label: k, tone: 'gray' };
const fmtTime = (d) => new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function VisitLog() {
  const [modal, setModal] = useState(false);
  const [days, setDays] = useState(7);
  const [typeFilter, setTypeFilter] = useState('');

  const statsQ = useQuery({
    queryKey: ['visit-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_visit_stats', { p_days: 1 });
      if (error) throw error;
      return data;
    },
  });
  const logsQ = useQuery({
    queryKey: ['visit-logs', days, typeFilter],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_visit_logs', { p_days: days, p_visit_type: typeFilter || null }); if (error) throw error; return data ?? []; },
  });
  const s = statsQ.data ?? {};
  const rows = logsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><MapPin size={22} /> Visit Log</h1>
          <p className="text-sm text-gray-400 mt-1">Field agent door-to-door tracker.</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16} /> Log Visit</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Visits today" value={s.total_visits ?? 0} />
        <Stat label="Interested" value={s.interested ?? 0} tone="text-emerald-400" />
        <Stat label="Signed" value={s.signed ?? 0} tone="text-emerald-400" />
        <Stat label="Conversion" value={`${s.conversion_rate ?? 0}%`} tone="text-blue-400" />
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {[1, 7, 30].map(d => <button key={d} onClick={() => setDays(d)} className={`rounded px-2.5 py-1 text-xs ${days === d ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}>{d === 1 ? 'Today' : `${d}d`}</button>)}
        </div>
        <select className="input py-1.5 text-xs w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {VISIT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      {logsQ.isLoading ? <Spinner /> : rows.length === 0 ? <Empty label="No visits logged in this range." /> : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] card p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Time</th><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Business</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Location</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Follow-up</th>
            </tr></thead>
            <tbody>
              {rows.map(r => { const m = outcomeMeta(r.outcome); return (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtTime(r.created_at)}</td>
                  <td className="px-4 py-3 text-white">{r.field_agent_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{r.client_name ?? '—'}</td>
                  <td className="px-4 py-3"><span className="rounded-full px-2 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">{typeLabel(r.visit_type)}</span></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {r.gps_lat ? <a href={`https://maps.google.com/?q=${r.gps_lat},${r.gps_lng}`} target="_blank" rel="noreferrer" className="text-red-400 hover:underline">📍 map</a> : (r.location_address ?? '—')}
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] ${TONE[m.tone]}`}>{m.label}</span></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.next_step ? `${r.next_step}${r.next_step_due_date ? ' · ' + r.next_step_due_date : ''}` : '—'}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {modal && <LogVisitModal onClose={() => setModal(false)} />}
    </div>
  );
}

function LogVisitModal({ onClose }) {
  const qc = useQueryClient();
  const [gpsBusy, setGpsBusy] = useState(false);
  const [form, setForm] = useState({ visit_type: '', prospect_name: '', client_id: '', location_address: '', gps_lat: '', gps_lng: '', outcome: '', notes: '', next_step: '', next_step_due_date: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const clientsQ = useQuery({
    queryKey: ['clients-lite'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, business_name').order('business_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const useGps = () => {
    if (!navigator.geolocation) return toast.error('GPS not available');
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { set('gps_lat', String(pos.coords.latitude.toFixed(6))); set('gps_lng', String(pos.coords.longitude.toFixed(6))); setGpsBusy(false); toast.success('Location captured'); },
      (err) => { setGpsBusy(false); toast.error(err.message); },
    );
  };

  const mut = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.rpc('log_visit', { p_payload: form }); if (error) throw error; return data; },
    onSuccess: () => { toast.success('Visit logged!'); qc.invalidateQueries({ queryKey: ['visit-logs'] }); qc.invalidateQueries({ queryKey: ['visit-stats'] }); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const canSave = form.visit_type && form.outcome && (form.client_id || form.prospect_name.trim());

  return (
    <Modal onClose={onClose} title="Log Visit">
      <div className="mb-3">
        <label className="label">Visit type *</label>
        <div className="grid grid-cols-3 gap-2">
          {VISIT_TYPES.map(t => (
            <button key={t.key} type="button" onClick={() => set('visit_type', t.key)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${form.visit_type === t.key ? 'border-red-500 bg-red-500/20 text-white' : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-white'}`}>{t.label}</button>
          ))}
        </div>
      </div>

      <Field label="Existing client">
        <select className="input" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
          <option value="">— New prospect (type name below) —</option>
          {(clientsQ.data ?? []).map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
        </select>
      </Field>
      {!form.client_id && <Field label="New prospect name"><input className="input" value={form.prospect_name} onChange={e => set('prospect_name', e.target.value)} /></Field>}

      <Field label="Location">
        <div className="flex gap-2">
          <input className="input flex-1" value={form.location_address} onChange={e => set('location_address', e.target.value)} placeholder="Address" />
          <button type="button" onClick={useGps} disabled={gpsBusy} className="btn-secondary text-xs whitespace-nowrap">{gpsBusy ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />} GPS</button>
        </div>
        {form.gps_lat && <p className="text-[10px] text-emerald-400 mt-1">📍 {form.gps_lat}, {form.gps_lng}</p>}
      </Field>

      <div className="mb-3">
        <label className="label">Outcome *</label>
        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.map(o => (
            <button key={o.key} type="button" onClick={() => set('outcome', o.key)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${form.outcome === o.key ? 'border-red-500 bg-red-500/20 text-white' : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-white'}`}>{o.label}</button>
          ))}
        </div>
      </div>

      <Field label="Notes"><textarea className="input min-h-[70px]" value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Field label="Next step"><input className="input" value={form.next_step} onChange={e => set('next_step', e.target.value)} /></Field>
        <Field label="Due date"><input type="date" className="input" value={form.next_step_due_date} onChange={e => set('next_step_due_date', e.target.value)} /></Field>
      </div>

      <button onClick={() => mut.mutate()} disabled={!canSave || mut.isPending} className="btn-primary w-full">
        {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : null} Save visit
      </button>
    </Modal>
  );
}

function Stat({ label, value, tone = 'text-white' }) {
  return <div className="card p-4 text-center"><p className={`text-2xl font-bold ${tone}`}>{value}</p><p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</p></div>;
}
function Spinner() { return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>; }
function Empty({ label }) { return <p className="text-center text-sm text-gray-500 py-12">{label}</p>; }
