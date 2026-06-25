import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const ZAR = (v) => v == null || v === 0
  ? null
  : `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const BUCKET_TONE = {
  A: 'border-blue-400/40 bg-blue-400/10 text-blue-300',
  B: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  C: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  D: 'border-purple-400/40 bg-purple-400/10 text-purple-300',
};

const PACKAGE_ORDER = ['ignite', 'accelerate', 'dominate', 'pulse', 'other'];

export default function Upsell() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [bucketFilter, setBucketFilter] = useState('all');
  const [pkgFilter, setPkgFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});

  const upsellQ = useQuery({
    queryKey: ['upsell_candidates_v2'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_upsell_candidates_v2');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 120_000,
  });

  // Group by client
  const grouped = useMemo(() => {
    let rows = upsellQ.data ?? [];
    if (bucketFilter !== 'all') rows = rows.filter(r => r.addon_bucket === bucketFilter);
    if (pkgFilter !== 'all') rows = rows.filter(r => (r.client_package || '').toLowerCase() === pkgFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => (r.business_name || '').toLowerCase().includes(q));
    }

    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.client_id)) {
        map.set(r.client_id, {
          client_id: r.client_id,
          business_name: r.business_name,
          contact_person: r.contact_person,
          email: r.email,
          phone: r.phone,
          client_package: r.client_package,
          client_monthly_retainer: r.client_monthly_retainer,
          addons: [],
        });
      }
      map.get(r.client_id).addons.push(r);
    }
    // Sort clients by package tier
    return [...map.values()].sort((a, b) => {
      const ai = PACKAGE_ORDER.indexOf((a.client_package || '').toLowerCase());
      const bi = PACKAGE_ORDER.indexOf((b.client_package || '').toLowerCase());
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  }, [upsellQ.data, bucketFilter, pkgFilter, search]);

  const totalClients = grouped.length;
  const totalAddons = grouped.reduce((s, c) => s + c.addons.length, 0);

  function toggle(clientId) {
    setCollapsed(p => ({ ...p, [clientId]: !p[clientId] }));
  }

  function openWorkspace(clientId) {
    navigate(`/owner/sales/upsell/${clientId}`);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Upsell</span>
          </h1>
          <p className="mt-1 text-sm text-soft">
            Add-ons for active clients · {totalClients} client{totalClients !== 1 ? 's' : ''} · {totalAddons} suggestion{totalAddons !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => upsellQ.refetch()}
          disabled={upsellQ.isFetching}
          className="inline-flex items-center gap-2 rounded-xl border border-darkbg-border bg-darkbg-800/60 px-3 py-2 text-sm text-soft transition hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={upsellQ.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search business…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none w-48"
        />
        <span className="text-xs text-soft uppercase tracking-widest">Bucket:</span>
        {['all', 'A', 'B', 'C', 'D'].map(b => (
          <button key={b} onClick={() => setBucketFilter(b)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
              bucketFilter === b ? 'border-brandred bg-brandred/10 text-brandred' : 'border-darkbg-border text-soft hover:text-white'}`}>
            {b === 'all' ? 'All' : `Bucket ${b}`}
          </button>
        ))}
        <span className="text-xs text-soft uppercase tracking-widest ml-2">Package:</span>
        {['all', 'ignite', 'accelerate', 'dominate', 'pulse'].map(p => (
          <button key={p} onClick={() => setPkgFilter(p)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition capitalize ${
              pkgFilter === p ? 'border-brandred bg-brandred/10 text-brandred' : 'border-darkbg-border text-soft hover:text-white'}`}>
            {p === 'all' ? 'All' : p}
          </button>
        ))}
      </div>

      {upsellQ.isLoading && <p className="text-soft">Loading…</p>}
      {upsellQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {upsellQ.error?.message || 'Failed to load upsell candidates'}
        </div>
      )}

      {!upsellQ.isLoading && grouped.length === 0 && (
        <div className="card p-10 text-center">
          <ShoppingBag size={36} className="mx-auto mb-3 text-soft/30"/>
          <p className="text-sm text-soft">No active clients with add-on opportunities right now.</p>
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(client => {
          const isOpen = !collapsed[client.client_id];
          return (
            <div key={client.client_id} className="card">
              {/* Client header */}
              <button
                onClick={() => toggle(client.client_id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div>
                  <p className="font-display text-base text-white">
                    📦 {client.business_name}
                    <span className="ml-2 text-sm font-normal capitalize text-soft">
                      ({client.client_package || 'unknown'} · {client.client_monthly_retainer != null ? `R${Number(client.client_monthly_retainer).toLocaleString('en-ZA')}/mo` : '—'})
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-soft">{client.contact_person} · {client.email || client.phone || '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full border border-darkbg-border px-2 py-0.5 text-xs text-soft">
                    {client.addons.length} add-on{client.addons.length !== 1 ? 's' : ''}
                  </span>
                  {isOpen ? <ChevronUp size={15} className="text-soft"/> : <ChevronDown size={15} className="text-soft"/>}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-darkbg-border">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-widest text-soft border-b border-darkbg-border/50">
                        <th className="px-4 py-2">Add-on</th>
                        <th className="px-4 py-2">Headline</th>
                        <th className="px-4 py-2">Bucket</th>
                        <th className="px-4 py-2">Price</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {client.addons.map(addon => (
                        <tr key={addon.addon_code} className="border-b border-darkbg-border/30 transition hover:bg-darkbg-900/40">
                          <td className="px-4 py-2">
                            <span className="text-white">{addon.addon_emoji} {addon.addon_name}</span>
                          </td>
                          <td className="px-4 py-2 text-soft">{addon.addon_headline}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${BUCKET_TONE[addon.addon_bucket] || 'border-darkbg-border text-soft'}`}>
                              Bucket {addon.addon_bucket}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-soft whitespace-nowrap">{addon.addon_price_label}</td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => openWorkspace(client.client_id)}
                              className="rounded-lg border border-brandred/40 bg-brandred/10 px-3 py-1 text-xs text-brandred transition hover:bg-brandred/20"
                            >
                              Open workspace
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
