import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Star, Download, X, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';
import { getIndustryConfig } from '../../../constants/industryConfig.js';
import MascotGuide from '../../../components/MascotGuide.jsx';

const fmtZar = (n) => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'favorites', label: 'Favorites ⭐' },
  { key: 'inactive', label: 'Inactive' },
];
const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'name', label: 'Name A-Z' },
  { key: 'most_bookings', label: 'Most bookings' },
  { key: 'most_spent', label: 'Most spent' },
  { key: 'last_visit', label: 'Last visit' },
];

export default function BizCustomers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [sort, setSort] = useState('newest');
  const [showAdd, setShowAdd] = useState(false);

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => (await supabase.rpc('get_client_dashboard')).data,
  });
  const industry = dashQ.data?.client?.industry;
  const cfg = getIndustryConfig(industry);

  const listQ = useQuery({
    queryKey: ['biz-customers', { search, filter, sort }],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('biz_get_customers', {
        p_search: search || null,
        p_status: filter,
        p_tag: null,
        p_sort: sort,
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  const exportMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('biz_export_customers');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const rows = data?.rows ?? [];
      if (rows.length === 0) { toast.info('No customers to export.'); return; }
      const cols = Object.keys(rows[0]);
      const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${cfg.customerLabel.toLowerCase()}s-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported.');
    },
    onError: (err) => toast.error(err.message),
  });

  const customers = listQ.data?.customers ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">My {cfg.customerLabel}s</h1>
          <p className="text-sm text-gray-500 mt-1">{listQ.data?.total ?? 0} total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportMut.mutate()} disabled={exportMut.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 text-[#0B2143] px-3 py-2 text-sm font-semibold hover:bg-gray-50 transition">
            <Download size={16} /> Export
          </button>
          <button onClick={() => setShowAdd(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition">
            <Plus size={16} /> Add {cfg.customerLabel}
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${cfg.customerLabel.toLowerCase()}s...`}
               className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
      </div>

      {/* Filters + sort */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${filter === f.key ? 'bg-[#E2293B] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
        <select value={sort} onChange={e => setSort(e.target.value)}
                className="ml-auto rounded-full px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 focus:outline-none">
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* List */}
      {listQ.isLoading ? (
        <div className="py-12"><MascotGuide phase="thinking" size={80} message={`Fetching your ${cfg.customerLabel.toLowerCase()}s...`} position="inline" /></div>
      ) : listQ.isError ? (
        <div className="py-12 space-y-3 flex flex-col items-center">
          <MascotGuide phase="sad" size={80} message={listQ.error?.message || `Couldn't load your ${cfg.customerLabel.toLowerCase()}s.`} position="inline" />
          <button onClick={() => listQ.refetch()}
                  className="rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition">
            Try again
          </button>
        </div>
      ) : customers.length === 0 ? (
        <div className="py-12"><MascotGuide phase="guide" size={100} message={`No ${cfg.customerLabel.toLowerCase()}s yet — add your first one.`} position="inline" /></div>
      ) : (
        <ul className="grid gap-3">
          {customers.map(c => (
            <li key={c.id}>
              <Link to={`/client/my-business/customers/${c.id}`}
                    className="block rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {c.is_favorite && <Star size={14} className="text-amber-400 fill-amber-400" />}
                      <p className="font-semibold text-[#0B2143] truncate">{c.full_name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                      {c.phone && <span className="flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail size={11} /> {c.email}</span>}
                    </div>
                    {c.tags?.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {c.tags.slice(0, 4).map(t => <span key={t} className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px]">{t}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-emerald-600">{fmtZar(c.total_spent)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{c.total_bookings ?? 0} bookings</p>
                    {c.last_visit_at && <p className="text-[10px] text-gray-400 mt-0.5">Last: {new Date(c.last_visit_at).toLocaleDateString('en-ZA')}</p>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showAdd && <AddCustomerModal onClose={() => setShowAdd(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['biz-customers'] }); setShowAdd(false); }} cfg={cfg} />}
    </div>
  );
}

function AddCustomerModal({ onClose, onSaved, cfg }) {
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', whatsapp: '', address: '', notes: '', is_favorite: false });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('biz_add_customer', { p_payload: form });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error === 'duplicate' ? 'A customer with this phone or email already exists.' : data.error);
      toast.success(data?.welcome_email_sent ? 'Added — welcome email sent!' : 'Added.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-display text-lg text-[#0B2143]">Add {cfg.customerLabel}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Full name *</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} required
                   className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                     className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">WhatsApp</label>
              <input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)}
                     className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Email (triggers welcome email)</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                   className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)}
                   className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.is_favorite} onChange={e => set('is_favorite', e.target.checked)} />
            Mark as favorite ⭐
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50">
              {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
