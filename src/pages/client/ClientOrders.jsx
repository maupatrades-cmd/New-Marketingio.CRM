import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const PACKAGE_LABEL = {
  ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate',
  street_pulse: 'Street Pulse', township_pulse: 'Township Pulse',
  add_on: 'Add-on', custom: 'Custom',
};

const STAGE_TONE = {
  new_lead:      { cls: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',       label: 'Pending' },
  contacted:     { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',        label: 'In discussion' },
  qualified:     { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',        label: 'In discussion' },
  proposal:      { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',     label: 'Awaiting payment' },
  negotiation:   { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',     label: 'Confirming' },
  closed_won:    { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'Active' },
  closed_lost:   { cls: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',       label: 'Not proceeded' },
};

const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function ClientOrders() {
  const ordersQ = useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_orders');
      if (error) throw error;
      return data ?? [];
    },
  });

  if (ordersQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={80} message="Fetching your orders..." position="inline" />
    </div>
  );
  if (ordersQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={80} message={ordersQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );

  const orders = ordersQ.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Orders</h1>
        <p className="text-sm text-gray-500 mt-1">Everything you've bought from Marketing iO.</p>
      </div>

      {orders.length === 0 ? (
        <div className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-10 text-center">
          <MascotGuide phase="guide" size={80}
            message="No orders yet. Browse our packages and add-ons to power up your marketing!"
            position="inline" />
          <Link to="/client/products" className="mt-4 inline-flex items-center gap-1 text-sm text-[#E2293B] font-semibold hover:underline">
            Browse products <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const isAddOn  = o.deal_type === 'add_on';
            const name     = isAddOn
              ? (o.add_on_name || 'Custom add-on')
              : (PACKAGE_LABEL[o.package] || o.package || 'Package');
            const tone     = STAGE_TONE[o.stage] || { cls: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200', label: o.stage };
            const setup    = Number(o.setup_fee ?? 0);
            const monthly  = Number(o.monthly_retainer ?? 0);
            const selfServe = o.source === 'client_portal_checkout';

            return (
              <div key={o.id}
                   className="mio-glow-border rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-[#0B2143]">{name}</h3>
                      {isAddOn && (
                        <span className="rounded-full bg-purple-50 text-purple-700 ring-1 ring-purple-200 px-2 py-0.5 text-[10px] font-semibold">
                          Add-on
                        </span>
                      )}
                      {o.is_upsell && (
                        <span className="rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 px-2 py-0.5 text-[10px] font-semibold">
                          Upsell
                        </span>
                      )}
                      {selfServe && (
                        <span className="rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2 py-0.5 text-[10px] font-semibold">
                          Self-serve
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Ordered {fmtDate(o.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-[#0B2143]">
                      {setup > 0 && fmtZar(setup)}
                      {setup > 0 && monthly > 0 && ' + '}
                      {monthly > 0 && `${fmtZar(monthly)}/mo`}
                      {setup === 0 && monthly === 0 && '—'}
                    </p>
                    <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.cls}`}>
                      {tone.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
