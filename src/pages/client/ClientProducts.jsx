import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { FULL_CATALOG } from '../../constants/productCatalog.js';
import EnquiryModal from '../../components/client/EnquiryModal.jsx';

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

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_dashboard');
      if (error) throw error;
      return data;
    },
  });
  const deal = dashQ.data?.deal;
  const activeCode = deal?.package;
  const activeAddOn = deal?.add_on_name;

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
          const isActive = p.code === activeCode || (activeAddOn && p.name === activeAddOn);
          return (
            <div key={p.code} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-[#0B2143]">{p.name}</h3>
                {isActive && <span className="rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2 py-0.5 text-[10px] font-semibold shrink-0">Active</span>}
              </div>
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
              {!isActive && (
                <button onClick={() => setEnquiry({ code: p.code, name: p.name })}
                        className="mt-3 w-full bg-red-500 text-white rounded-full py-2 text-sm font-semibold hover:bg-red-600 transition">
                  Enquire →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {enquiry && <EnquiryModal product={enquiry} onClose={() => setEnquiry(null)} />}
    </div>
  );
}
