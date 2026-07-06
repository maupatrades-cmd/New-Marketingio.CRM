import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, User, Building2, Mail, Phone, MessageCircle, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };

const PREF_ROWS = [
  { key: 'email_invoice_issued',    param: 'p_invoice',     label: 'Email me when an invoice is issued' },
  { key: 'email_deliverable_ready', param: 'p_deliverable', label: 'Email me when a deliverable is ready' },
  { key: 'email_monthly_report',    param: 'p_report',      label: 'Email me when a monthly report is available' },
  { key: 'email_payment_received',  param: 'p_payment',     label: 'Email me when a payment is received' },
];

export default function ClientProfile() {
  const qc = useQueryClient();
  const profQ = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) throw error;
      if (data?.ok === false) throw new Error('Not a client');
      return data;
    },
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (profQ.data?.client && !form) {
      const c = profQ.data.client;
      setForm({
        contact_person: c.contact_person ?? '',
        phone: c.phone ?? '',
        whatsapp_number: c.whatsapp_number ?? '',
        website: c.website ?? '',
        address: c.address ?? '',
      });
    }
  }, [profQ.data, form]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('client_self_update', { p_payload: form });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Profile saved'); qc.invalidateQueries({ queryKey: ['my-profile'] }); },
    onError: (err) => toast.error(err.message),
  });

  const prefMut = useMutation({
    mutationFn: async ({ param, value }) => {
      const { error } = await supabase.rpc('update_my_notification_prefs', { [param]: value });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-profile'] }),
    onError: (err) => toast.error(err.message),
  });

  if (profQ.isLoading || !form) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your profile..." position="inline" />
    </div>
  );
  if (profQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={profQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );

  const c = profQ.data.client;
  const deal = profQ.data.deal;
  const prefs = profQ.data.preferences || {};

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Your account details.</p>
      </div>

      {/* Read-only */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">Account</p>
        <Row icon={Building2} label="Business" value={c.business_name} />
        <Row icon={Mail} label="Email" value={c.email} />
        <Row icon={User} label="Package" value={PACKAGE_LABEL[deal?.package] ?? deal?.package ?? '—'} />
        <Row icon={User} label="Member since" value={c.created_at ? new Date(c.created_at).toLocaleDateString('en-ZA') : '—'} />
      </section>

      {/* Editable */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">Contact details</p>
        <Field label="Contact person" value={form.contact_person} onChange={v => setForm({ ...form, contact_person: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
          <Field label="WhatsApp" value={form.whatsapp_number} onChange={v => setForm({ ...form, whatsapp_number: v })} />
        </div>
        <Field label="Website" value={form.website} onChange={v => setForm({ ...form, website: v })} />
        <Field label="Address" value={form.address} onChange={v => setForm({ ...form, address: v })} />
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className="inline-flex items-center gap-1 rounded-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-sm transition">
          {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </button>
      </section>

      {/* Notification preferences */}
      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">Email notifications</p>
        {PREF_ROWS.map(({ key, param, label }) => {
          const on = prefs[key] ?? true;
          return (
            <label key={key} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-[#0B2143]">{label}</span>
              <input type="checkbox" checked={on}
                     onChange={e => prefMut.mutate({ param, value: e.target.checked })}
                     className="h-4 w-4 rounded border-gray-200 accent-red-500" />
            </label>
          );
        })}
      </section>

      <TeamSection />

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs uppercase tracking-widest text-gray-500">Need to update your business name or email?</p>
        <a href="https://wa.me/27768038987" target="_blank" rel="noreferrer"
           className="mt-1 inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 transition">
          <MessageCircle size={14} /> Message us on WhatsApp
        </a>
      </div>
    </div>
  );
}

function TeamSection() {
  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_dashboard');
      if (error) throw error;
      return data;
    },
  });
  const team = dashQ.data?.team ?? [];
  if (!team.length) return null;
  return (
    <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-6">
      <p className="text-xs uppercase tracking-widest text-gray-500 mb-4">Your Marketing iO Team</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {team.map((m, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-100 to-purple-100 mx-auto mb-3 flex items-center justify-center text-lg font-bold text-[#0B2143]">
              {m.name?.charAt(0) ?? '?'}
            </div>
            <p className="font-semibold text-[#0B2143] text-sm">{m.name}</p>
            <p className="text-xs text-gray-400">{m.role}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-1 text-gray-500 shrink-0" />
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
        <p className="text-sm text-[#0B2143] mt-0.5">{value || <span className="text-gray-500 italic">Not set</span>}</p>
      </div>
    </div>
  );
}
function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="label-light">{label}</label>
      <input className="input-light" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
