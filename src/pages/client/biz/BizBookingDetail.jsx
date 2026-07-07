import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';
import { getIndustryConfig } from '../../../constants/industryConfig.js';
import MascotGuide from '../../../components/MascotGuide.jsx';

const fmtZar = (n) => 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function BizBookingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => (await supabase.rpc('get_client_dashboard')).data,
  });
  const cfg = getIndustryConfig(dashQ.data?.client?.industry);

  const bookingQ = useQuery({
    queryKey: ['biz-booking', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('biz_get_bookings', {
        p_status: null, p_from: null, p_to: null, p_customer_id: null, p_limit: 500,
      });
      if (error) throw error;
      return (data?.bookings ?? []).find(b => b.id === id);
    },
  });

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (bookingQ.data) setForm({
      status: bookingQ.data.status,
      amount: bookingQ.data.amount,
      payment_status: bookingQ.data.payment_status,
      payment_method: bookingQ.data.payment_method || '',
      notes: bookingQ.data.notes || '',
      booking_date: bookingQ.data.booking_date?.slice(0,16) || '',
      custom_fields: bookingQ.data.custom_fields || {},
    });
  }, [bookingQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { ...form, booking_date: new Date(form.booking_date).toISOString() };
      const { data, error } = await supabase.rpc('biz_update_booking', { p_id: id, p_payload: payload });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biz-booking', id] }); qc.invalidateQueries({ queryKey: ['biz-bookings'] }); qc.invalidateQueries({ queryKey: ['biz-dashboard'] }); toast.success('Saved.'); },
    onError: (err) => toast.error(err.message),
  });

  if (bookingQ.isLoading || !form) return <div className="py-12"><MascotGuide phase="thinking" size={80} message="Loading..." position="inline" /></div>;
  const b = bookingQ.data;
  if (!b) return <div className="py-12"><MascotGuide phase="sad" size={80} message={`${cfg.bookingLabel} not found`} position="inline" /></div>;

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCustom = (k, v) => setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [k]: v } }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => nav('/client/my-business/bookings')} className="rounded-full p-2 hover:bg-gray-100 transition"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl text-[#0B2143] truncate">{b.customer_name || 'Unknown'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {b.customer_id && <Link to={`/client/my-business/customers/${b.customer_id}`} className="text-red-500 font-semibold">View {cfg.customerLabel.toLowerCase()} →</Link>}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Date & time</label>
            <input type="datetime-local" value={form.booking_date} onChange={e => setField('booking_date', e.target.value)}
                   className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Status</label>
            <select value={form.status} onChange={e => setField('status', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
              {['confirmed','pending','in_progress','completed','cancelled','no_show'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Amount (R)</label>
            <input type="number" value={form.amount} onChange={e => setField('amount', e.target.value)}
                   className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Payment status</label>
            <select value={form.payment_status} onChange={e => setField('payment_status', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
              {['unpaid','deposit_paid','paid','refunded','partial'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {cfg.fields?.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-3">{cfg.bookingLabel} details</p>
            <div className="grid gap-3">
              {cfg.fields.map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-500">{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea value={form.custom_fields[f.key] ?? ''} onChange={e => setCustom(f.key, e.target.value)} rows={2}
                              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
                  ) : f.type === 'select' ? (
                    <select value={form.custom_fields[f.key] ?? ''} onChange={e => setCustom(f.key, e.target.value)}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                      <option value="">—</option>
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type === 'file' ? 'text' : f.type} value={form.custom_fields[f.key] ?? ''} onChange={e => setCustom(f.key, e.target.value)}
                           className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-gray-100">
          <label className="text-xs font-semibold text-gray-500">Notes</label>
          <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={3}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
        </div>

        <div className="pt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50">
            <Save size={14} /> {saveMut.isPending ? 'Saving...' : 'Save'}
          </button>
          <span className="text-xs text-gray-400 ml-auto">
            {b.confirmation_sent && `✓ Confirmation email sent ${new Date(b.confirmation_sent_at).toLocaleDateString('en-ZA')}`}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4 flex items-center justify-between text-xs text-gray-500">
        <span>Amount: <b className="text-emerald-600">{fmtZar(b.amount)}</b></span>
        <span>Deposit paid: {b.deposit_paid ? 'Yes' : 'No'}</span>
        <span>Created: {new Date(b.created_at).toLocaleDateString('en-ZA')}</span>
      </div>
    </div>
  );
}
