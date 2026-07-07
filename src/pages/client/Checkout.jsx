import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import { FULL_CATALOG } from '../../constants/productCatalog.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Client-portal sale process. Presents a real checkout surface for the
// product code in the URL, then calls client_self_purchase(): the RPC
// creates a deal + sent invoice, fires a HIGH-priority task at the
// coordinator, and pings notify-owner-sale for email + in-app. On
// success we drop the client straight onto /client/invoices/{id} so
// they can pay via PayFast right away — no manual invoice step.
export default function Checkout() {
  const { code } = useParams();
  const navigate = useNavigate();
  const product = FULL_CATALOG.find(p => p.code === code);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('client_self_purchase', {
        p_product_code: product.code,
        p_product_name: product.name,
        p_notes: notes || null,
      });
      if (error) {
        console.error('[Checkout] client_self_purchase failed', { error, product: product.code });
        throw error;
      }
      if (!data?.ok || !data?.invoice_id) {
        console.error('[Checkout] RPC returned no invoice', { data });
        throw new Error('Purchase did not complete — please try again.');
      }
      toast.success(`Invoice ${data.invoice_number} issued — pay now to activate.`);
      // Straight to the invoice pay page. The client sees their real
      // invoice number and can hit PayFast in one more click.
      navigate(data.invoice_url_path ?? `/client/invoices/${data.invoice_id}`, { replace: true });
    } catch (err) {
      // PostgREST wraps DB errors as { message, details, hint, code }.
      const parts = [err.message, err.details, err.hint].filter(Boolean);
      const label = parts.length ? parts.join(' — ') : 'Purchase failed — please try again.';
      toast.error(label);
      setSubmitting(false);
    }
  };

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
          <li>Confirm your purchase below — we issue your invoice instantly.</li>
          <li>You pay online via PayFast (card or instant EFT) on the next page.</li>
          <li>Your Account Coordinator is notified in real time.</li>
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
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#EF4444] hover:bg-red-600 text-white px-6 py-4 text-base font-semibold shadow-md hover:shadow-lg disabled:opacity-50 transition"
      >
        {submitting
          ? <><Loader2 size={16} className="animate-spin" /> Issuing your invoice…</>
          : <><ShoppingBag size={16} /> Complete purchase — {fmtZar(total)}</>}
      </button>

      <p className="text-center text-xs text-slate-500 flex items-center justify-center gap-1">
        <ShieldCheck size={12} /> Secured by PayFast. No card details collected on this page.
      </p>
    </div>
  );
}
