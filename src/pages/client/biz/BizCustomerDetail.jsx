import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Star, Trash2, Save, Mail, Phone, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';
import { getIndustryConfig } from '../../../constants/industryConfig.js';
import MascotGuide from '../../../components/MascotGuide.jsx';

const fmtZar = (n) => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'history', label: 'History' },
  { key: 'emails',  label: 'Emails' },
];

export default function BizCustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('profile');

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => (await supabase.rpc('get_client_dashboard')).data,
  });
  const cfg = getIndustryConfig(dashQ.data?.client?.industry);

  const listQ = useQuery({
    queryKey: ['biz-customers-single', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('biz_get_customers', {
        p_search: null, p_status: 'all', p_tag: null, p_sort: 'newest', p_limit: 500, p_offset: 0,
      });
      if (error) throw error;
      return (data?.customers ?? []).find(c => c.id === id);
    },
  });

  const bookingsQ = useQuery({
    queryKey: ['biz-customer-bookings', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('biz_get_bookings', {
        p_status: null, p_from: null, p_to: null, p_customer_id: id, p_limit: 100,
      });
      if (error) throw error;
      return data?.bookings ?? [];
    },
  });

  if (listQ.isLoading) return <div className="py-12"><MascotGuide phase="thinking" size={80} message="Loading..." position="inline" /></div>;
  const c = listQ.data;
  if (!c) return <div className="py-12"><MascotGuide phase="sad" size={80} message={`${cfg.customerLabel} not found`} position="inline" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => nav('/client/my-business/customers')} className="rounded-full p-2 hover:bg-gray-100 transition">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {c.is_favorite && <Star size={16} className="text-amber-400 fill-amber-400" />}
            <h1 className="font-display text-2xl text-[#0B2143]">{c.full_name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
            {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-red-500"><Phone size={12} /> {c.phone}</a>}
            {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-emerald-600"><MessageCircle size={12} /> WhatsApp</a>}
            {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-red-500"><Mail size={12} /> {c.email}</a>}
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-400">Bookings</p>
          <p className="font-display text-2xl text-[#0B2143] mt-1">{c.total_bookings ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-400">Total spent</p>
          <p className="font-display text-2xl text-emerald-600 mt-1">{fmtZar(c.total_spent)}</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-400">Avg spend</p>
          <p className="font-display text-2xl text-[#0B2143] mt-1">{fmtZar(c.average_spend)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === t.key ? 'border-[#E2293B] text-[#E2293B]' : 'border-transparent text-gray-500 hover:text-[#0B2143]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab customer={c} onSaved={() => { qc.invalidateQueries({ queryKey: ['biz-customers-single', id] }); qc.invalidateQueries({ queryKey: ['biz-customers'] }); }} cfg={cfg} />}
      {tab === 'history' && <HistoryTab bookings={bookingsQ.data ?? []} loading={bookingsQ.isLoading} cfg={cfg} />}
      {tab === 'emails' && <EmailsTab customer={c} bookings={bookingsQ.data ?? []} />}
    </div>
  );
}

function ProfileTab({ customer, onSaved, cfg }) {
  const [form, setForm] = useState({
    full_name: customer.full_name || '',
    phone: customer.phone || '',
    email: customer.email || '',
    whatsapp: customer.whatsapp || '',
    address: customer.address || '',
    notes: customer.notes || '',
    is_favorite: customer.is_favorite || false,
    birthday: customer.birthday || '',
    anniversary: customer.anniversary || '',
    tags: (customer.tags || []).join(', '),
    status: customer.status || 'active',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      const { data, error } = await supabase.rpc('biz_update_customer', { p_id: customer.id, p_payload: payload });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast.success('Saved.'); onSaved(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('biz_delete_customer', { p_id: customer.id, p_hard: false });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
    },
    onSuccess: () => { toast.success('Archived.'); onSaved(); window.history.back(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5 space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Full name" value={form.full_name} onChange={v => set('full_name', v)} />
        <Field label="Status" value={form.status} onChange={v => set('status', v)} type="select" options={['active','inactive','blacklisted']} />
        <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} />
        <Field label="WhatsApp" value={form.whatsapp} onChange={v => set('whatsapp', v)} />
        <Field label="Email" value={form.email} onChange={v => set('email', v)} type="email" />
        <Field label="Address" value={form.address} onChange={v => set('address', v)} />
        <Field label="Birthday" value={form.birthday} onChange={v => set('birthday', v)} type="date" />
        <Field label="Anniversary" value={form.anniversary} onChange={v => set('anniversary', v)} type="date" />
      </div>
      <Field label="Tags (comma-separated)" value={form.tags} onChange={v => set('tags', v)} placeholder="VIP, regular, wholesale" />
      <Field label="Notes" value={form.notes} onChange={v => set('notes', v)} type="textarea" />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.is_favorite} onChange={e => set('is_favorite', e.target.checked)} />
        Favorite ⭐
      </label>
      <div className="flex justify-between pt-2">
        <button onClick={() => { if (confirm(`Archive ${customer.full_name}?`)) deleteMut.mutate(); }}
                className="inline-flex items-center gap-2 text-red-500 text-sm font-semibold hover:text-red-600">
          <Trash2 size={14} /> Archive {cfg.customerLabel}
        </button>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50">
          <Save size={14} /> {saveMut.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, options }) {
  const cls = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200';
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      {type === 'textarea' ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className={cls} placeholder={placeholder} />
      ) : type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={cls}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls} placeholder={placeholder} />
      )}
    </div>
  );
}

function HistoryTab({ bookings, loading, cfg }) {
  if (loading) return <div className="py-6"><MascotGuide phase="thinking" size={64} message="Loading history..." position="inline" /></div>;
  if (bookings.length === 0) return <div className="py-6"><MascotGuide phase="guide" size={64} message={`No ${cfg.bookingLabel.toLowerCase()}s yet.`} position="inline" /></div>;
  return (
    <ul className="divide-y divide-gray-100 rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm">
      {bookings.map(b => (
        <li key={b.id}>
          <Link to={`/client/my-business/bookings/${b.id}`} className="flex items-center justify-between p-4 hover:bg-gray-50 transition group">
            <div>
              <p className="text-sm font-semibold text-[#0B2143] group-hover:text-red-500">{new Date(b.booking_date).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              <p className="text-[11px] uppercase tracking-widest text-gray-400 mt-1">{b.status}</p>
              {b.notes && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{b.notes}</p>}
            </div>
            <p className="text-sm font-semibold text-emerald-600">{fmtZar(b.amount)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EmailsTab({ customer, bookings }) {
  const events = [];
  if (customer.welcome_email_sent_at) events.push({ at: customer.welcome_email_sent_at, kind: 'Welcome email' });
  bookings.forEach(b => { if (b.confirmation_sent_at) events.push({ at: b.confirmation_sent_at, kind: 'Booking confirmation', bookingId: b.id }); });
  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  if (events.length === 0) return <div className="py-6"><MascotGuide phase="guide" size={64} message="No emails sent yet." position="inline" /></div>;
  return (
    <ul className="divide-y divide-gray-100 rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm">
      {events.map((e, i) => (
        <li key={i} className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-semibold text-[#0B2143]">{e.kind}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{new Date(e.at).toLocaleString('en-ZA')}</p>
          </div>
          <Mail className="text-gray-300" size={18} />
        </li>
      ))}
    </ul>
  );
}
