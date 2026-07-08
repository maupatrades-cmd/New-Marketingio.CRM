import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, ShoppingBag } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { FULL_CATALOG } from '../../constants/productCatalog.js';
import { PORTAL_FAQ } from '../../constants/portalFaq.js';
import EnquiryModal from '../../components/client/EnquiryModal.jsx';

const WHATSAPP_URL = 'https://wa.me/27768038987';

const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA')}`;
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'package', label: 'Packages' },
  { key: 'digital', label: 'Digital Add-Ons' },
  { key: 'physical', label: 'Physical' },
  { key: 'once_off', label: 'Once-Off' },
];

function matchesFilter(p, f) {
  if (f === 'all') return true;
  if (f === 'package') return p.type === 'package';
  if (f === 'once_off') return p.type === 'once_off';
  if (f === 'physical') return p.bucket === 'E' || /print|signage|flyer|pulse/i.test(p.name);
  if (f === 'digital') return p.type === 'setup_recurring' || p.type === 'recurring' || p.type === 'special';
  return true;
}

export default function ClientProducts() {
  const [filter, setFilter] = useState('all');
  const [enquiry, setEnquiry] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Buy shortcut from the Portal (?buy=<code>) skips this page entirely
  // and drops the client straight into the checkout sale process.
  useEffect(() => {
    const buyCode = searchParams.get('buy');
    if (!buyCode) return;
    const product = FULL_CATALOG.find(p => p.code === buyCode);
    if (product) {
      const next = new URLSearchParams(searchParams);
      next.delete('buy');
      setSearchParams(next, { replace: true });
      navigate(`/client/checkout/${product.code}`);
    }
  }, [searchParams, setSearchParams, navigate]);

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_dashboard');
      if (error) throw error;
      return data;
    },
  });

  // Every active service the client already owns — codes for core
  // packages, name-slugs for add-ons. Sourced from the dashboard's new
  // deals_list (migration 100 + 107) which excludes closed_lost +
  // cancelled.
  const dealsList = useMemo(() => dashQ.data?.deals_list ?? [], [dashQ.data]);

  const owned = useMemo(() => {
    const codes = new Set();
    const slug = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '_');
    for (const d of dealsList) {
      if (d.package && d.package !== 'none') codes.add(d.package);
      if (d.add_on_code) codes.add(d.add_on_code);
      if (d.add_on_name) codes.add(slug(d.add_on_name));
    }
    // Legacy fallback so this still works if deals_list ever comes back
    // empty (e.g. RPC not redeployed yet).
    const pkg  = dashQ.data?.deal?.package;
    const addn = dashQ.data?.deal?.add_on_name;
    if (pkg && pkg !== 'none') codes.add(pkg);
    if (addn) codes.add(slug(addn));
    return codes;
  }, [dashQ.data, dealsList]);

  const productKeys = (p) => [p.code, String(p.name || '').toLowerCase().replace(/\s+/g, '_')];
  const isOwned = (p) => productKeys(p).some(k => owned.has(k));

  // Find the most-recent active deal that matches this product, either
  // by core `package` code, by `add_on_code`, or by the slug of
  // `add_on_name` (backfill for legacy rows). Returns null if no match.
  const findDealForProduct = (p) => {
    const keys = productKeys(p);
    const slug = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '_');
    const matched = dealsList
      .filter(d => keys.includes(d.package) || keys.includes(d.add_on_code) || keys.includes(slug(d.add_on_name)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return matched[0] ?? null;
  };

  // A purchased item's cooldown has elapsed when `now` is past
  // `created_at + termMonths * 30 days` (or +30 days for once-off /
  // termless items). During the window the card stays greyed-out with
  // "Active"; past the window a "Re-order" CTA replaces it. If we don't
  // know the created_at (dashboard RPC not redeployed yet) we err on the
  // safe side and treat the item as still active.
  const isExpiredForProduct = (p) => {
    const deal = findDealForProduct(p);
    if (!deal || !deal.created_at) return false;
    const termMonths = Number(deal.contract_term_months ?? p.term_months ?? 0);
    const cooldownMs = (termMonths > 0 ? termMonths * 30 : 30) * 24 * 60 * 60 * 1000;
    return Date.now() > new Date(deal.created_at).getTime() + cooldownMs;
  };

  const items = FULL_CATALOG.filter(p => p.code !== 'custom' && matchesFilter(p, filter));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Products &amp; Services</h1>
        <p className="text-sm text-gray-500 mt-1">Browse everything Marketing iO offers.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    filter === f.key ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:text-[#0B2143]'
                  }`}>{f.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(p => {
          const owned = isOwned(p);
          const expired = owned && isExpiredForProduct(p);
          // Three states: never-owned (buy), owned+active (greyed +
          // "Active"), owned+expired (still emerald-tinted so the client
          // sees "you used to have this", but with a Re-order CTA).
          const showActiveTreatment = owned && !expired;
          return (
            <div key={p.code}
                 className={`relative rounded-xl border shadow-sm p-5 flex flex-col transition
                   ${showActiveTreatment
                     ? 'border-emerald-200 bg-emerald-50/60 opacity-80'
                     : owned
                       ? 'border-emerald-200 bg-emerald-50/40 hover:shadow-md'
                       : 'bg-white/85 backdrop-blur-xl border-white/80 hover:shadow-md'}`}>
              {showActiveTreatment && (
                <span className="absolute top-3 right-3 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 px-2.5 py-0.5 text-[10px] font-bold shrink-0">
                  ✓ Active
                </span>
              )}
              {expired && (
                <span className="absolute top-3 right-3 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200 px-2.5 py-0.5 text-[10px] font-bold shrink-0">
                  Term ended
                </span>
              )}
              <h3 className={`font-semibold ${owned ? 'text-emerald-800' : 'text-[#0B2143]'}`}>{p.name}</h3>
              <p className="text-sm text-gray-500 mt-1 flex-1">
                {p.setup > 0 ? `${fmtZar(p.setup)} setup` : ''}
                {p.setup > 0 && p.monthly > 0 ? ' + ' : ''}
                {p.monthly > 0 ? `${fmtZar(p.monthly)}/mo` : ''}
                {p.type === 'once_off' ? ' once-off' : ''}
                {p.note ? ` · ${p.note}` : ''}
              </p>
              {p.features && (
                <ul className="mt-2 space-y-1">
                  {p.features.slice(0, 4).map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                      <CheckCircle2 size={12} className="mt-0.5 text-emerald-500 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              )}
              {showActiveTreatment ? (
                <p className="mt-3 text-xs text-emerald-700 font-medium">
                  You already have this service.
                </p>
              ) : expired ? (
                <button
                  onClick={() => navigate(`/client/checkout/${p.code}`)}
                  className="mt-3 w-full inline-flex items-center justify-center gap-1 rounded-full bg-[#0B2143] text-white py-2 text-sm font-semibold hover:bg-[#0B2143]/90 transition"
                >
                  <ShoppingBag size={13} /> Re-order
                </button>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => navigate(`/client/checkout/${p.code}`)}
                    className="flex-1 inline-flex items-center justify-center gap-1 bg-red-500 text-white rounded-full py-2 text-sm font-semibold hover:bg-red-600 transition"
                  >
                    <ShoppingBag size={13} /> Buy
                  </button>
                  <button
                    onClick={() => setEnquiry({ code: p.code, name: p.name })}
                    className="flex-1 inline-flex items-center justify-center rounded-full border border-slate-200 hover:border-slate-300 text-[#0B2143] py-2 text-sm font-semibold transition"
                  >
                    Enquire
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom packages CTA */}
      <section className="bg-white/85 backdrop-blur-xl rounded-2xl border border-white/80 p-8 text-center shadow-sm">
        <h3 className="text-2xl font-bold text-[#0B2143]">Need Something Custom?</h3>
        <p className="text-gray-500 mt-2 max-w-lg mx-auto">
          Every business is unique. If our standard packages don't quite fit, let's design something that does.
        </p>
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
           className="mt-4 inline-block bg-red-500 text-white rounded-full px-6 py-3 text-sm font-bold hover:bg-red-600 transition">
          Chat with the founder →
        </a>
      </section>

      {/* FAQ */}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold text-[#0B2143]">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {PORTAL_FAQ.map(cat => (
            <div key={cat.category}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{cat.category}</h3>
              <div className="space-y-2">
                {cat.items.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {enquiry && <EnquiryModal product={enquiry} onClose={() => setEnquiry(null)} />}
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mio-glow-border bg-white/85 backdrop-blur-xl rounded-xl border border-white/80 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-medium text-[#0B2143]">{q}</span>
        <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="px-4 pb-4 text-sm text-gray-600">{a}</p>}
    </div>
  );
}
