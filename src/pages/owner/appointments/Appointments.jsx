import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';

const TYPE_EMOJI = {
  shop_visit: '🏪', pitch_meeting: '🎯', onboarding_call: '📞',
  strategy_session: '🧠', review_meeting: '📊', contract_signing: '✍️',
  photo_shoot: '📸', video_shoot: '🎬', content_delivery: '📦',
  training_session: '🎓', follow_up: '🔄', client_check_in: '👋',
  site_survey: '📍', handover: '🤝', complaint_resolution: '⚠️',
  upsell_meeting: '💰', renewal_meeting: '🔁', collection_visit: '💳',
  other: '📋',
};

const STATUS_COLORS = {
  scheduled: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-300',
  no_show:   'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

const FILTERS = ['all', 'today', 'this_week', 'upcoming', 'completed', 'cancelled'];

export default function Appointments() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('upcoming');

  const { data: appts = [], isLoading } = useQuery({
    queryKey: ['appointments', filter],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('*')
        .order('scheduled_at', { ascending: true })
        .limit(100);

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

      if (filter === 'today') {
        q = q.gte('scheduled_at', today).lt('scheduled_at', today + 'T23:59:59');
      } else if (filter === 'this_week') {
        q = q.gte('scheduled_at', today).lte('scheduled_at', weekEnd);
      } else if (filter === 'upcoming') {
        q = q.gte('scheduled_at', today).eq('status', 'scheduled');
      } else if (filter === 'completed') {
        q = q.eq('status', 'completed');
      } else if (filter === 'cancelled') {
        q = q.eq('status', 'cancelled');
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  async function complete(id) {
    const { error } = await supabase.rpc('complete_appointment', { p_appointment_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success('Appointment completed');
    qc.invalidateQueries({ queryKey: ['appointments'] });
  }

  async function cancel(id) {
    const { error } = await supabase.rpc('cancel_appointment', { p_appointment_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success('Appointment cancelled');
    qc.invalidateQueries({ queryKey: ['appointments'] });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl"><span className="text-gradient">Appointments</span></h1>
        <button onClick={() => navigate('/owner/appointments/new')}
          className="inline-flex items-center gap-2 rounded-lg bg-brandred px-4 py-2 text-sm text-white hover:brightness-110">
          <Plus size={15}/> New Appointment
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
              filter === f ? 'border-brand bg-brand/20 text-white' : 'border-darkbg-border text-soft hover:border-white/30'
            }`}>
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-soft text-sm">Loading…</p>
      ) : appts.length === 0 ? (
        <div className="card p-8 text-center">
          <Calendar className="mx-auto mb-3 text-soft" size={32}/>
          <p className="text-soft">No appointments found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appts.map(a => (
            <div key={a.id} className="card flex items-center gap-4 p-4">
              <span className="text-2xl">{TYPE_EMOJI[a.appointment_type] || '📋'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">
                  {a.appointment_type.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-soft">
                  {new Date(a.scheduled_at).toLocaleString()} · {a.duration_minutes} min
                  {a.location && ` · ${a.location}`}
                </p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[a.status] || ''}`}>
                {a.status}
              </span>
              {a.status === 'scheduled' && (
                <div className="flex gap-1">
                  <button onClick={() => complete(a.id)} title="Complete"
                    className="rounded p-1 text-emerald-400 hover:bg-emerald-500/20">
                    <CheckCircle2 size={16}/>
                  </button>
                  <button onClick={() => cancel(a.id)} title="Cancel"
                    className="rounded p-1 text-red-400 hover:bg-red-500/20">
                    <XCircle size={16}/>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
