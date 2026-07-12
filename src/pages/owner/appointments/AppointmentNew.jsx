import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';

const APPT_TYPES = [
  { value: 'shop_visit',         emoji: '🏪', label: 'Shop Visit' },
  { value: 'pitch_meeting',      emoji: '🎯', label: 'Pitch Meeting' },
  { value: 'onboarding_call',    emoji: '📞', label: 'Onboarding Call' },
  { value: 'strategy_session',   emoji: '🧠', label: 'Strategy Session' },
  { value: 'review_meeting',     emoji: '📊', label: 'Review Meeting' },
  { value: 'contract_signing',   emoji: '✍️', label: 'Contract Signing' },
  { value: 'photo_shoot',        emoji: '📸', label: 'Photo Shoot' },
  { value: 'video_shoot',        emoji: '🎬', label: 'Video Shoot' },
  { value: 'content_delivery',   emoji: '📦', label: 'Content Delivery' },
  { value: 'training_session',   emoji: '🎓', label: 'Training Session' },
  { value: 'follow_up',          emoji: '🔄', label: 'Follow-up' },
  { value: 'client_check_in',    emoji: '👋', label: 'Client Check-in' },
  { value: 'site_survey',        emoji: '📍', label: 'Site Survey' },
  { value: 'handover',           emoji: '🤝', label: 'Handover' },
  { value: 'complaint_resolution', emoji: '⚠️', label: 'Complaint Resolution' },
  { value: 'upsell_meeting',     emoji: '💰', label: 'Upsell Meeting' },
  { value: 'renewal_meeting',    emoji: '🔁', label: 'Renewal Meeting' },
  { value: 'collection_visit',   emoji: '💳', label: 'Collection Visit' },
  { value: 'other',              emoji: '📋', label: 'Other' },
];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

export default function AppointmentNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leadId   = searchParams.get('lead')   || null;
  const ticketId = searchParams.get('ticket') || null;
  const clientId = searchParams.get('client') || null;
  const preType  = searchParams.get('type')   || '';

  const [form, setForm] = useState({
    appointment_type: preType,
    scheduled_at: '',
    duration_minutes: 30,
    location: '',
    notes: '',
    assigned_to: '',
  });
  const [busy, setBusy] = useState(false);

  const staffQ = useQuery({
    queryKey: ['staff_for_appt'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role, profiles!inner(full_name, email)')
        .in('role', ['owner', 'admin', 'field_agent', 'cpc', 'head_of_tech']);
      if (error) throw error;
      return (data || []).map(r => ({
        id: r.user_id,
        full_name: r.profiles?.full_name || r.profiles?.email || r.user_id,
      }));
    },
  });

  const leadQ = useQuery({
    queryKey: ['appt_lead', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, business_name, contact_person')
        .eq('id', leadId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Block the form until any prefetch it depends on has landed —
  // staff picker (always needed) and lead details (only when opening
  // from a lead). Otherwise the user sees an empty "Assign to"
  // dropdown or a lead-header flash.
  const waitingOnPrefetch = staffQ.isLoading || (leadId && leadQ.isLoading);
  if (waitingOnPrefetch) {
    return (
      <div className="mx-auto max-w-lg py-16 flex flex-col items-center gap-3 text-soft">
        <Loader2 size={24} className="animate-spin text-brandred" />
        <p className="text-sm">Getting things ready…</p>
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
    if (!form.appointment_type) { toast.error('Select an appointment type'); return; }
    if (!form.scheduled_at) { toast.error('Date & time required'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('create_appointment', {
        p_appointment_type: form.appointment_type,
        p_scheduled_at: new Date(form.scheduled_at).toISOString(),
        p_duration_minutes: form.duration_minutes,
        p_location: form.location.trim() || null,
        p_notes: form.notes.trim() || null,
        p_lead_id: leadId || null,
        p_client_id: clientId || null,
        p_ticket_id: ticketId || null,
        p_assigned_to: form.assigned_to || null,
      });
      if (error) throw error;
      toast.success('Appointment created ✓');
      if (leadId) navigate(`/owner/leads/${leadId}/inbox`);
      else navigate('/owner/appointments');
    } catch (err) {
      toast.error(err.message || 'Failed to create appointment');
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
        <h1 className="font-display text-2xl"><span className="text-gradient">New Appointment</span></h1>
        {leadQ.data && (
          <p className="mt-1 text-sm text-soft">
            For lead: <span className="text-white">{leadQ.data.business_name}</span>
          </p>
        )}
      </header>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="label">Type *</label>
          <div className="grid grid-cols-3 gap-2">
            {APPT_TYPES.map(t => (
              <button key={t.value} type="button"
                onClick={() => set('appointment_type', t.value)}
                className={`rounded-lg border p-2 text-center text-xs transition ${
                  form.appointment_type === t.value
                    ? 'border-brand bg-brand/20 text-white'
                    : 'border-darkbg-border text-soft hover:border-white/30'
                }`}>
                <span className="block text-lg">{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Date & Time *</label>
          <input type="datetime-local" value={form.scheduled_at}
            onChange={e => set('scheduled_at', e.target.value)}
            required className="input"/>
        </div>

        <div>
          <label className="label">Duration</label>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map(d => (
              <button key={d} type="button"
                onClick={() => set('duration_minutes', d)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  form.duration_minutes === d
                    ? 'border-brand bg-brand/20 text-white'
                    : 'border-darkbg-border text-soft hover:border-white/30'
                }`}>
                {d} min
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Assign to</label>
          <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} className="input">
            <option value="">Select staff member…</option>
            {(staffQ.data || []).map(s => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Location</label>
          <input type="text" value={form.location} onChange={e => set('location', e.target.value)}
            placeholder="Address or online link"
            className="input"/>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Anything to prepare?"
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
            {busy ? 'Creating…' : 'Create Appointment'}
          </button>
        </div>
      </form>
    </div>
  );
}
