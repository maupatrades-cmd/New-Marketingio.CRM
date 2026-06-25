import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, Search, Phone, DollarSign, TrendingUp, Users, Loader2,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const STATUS_CHIPS = [
  { key: 'all',         label: 'All' },
  { key: 'new',         label: 'New' },
  { key: 'verified',    label: 'Verified' },
  { key: 'in_pipeline', label: 'In Pipeline' },
  { key: 'dormant',     label: 'Dormant' },
];

const STATUS_TONE = {
  new:         'border-blue-400/40   bg-blue-400/10   text-blue-300',
  verified:    'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  in_pipeline: 'border-purple-400/40 bg-purple-400/10 text-purple-300',
  dormant:     'border-amber-400/40  bg-amber-400/10  text-amber-300',
  churned:     'border-brandred/40   bg-brandred/10   text-brandred',
  cancelled:   'border-brandred/40   bg-brandred/10   text-brandred',
};

function waPhone(phone) {
  if (!phone) return '#';
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('0') ? `27${digits.slice(1)}` : digits;
  return `https://wa.me/${e164}`;
}

export default function SalesOpportunities() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [statusFilter, setStatusFilter] = useState('all');

  // Global CRM search — debounced
  const [globalSearch, setGlobalSearch] = useState('');
  const [debGlobal, setDebGlobal] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebGlobal(globalSearch), 400);
    return () => clearTimeout(t);
  }, [globalSearch]);

  useEffect(() => {
    if (!debGlobal.trim()) { setShowSearchResults(false); return; }
    setShowSearchResults(true);
  }, [debGlobal]);

  // Click-outside to close search overlay
  useEffect(() => {
    function onOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  // Main prospect pool
  const poolQ = useQuery({
    queryKey: ['sales_opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_opportunities');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 120_000,
  });

  // Global CRM search
  const searchQ = useQuery({
    queryKey: ['crm_search', debGlobal],
    enabled: !!debGlobal.trim(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_crm', { p_query: debGlobal.trim() });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    const all = poolQ.data ?? [];
    if (statusFilter === 'all') return all;
    return all.filter(r => r.status === statusFilter);
  }, [poolQ.data, statusFilter]);

  const kpis = useMemo(() => {
    const all = poolQ.data ?? [];
    return {
      total:      all.length,
      new:        all.filter(r => r.status === 'new').length,
      inPipeline: all.filter(r => r.status === 'in_pipeline').length,
      dormant:    all.filter(r => r.status === 'dormant').length,
    };
  }, [poolQ.data]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Sales Opportunities</span>
          </h1>
          <p className="mt-1 text-sm text-soft">
            Global prospect pool — all leads, dormant clients, and re-engagement targets
          </p>
        </div>
        <button
          onClick={() => poolQ.refetch()}
          disabled={poolQ.isFetching}
          className="inline-flex items-center gap-2 rounded-xl border border-darkbg-border bg-darkbg-800/60 px-3 py-2 text-sm text-soft transition hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={poolQ.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Users}       label="Total prospects"  value={kpis.total} />
        <Kpi icon={TrendingUp}  label="New"              value={kpis.new}        tone="info" />
        <Kpi icon={DollarSign}  label="In Pipeline"      value={kpis.inPipeline} tone="success" />
        <Kpi icon={Phone}       label="Dormant"          value={kpis.dormant}    tone="warn" />
      </section>

      {/* Global CRM search */}
      <div ref={searchRef} className="relative">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-soft"/>
          <input
            type="text"
            placeholder="Search all CRM — leads, clients, deals…"
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            onFocus={() => { if (debGlobal.trim()) setShowSearchResults(true); }}
            className="input pl-9 w-full"
          />
          {searchQ.isFetching && (
            <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-soft"/>
          )}
        </div>

        {showSearchResults && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-darkbg-border bg-darkbg-800 shadow-xl max-h-96 overflow-y-auto">
            {searchQ.isLoading && (
              <p className="px-4 py-3 text-sm text-soft">Searching…</p>
            )}
            {searchQ.isError && (
              <p className="px-4 py-3 text-sm text-brandred">{searchQ.error?.message || 'Search failed'}</p>
            )}
            {!searchQ.isLoading && (searchQ.data ?? []).length === 0 && (
              <p className="px-4 py-3 text-sm text-soft">No results for "{debGlobal}".</p>
            )}
            {(searchQ.data ?? []).map((result, i) => (
              <button
                key={`${result.type}-${result.id ?? i}`}
                onClick={() => {
                  setShowSearchResults(false);
                  if (result.type === 'lead') navigate(`/owner/leads/${result.id}`);
                  else if (result.type === 'client') navigate(`/owner/sales/log?client=${result.id}`);
                  else if (result.type === 'deal') navigate(`/owner/sales/deals`);
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-darkbg-border/40 px-4 py-3 text-left transition last:border-0 hover:bg-darkbg-700/40"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{result.name || result.business_name || '—'}</p>
                  <p className="text-xs text-soft truncate">{result.detail || result.email || result.phone || ''}</p>
                </div>
                <span className="shrink-0 rounded-full border border-darkbg-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-soft">
                  {result.type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_CHIPS.map(chip => (
          <button
            key={chip.key}
            onClick={() => setStatusFilter(chip.key)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
              statusFilter === chip.key
                ? 'border-brandred bg-brandred/10 text-brandred'
                : 'border-darkbg-border text-soft hover:text-white'
            }`}
          >
            {chip.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-soft">{rows.length} prospect{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {poolQ.isLoading && <p className="text-soft">Loading prospects…</p>}
      {poolQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {poolQ.error?.message || 'Failed to load opportunities'}
        </div>
      )}

      {!poolQ.isLoading && rows.length === 0 && (
        <div className="card p-10 text-center">
          <Users size={36} className="mx-auto mb-3 text-soft/30" />
          <p className="text-sm text-soft">No prospects match the current filter.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border text-left text-xs uppercase tracking-widest text-soft">
                <th className="px-3 py-2">Prospect</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Assigned to</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? i} className="border-b border-darkbg-border/40 transition hover:bg-darkbg-900/40">
                  <td className="px-3 py-3">
                    <p className="font-medium text-white">{r.business_name || r.name || '—'}</p>
                    {r.industry && <p className="text-[11px] text-soft capitalize">{r.industry}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-white">{r.contact_person || '—'}</p>
                    <p className="text-[11px] text-soft">{r.email || r.phone || '—'}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${STATUS_TONE[r.status] || 'border-darkbg-border text-soft'}`}>
                      {(r.status || '—').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-soft capitalize text-xs">{r.source || '—'}</td>
                  <td className="px-3 py-3 text-soft text-xs">{r.assigned_to_name || 'Unassigned'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {r.lead_id && (
                        <button
                          onClick={() => navigate(`/owner/leads/${r.lead_id}`)}
                          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1 text-xs text-soft hover:text-white hover:border-brandred transition"
                        >
                          Open lead
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const params = new URLSearchParams();
                          if (r.lead_id) params.set('lead', r.lead_id);
                          else if (r.client_id) params.set('client', r.client_id);
                          navigate(`/owner/sales/log?${params.toString()}`);
                        }}
                        className="rounded-lg border border-brandred/40 bg-brandred/10 px-2 py-1 text-xs text-brandred hover:bg-brandred/20 transition"
                      >
                        Log Sale
                      </button>
                      {r.phone && (
                        <a
                          href={waPhone(r.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1 text-xs text-soft hover:text-white hover:border-emerald-400 transition"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }) {
  const cls = tone === 'danger' ? 'text-brandred border-brandred/40 bg-brandred/5'
            : tone === 'warn'   ? 'text-amber-300'
            : tone === 'info'   ? 'text-blue-300'
            : tone === 'success'? 'text-emerald-300'
            : 'text-white';
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-soft">
        <Icon size={13}/> {label}
      </div>
      <p className={`font-display text-2xl ${cls}`}>{value}</p>
    </div>
  );
}
