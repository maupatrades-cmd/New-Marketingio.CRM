import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';
import { getIndustryConfig } from '../../../constants/industryConfig.js';
import MascotGuide from '../../../components/MascotGuide.jsx';

export default function BizBookingForm() {
  const nav = useNavigate();

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => (await supabase.rpc('get_client_dashboard')).data,
  });
  const industry = dashQ.data?.client?.industry;
  const cfg = useMemo(() => getIndustryConfig(industry), [industry]);

  const customersQ = useQuery({
    queryKey: ['biz-customers-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('biz_get_customers', {
        p_search: null, p_status: 'active', p_tag: null, p_sort: 'name', p_limit: 500, p_offset: 0,
      });
      if (error) throw error;
      return data?.customers ?? [];
    },
  });

  const [mode, setMode] = useState('existing');
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState({ full_name: '', phone: '', email: '' });
  const [bookingDate, setBookingDate] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('unpaid');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [customFields, setCustomFields] = useState({});
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  const setCustom = (k, v) => setCustomFields(f => ({ ...f, [k]: v }));

  const selectedCustomer = (customersQ.data ?? []).find(c => c.id === customerId);
  const emailForConfirm = mode === 'existing' ? selectedCustomer?.email : newCustomer.email;

  const submit = async (e) => {
    e.preventDefault();
    // Guard first — the two-step "add inline customer, then add booking"
    // path takes multiple round trips, so a fast double-Enter would
    // create the customer twice (biz_add_customer only dedupes on
    // duplicate email/phone) and race the booking insert. Bail here.
    if (saving) return;
    if (!bookingDate) { toast.error('Date/time required'); return; }
    if (mode === 'existing' && !customerId) { toast.error('Pick a customer'); return; }
    if (mode === 'new' && !newCustomer.full_name.trim()) { toast.error('New customer name required'); return; }
    setSaving(true);
    try {
      let cid = customerId || null;
      if (mode === 'new') {
        const { data: c, error: ce } = await supabase.rpc('biz_add_customer', { p_payload: newCustomer });
        if (ce) throw ce;
        if (c?.ok === false && c.error !== 'duplicate') throw new Error(c.error);
        cid = c?.id || c?.existing_id;
      }
      const payload = {
        customer_id: cid,
        booking_date: new Date(bookingDate).toISOString(),
        amount: amount ? Number(amount) : 0,
        payment_status: paymentStatus,
        payment_method: paymentMethod || null,
        notes: notes || null,
        custom_fields: customFields,
        send_confirmation_email: sendEmail,
        status: 'confirmed',
      };
      const { data, error } = await supabase.rpc('biz_add_booking', { p_payload: payload });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      toast.success(data?.confirmation_sent ? `${cfg.bookingLabel} booked — confirmation sent!` : `${cfg.bookingLabel} booked.`);
      nav('/client/my-business/bookings');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const shouldShow = (field) => {
    if (!field.showIf) return true;
    const [key, val] = field.showIf.split('=');
    return customFields[key] === val;
  };

  if (dashQ.isLoading) return <div className="py-12"><MascotGuide phase="thinking" size={80} message="Loading..." position="inline" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => nav('/client/my-business/bookings')} className="rounded-full p-2 hover:bg-gray-100 transition"><ArrowLeft size={18} /></button>
        <div>
          <h1 className="font-display text-2xl text-[#0B2143]">{cfg.bookingVerb}</h1>
          <p className="text-sm text-gray-500 mt-1">{cfg.label}</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {/* Step 1: Customer */}
        <Card title={`Step 1 — ${cfg.customerLabel}`}>
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => setMode('existing')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${mode === 'existing' ? 'bg-[#E2293B] text-white' : 'bg-gray-100 text-gray-600'}`}>Existing</button>
            <button type="button" onClick={() => setMode('new')} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${mode === 'new' ? 'bg-[#E2293B] text-white' : 'bg-gray-100 text-gray-600'}`}>New {cfg.customerLabel.toLowerCase()}</button>
          </div>
          {mode === 'existing' ? (
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
              <option value="">— Select {cfg.customerLabel.toLowerCase()} —</option>
              {(customersQ.data ?? []).map(c => (
                <option key={c.id} value={c.id}>{c.full_name} {c.phone ? `· ${c.phone}` : ''}</option>
              ))}
            </select>
          ) : (
            <div className="space-y-2">
              <Input label="Full name *" value={newCustomer.full_name} onChange={v => setNewCustomer(f => ({ ...f, full_name: v }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Phone" value={newCustomer.phone} onChange={v => setNewCustomer(f => ({ ...f, phone: v }))} />
                <Input label="Email" value={newCustomer.email} onChange={v => setNewCustomer(f => ({ ...f, email: v }))} type="email" />
              </div>
            </div>
          )}
        </Card>

        {/* Step 2: Date/time */}
        <Card title="Step 2 — When">
          <Input label="Date & time *" value={bookingDate} onChange={setBookingDate} type="datetime-local" />
        </Card>

        {/* Step 3: Industry-specific fields */}
        {cfg.fields?.length > 0 && (
          <Card title={`Step 3 — ${cfg.bookingLabel} details`}>
            <div className="grid gap-3">
              {cfg.fields.filter(shouldShow).map(f => (
                <DynamicField key={f.key} field={f} value={customFields[f.key] ?? ''} onChange={v => setCustom(f.key, v)} />
              ))}
            </div>
          </Card>
        )}

        {/* Step 4: Payment */}
        <Card title="Step 4 — Payment">
          <div className="grid md:grid-cols-3 gap-3">
            <Input label="Amount (R)" value={amount} onChange={setAmount} type="number" />
            <div>
              <label className="text-xs font-semibold text-gray-500">Payment status</label>
              <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                <option value="unpaid">Unpaid</option>
                <option value="deposit_paid">Deposit paid</option>
                <option value="paid">Paid in full</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
                <option value="">—</option>
                <option value="cash">Cash</option>
                <option value="eft">EFT</option>
                <option value="card">Card</option>
                <option value="snapscan">SnapScan / Zapper</option>
                <option value="account">Account</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Step 5: Notes */}
        <Card title="Step 5 — Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Anything else?"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
        </Card>

        {emailForConfirm && (
          <label className="flex items-center gap-2 text-sm text-gray-700 pl-2">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
            Send confirmation email to {emailForConfirm}
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => nav('/client/my-business/bookings')} className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#E2293B] text-white px-4 py-2 text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50">
            <Save size={14} /> {saving ? 'Saving...' : `Save ${cfg.bookingLabel.toLowerCase()}`}
          </button>
        </div>
      </form>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-4">
      <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-3">{title}</p>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
             className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
    </div>
  );
}

function DynamicField({ field, value, onChange }) {
  const cls = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200';
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500">{field.label}</label>
      {field.type === 'textarea' ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={field.placeholder || ''} className={cls} />
      ) : field.type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={cls}>
          <option value="">— Select —</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'file' ? (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
               placeholder="Paste a link to the reference (upload feature coming soon)"
               className={cls} />
      ) : (
        <input type={field.type} value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ''} className={cls} />
      )}
    </div>
  );
}
