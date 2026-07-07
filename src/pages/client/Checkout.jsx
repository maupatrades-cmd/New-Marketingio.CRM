import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, ShoppingBag, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import { FULL_CATALOG } from '../../constants/productCatalog.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Client-portal sale process. Presents a real checkout surface for the
// product code in the URL, then submits the purchase intent via the
// existing submit_client_enquiry RPC (the owner will drop the invoice
// into /client/invoices from the CRM within 24h; the setup fee is then
// paid through the PayFast flow on that invoice page).
export default function Checkout() {
  const { code } = useParams();
  const navigate = useNavigate();
  const product = FULL_CATALOG.find(p => p.code === code);
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | submitting | success

  // Only show the "already active" gate for logged-in clients; the RPC
  // itself scopes to the caller's client row.
  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_dashboard');
      if (error) throw error;
      return data;
    },
  });
  const deal = dashQ.data?.deal;
  const isActive = product && (product.code === deal?.package || product.name === deal?.add_on_name);

  if (!product) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <MascotGuide phase="sad" size={100} position="inline"
          message="We couldn't find that product. Head back to browse the catalogue." />
        <div className="text-center mt-6">
          <Link to="/client/products" className="text-sm text-red-500 font-semibold hover:underline">
            ← Back to products
          </Link>
        </div>
      </div>
    );
  }

  const total = Number(product.setup ?? 0);
  const monthly = Number(product.monthly ?? 0);

  const submit = async () => {
    setPhase('submitting');
    try {
      const suffix = '\n\n[Purchase — client completed checkout on /client/checkout.]';
      const body = ((notes || '').trim() + suffix).trim();
      const { error } = await supabase.rpc('submit_client_enquiry', {
        p_product_code: product.code,
        p_product_name: product.name,
        p_message: body,
      });
      if (error) throw error;
      setPhase('success');
      toast.success('Purchase confirmed — check your invoices soon.');
    } catch (err) {
      toast.error(err.message);
      setPhase('idle');
    }
  };

  if (phase === 'success') {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl shadow-sm p-8 text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <h1 className="font-display text-2xl text-[#0B2143]">Purchase confirmed</h1>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Your <strong>{product.name}</strong> order is in. We'll issue your setup invoice
            within 24 hours — you'll get an email the moment it lands, and it'll show up under
            your invoices for online payment.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => navigate('/client/invoices')}
              className="inline-flex items-center justify-center rounded-full bg-[#EF4444] hover:bg-red-600 text-white px-6 py-3 text-sm font-semibold transition"
            >
              View my invoices
            </button>
            <button
              onClick={() => navigate('/client')}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 hover:border-slate-300 text-[#0B2143] px-6 py-3 text-sm font-semibold transition"
            >
              Back to dashboard
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#0B2143] transition"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <header>
        <p className="text-xs uppercase tracking-widest text-slate-500">Checkout</p>
        <h1 className="font-display text-3xl text-[#0B2143]">{product.name}</h1>
      </header>

      {isActive && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={14} className="mr-1 inline" /> You already have this active. You can still request another cycle or add-on below.
        </div>
      )}

      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl shadow-sm p-5">
        <h2 className="font-display text-lg text-[#0B2143]">What you're buying</h2>
        {product.features?.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {product.features.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 size={14} className="mt-0.5 text-emerald-500 shrink-0" /> {f}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl shadow-sm p-5">
        <h2 className="font-display text-lg text-[#0B2143]">Price breakdown</h2>
        <dl className="mt-3 space-y-2 text-sm">
          {product.setup > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Setup fee (once-off)</dt>
              <dd className="font-semibold text-[#0B2143]">{fmtZar(product.setup)}</dd>
            </div>
          )}
          {monthly > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Monthly retainer</dt>
              <dd className="font-semibold text-[#0B2143]">{fmtZar(monthly)}/mo</dd>
            </div>
          )}
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4">
          <span className="text-sm text-slate-500">Due today (setup)</span>
          <span className="font-display text-2xl text-[#0B2143]">{fmtZar(total)}</span>
        </div>
        {monthly > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Plus {fmtZar(monthly)}/month on debit order, starting the month after setup.
          </p>
        )}
      </section>

      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl shadow-sm p-5">
        <h2 className="font-display text-lg text-[#0B2143]">How it works</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-600 list-decimal list-inside">
          <li>Confirm your purchase below.</li>
          <li>We issue your setup invoice within 24 hours.</li>
          <li>You pay online via PayFast (card or instant EFT) — one click on the invoice page.</li>
          <li>We kick off onboarding the moment the payment clears.</li>
        </ol>
      </section>

      <section className="mio-glow-border rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl shadow-sm p-5">
        <h2 className="font-display text-lg text-[#0B2143]">Anything we should know?</h2>
        <p className="text-xs text-slate-500 mt-1">
          Optional — start date, extras, who should receive the invoice, etc.
        </p>
        <textarea
          className="input-light mt-3 min-h-[100px]"
          placeholder="e.g. Please invoice accounts@…, we'd like to start on the 1st…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </section>

      <button
        onClick={submit}
        disabled={phase === 'submitting'}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#EF4444] hover:bg-red-600 text-white px-6 py-4 text-base font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition"
      >
        {phase === 'submitting'
          ? <><Loader2 size={16} className="animate-spin" /> Confirming…</>
          : <><ShoppingBag size={16} /> Complete purchase — {fmtZar(total)}</>}
      </button>

      <p className="text-center text-xs text-slate-500 flex items-center justify-center gap-1">
        <ShieldCheck size={12} /> Secured by PayFast. No card details collected on this page.
      </p>
    </div>
  );
}
