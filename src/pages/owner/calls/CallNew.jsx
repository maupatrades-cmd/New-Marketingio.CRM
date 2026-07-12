import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Phone, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';

const OUTCOMES = [
  { value: 'connected_interested',     label: '✅ Connected — Interested',       bump: 'Qualified' },
  { value: 'connected_ready_to_buy',   label: '🔥 Connected — Ready to buy',     bump: 'Negotiation' },
  { value: 'connected_not_interested', label: '🚫 Connected — Not interested' },
  { value: 'connected_callback_later', label: '📅 Connected — Callback later' },
  { value: 'voicemail_left',           label: '📬 Voicemail left' },
  { value: 'no_answer',               label: '📵 No answer' },
  { value: 'wrong_number',            label: '❌ Wrong number' },
  { value: 'do_not_call',             label: '🔴 Do not call' },
  { value: 'busy',                    label: '📞 Busy' },
];

const WAS_ANSWERED = ['connected_interested', 'connected_not_interested', 'connected_callback_later', 'connected_ready_to_buy'];

export default function CallNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leadId   = searchParams.get('lead')   || null;
  const ticketId = searchParams.get('ticket') || null;
  const prefillPhone = searchParams.get('phone') || '';

  const [form, setForm] = useState({
    called_name: '',
    called_phone: prefillPhone,
    outcome: 'no_answer',
    duration: '',
    notes: '',
    follow_up_date: '',
  });
  const [busy, setBusy] = useState(false);

  // Load lead details if leadId present
  const leadQ = useQuery({
    queryKey: ['call_lead', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, business_name, contact_person, phone')
        .eq('id', leadId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Pre-fill from lead once, when it lands. Guarded in a useEffect so
  // we don't setState during render (React anti-pattern warning).
  useEffect(() => {
    if (!leadQ.data) return;
    setForm(f => {
      if (f.called_name || f.called_phone) return f;
      return {
        ...f,
        called_name: leadQ.data.contact_person || leadQ.data.business_name || '',
        called_phone: f.called_phone || leadQ.data.phone || '',
      };
    });
  }, [leadQ.data]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // If a lead was pre-selected, wait for its details to land before
  // showing the form — otherwise the fields flash empty then get
  // hydrated by the useEffect above.
  if (leadId && leadQ.isLoading) {
    return (
      <div className="mx-auto max-w-lg py-16 flex flex-col items-center gap-3 text-soft">
        <Loader2 size={24} className="animate-spin text-brandred" />
        <p className="text-sm">Loading lead details…</p>
      </div>
    );
  }
  if (leadId && leadQ.isError) {
    return (
      <div className="mx-auto max-w-lg py-16 flex flex-col items-center gap-3 text-soft">
        <p className="text-sm text-brandred">{leadQ.error?.message || "Couldn't load lead details."}</p>
        <button onClick={() => leadQ.refetch()}
                className="rounded-lg border border-darkbg-border px-4 py-2 text-sm text-white hover:brightness-110">
          Try again
        </button>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.called_phone.trim()) { toast.error('Phone number required'); return; }
    setBusy(true);
    try {
      const { data: result, error } = await supabase.rpc('log_call', {
        p_called_phone:    form.called_phone.trim(),
        p_outcome:         form.outcome,
        p_duration_seconds: form.duration ? parseInt(form.duration, 10) : 0,
        p_notes:           form.notes.trim() || null,
        p_lead_id:         leadId || null,
        p_ticket_id:       ticketId || null,
        p_follow_up_date:  form.follow_up_date || null,
        p_called_name:     form.called_name.trim() || null,
      });
      if (error) throw error;
      const msg = result?.stage_bumped
        ? `Call logged ✓ · Pipeline → ${result.new_stage}`
        : 'Call logged ✓';
      toast.success(msg);
      if (leadId) navigate(`/owner/leads/${leadId}/inbox`);
      else navigate('/owner/calls');
    } catch (err) {
      toast.error(err.message || 'Failed to log call');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <button onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-soft hover:text-white">
          <ArrowLeft size={14}/> Back
        </button>
        <h1 className="font-display text-2xl"><span className="text-gradient">Log a Call</span></h1>
        {leadQ.data && (
          <p className="mt-1 text-sm text-soft">
            For lead: <span className="text-white">{leadQ.data.business_name}</span>
          </p>
        )}
      </header>

      {/* Clickable tel link */}
      {form.called_phone && (
        <a
          href={`tel:${form.called_phone}`}
          className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-300 transition hover:bg-emerald-500/20"
        >
          <Phone size={18}/>
          <span className="font-mono text-lg">{form.called_phone}</span>
          <span className="ml-auto text-xs uppercase tracking-widest">Tap to call</span>
        </a>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="label">Called name</label>
          <input type="text" value={form.called_name} onChange={e => set('called_name', e.target.value)}
            placeholder="Contact person or business name"
            className="input"/>
        </div>

        <div>
          <label className="label">Phone number *</label>
          <input type="tel" value={form.called_phone} onChange={e => set('called_phone', e.target.value)}
            placeholder="0xx xxx xxxx"
            required className="input"/>
        </div>

        <div>
          <label className="label">Outcome *</label>
          <select value={form.outcome} onChange={e => set('outcome', e.target.value)} className="input">
            {OUTCOMES.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {OUTCOMES.find(o => o.value === form.outcome)?.bump && (
            <p className="mt-1 text-xs text-amber-300">
              ⚡ This outcome will auto-advance the deal pipeline → {OUTCOMES.find(o => o.value === form.outcome).bump}
            </p>
          )}
        </div>

        <div>
          <label className="label">Duration (seconds)</label>
          <input type="number" min="0" value={form.duration} onChange={e => set('duration', e.target.value)}
            placeholder="e.g. 120"
            className="input"/>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="What was discussed?"
            className="input"/>
        </div>

        <div>
          <label className="label">Follow-up date (optional)</label>
          <input type="date" value={form.follow_up_date} onChange={e => set('follow_up_date', e.target.value)}
            className="input"/>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="rounded-lg border border-darkbg-border px-4 py-2 text-sm text-soft hover:text-white">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-brandred px-4 py-2 text-sm text-white hover:brightness-110 disabled:opacity-50">
            <CheckCircle2 size={15}/>
            {busy ? 'Logging…' : 'Log call'}
          </button>
        </div>
      </form>
    </div>
  );
}
