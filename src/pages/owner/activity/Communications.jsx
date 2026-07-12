import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, MessageSquare, Plus, Phone, Mail, MapPin, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { Modal, Field } from './DialLog.jsx';

const CHANNELS = [
  { key: 'phone', label: 'Phone', icon: Phone },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'in_person', label: 'In person', icon: MapPin },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
];
const OUTCOMES = [
  { key: 'meeting_scheduled', label: 'Meeting scheduled', tone: 'emerald' },
  { key: 'objection_raised', label: 'Objection raised', tone: 'amber' },
  { key: 'follow_up_needed', label: 'Follow-up needed', tone: 'blue' },
  { key: 'closed_won', label: 'Closed won', tone: 'emerald' },
  { key: 'no_response', label: 'No response', tone: 'gray' },
  { key: 'resolved', label: 'Resolved', tone: 'emerald' },
  { key: 'other', label: 'Other', tone: 'purple' },
];
const TONE = {
  emerald: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  blue: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
  gray: 'bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20',
  purple: 'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20',
};
const channelMeta = (k) => CHANNELS.find(c => c.key === k) ?? { label: k, icon: MessageSquare };
const outcomeMeta = (k) => OUTCOMES.find(o => o.key === k);
const fmtTime = (d) => new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Communications() {
  const [modal, setModal] = useState(false);
  const [days, setDays] = useState(7);
  const [channelFilter, setChannelFilter] = useState('');

  const logsQ = useQuery({
    queryKey: ['communications', days, channelFilter],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_communications', { p_days: days, p_channel: channelFilter || null }); if (error) throw error; return data ?? []; },
  });
  const rows = logsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><MessageSquare size={22} /> Communications</h1>
          <p className="text-sm text-gray-400 mt-1">Every staff interaction with clients, across all channels.</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary"><Plus size={16} /> Log Communication</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {[1, 7, 30].map(d => <button key={d} onClick={() => setDays(d)} className={`rounded px-2.5 py-1 text-xs ${days === d ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}>{d === 1 ? 'Today' : `${d}d`}</button>)}
        </div>
        <select className="input py-1.5 text-xs w-auto" value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
          <option value="">All channels</option>
          {CHANNELS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>

      {logsQ.isLoading ? <Spinner /> : rows.length === 0 ? <Empty label="No communications logged in this range." /> : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] card p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Time</th><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Dir</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Follow-up</th>
            </tr></thead>
            <tbody>
              {rows.map(r => { const cm = channelMeta(r.channel); const om = outcomeMeta(r.outcome); const CI = cm.icon; return (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtTime(r.occurred_at)}</td>
                  <td className="px-4 py-3 text-white">{r.logged_by_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{r.client_name ?? '—'}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-gray-300"><CI size={13} /> {cm.label}</span></td>
                  <td className="px-4 py-3">{r.direction === 'inbound' ? <ArrowLeft size={14} className="text-blue-400" /> : <ArrowRight size={14} className="text-emerald-400" />}</td>
                  <td className="px-4 py-3 text-gray-300">{r.subject}</td>
                  <td className="px-4 py-3">{om ? <span className={`rounded-full px-2 py-0.5 text-[10px] ${TONE[om.tone]}`}>{om.label}</span> : '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.follow_up_required ? (r.follow_up_date ?? 'Yes') : '—'}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {modal && <LogCommModal onClose={() => setModal(false)} />}
    </div>
  );
}

function LogCommModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ client_id: '', channel: '', direction: 'outbound', subject: '', body: '', duration_minutes: '', outcome: '', follow_up_required: false, follow_up_date: '', follow_up_notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const clientsQ = useQuery({
    queryKey: ['clients-lite'],
    queryFn: async () => { const { data } = await supabase.from('clients').select('id, business_name').order('business_name'); return data ?? []; },
  });

  const mut = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.rpc('log_communication', { p_payload: form }); if (error) throw error; return data; },
    onSuccess: () => { toast.success('Communication logged!'); qc.invalidateQueries({ queryKey: ['communications'] }); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const canSave = form.channel && form.subject.trim();

  return (
    <Modal onClose={onClose} title="Log Communication">
      <Field label="Client">
        <select className="input" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
          <option value="">— Select client —</option>
          {(clientsQ.data ?? []).map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
        </select>
      </Field>

      <div className="mb-3">
        <label className="label">Channel *</label>
        <div className="grid grid-cols-5 gap-2">
          {CHANNELS.map(c => { const CI = c.icon; return (
            <button key={c.key} type="button" onClick={() => set('channel', c.key)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] transition ${form.channel === c.key ? 'border-red-500 bg-red-500/20 text-white' : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-white'}`}>
              <CI size={16} /> {c.label}
            </button>
          );})}
        </div>
      </div>

      <div className="mb-3">
        <label className="label">Direction</label>
        <div className="flex gap-2">
          {['outbound', 'inbound'].map(d => (
            <button key={d} type="button" onClick={() => set('direction', d)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${form.direction === d ? 'border-red-500 bg-red-500/20 text-white' : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-white'}`}>
              {d === 'outbound' ? 'Outbound (we contacted them)' : 'Inbound (they contacted us)'}
            </button>
          ))}
        </div>
      </div>

      <Field label="Subject *"><input className="input" value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="What was discussed" /></Field>
      <Field label="Notes"><textarea className="input min-h-[70px]" value={form.body} onChange={e => set('body', e.target.value)} /></Field>
      <Field label="Duration (minutes)"><input type="number" className="input" value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} /></Field>

      <div className="mb-3">
        <label className="label">Outcome</label>
        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.map(o => (
            <button key={o.key} type="button" onClick={() => set('outcome', o.key)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${form.outcome === o.key ? 'border-red-500 bg-red-500/20 text-white' : 'border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-white'}`}>{o.label}</button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={form.follow_up_required} onChange={e => set('follow_up_required', e.target.checked)} className="accent-red-500" />
        <span className="text-sm text-gray-300">Follow-up required</span>
      </label>
      {form.follow_up_required && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Field label="Follow-up date"><input type="date" className="input" value={form.follow_up_date} onChange={e => set('follow_up_date', e.target.value)} /></Field>
          <Field label="Follow-up notes"><input className="input" value={form.follow_up_notes} onChange={e => set('follow_up_notes', e.target.value)} placeholder="e.g. Send mockup" /></Field>
        </div>
      )}

      <button onClick={() => mut.mutate()} disabled={!canSave || mut.isPending} className="btn-primary w-full">
        {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : null} Save
      </button>
    </Modal>
  );
}

function Spinner() { return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>; }
function Empty({ label }) { return <p className="text-center text-sm text-gray-500 py-12">{label}</p>; }
