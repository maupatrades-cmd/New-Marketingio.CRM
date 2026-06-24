import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, Users, XCircle, UserMinus, Phone, MessageSquare, Mail,
  Clock, TrendingDown, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];
const ZAR = (v) => v == null
  ? '—'
  : `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const STATUS_TONE = {
  dormant:   'border-amber-400/40  bg-amber-400/10  text-amber-300',
  churned:   'border-brandred/40   bg-brandred/10   text-brandred',
  cancelled: 'border-brandred/40   bg-brandred/10   text-brandred',
  paused:    'border-blue-400/40   bg-blue-400/10   text-blue-300',
  lapsed:    'border-amber-400/40  bg-amber-400/10  text-amber-300',
  inactive:  'border-amber-400/40  bg-amber-400/10  text-amber-300',
  suspended: 'border-brandred/40   bg-brandred/10   text-brandred',
};

function waPhone(phone) {
  if (!phone) return '#';
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('0') ? `27${digits.slice(1)}` : digits;
  return `https://wa.me/${e164}`;
}

export default function SalesOpportunities() {
  const { role } = useAuth();
  const [sortField, setSortField] = useState('days_since_activity');
  const [sortDesc, setSortDesc] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const dormantQ = useQuery({
    queryKey: ['dormant_clients'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dormant_clients');
      if (error) throw error;
      return data ?? [];
    },
    enabled: MANAGER_ROLES.includes(role),
    staleTime: 120_000,
  });

  const rows = useMemo(() => {
    let data = dormantQ.data ?? [];
    if (statusFilter !== 'all') data = data.filter(r => r.current_status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(r =>
        (r.business_name || '').toLowerCase().includes(q) ||
        (r.contact_person || '').toLowerCase().includes(q) ||
        (r.assigned_field_agent || '').toLowerCase().includes(q)
      );
    }
    return [...data].sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (av < bv) return sortDesc ? 1 : -1;
      if (av > bv) return sortDesc ? -1 : 1;
      return 0;
    });
  }, [dormantQ.data, statusFilter, search, sortField, sortDesc]);

  const kpis = useMemo(() => {
    const all = dormantQ.data ?? [];
    return {
      total:     all.length,
      churned:   all.filter(r => r.current_status === 'churned').length,
      cancelled: all.filter(r => r.current_status === 'cancelled').length,
      expired:   all.filter(r => r.contract_end_date && new Date(r.contract_end_date) < new Date()).length,
    };
  }, [dormantQ.data]);

  const statuses = useMemo(() => {
    const s = new Set((dormantQ.data ?? []).map(r => r.current_status));
    return [...s].sort();
  }, [dormantQ.data]);

  if (!MANAGER_ROLES.includes(role)) {
    return (
      <div className="card p-8 text-center">
        <h1 className="font-display text-2xl"><span className="text-gradient">Sales Opportunities</span></h1>
        <p className="mt-3 text-soft">Manager-only surface (owner, admin, head of tech).</p>
      </div>
    );
  }

  function toggleSort(field) {
    if (sortField === field) setSortDesc(d => !d);
    else { setSortField(field); setSortDesc(true); }
  }

  function SortIcon({ field }) {
    if (sortField !== field) return null;
    return sortDesc ? <ChevronDown size={12}/> : <ChevronUp size={12}/>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Sales Opportunities</span>
          </h1>
          <p className="mt-1 text-sm text-soft">
            Clients currently dormant, churned or cancelled — worth re-engaging
          </p>
        </div>
        <button
          onClick={() => dormantQ.refetch()}
          disabled={dormantQ.isFetching}
          className="inline-flex items-center gap-2 rounded-xl border border-darkbg-border bg-darkbg-800/60 px-3 py-2 text-sm text-soft transition hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={dormantQ.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Users}       label="Total dormant"       value={kpis.total} />
        <Kpi icon={TrendingDown}label="Churned"             value={kpis.churned}   tone="danger" />
        <Kpi icon={XCircle}     label="Cancelled"           value={kpis.cancelled} tone="danger" />
        <Kpi icon={Clock}       label="Contract expired"    value={kpis.expired}   tone="muted" />
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search business / contact / agent…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none w-64"
        />
        {['all', ...statuses].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
              statusFilter === s
                ? 'border-brandred bg-brandred/10 text-brandred'
                : 'border-darkbg-border text-soft hover:text-white'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
        <span className="ml-auto text-xs text-soft">{rows.length} client{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {dormantQ.isLoading && <p className="text-soft">Loading…</p>}
      {dormantQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {dormantQ.error?.message || 'Failed to load dormant clients'}
        </div>
      )}

      {!dormantQ.isLoading && rows.length === 0 && (
        <div className="card p-10 text-center">
          <UserMinus size={36} className="mx-auto mb-3 text-soft/30" />
          <p className="text-sm text-soft">No dormant clients match the current filter.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border text-left text-xs uppercase tracking-widest text-soft">
                <Th onClick={() => toggleSort('business_name')} label="Business" sortIcon={<SortIcon field="business_name"/>} />
                <Th label="Contact" />
                <Th onClick={() => toggleSort('current_status')} label="Status" sortIcon={<SortIcon field="current_status"/>} />
                <Th label="Former package" />
                <Th onClick={() => toggleSort('former_monthly_retainer')} label="Former retainer" sortIcon={<SortIcon field="former_monthly_retainer"/>} />
                <Th onClick={() => toggleSort('days_since_activity')} label="Days since activity" sortIcon={<SortIcon field="days_since_activity"/>} />
                <Th label="Last closed won" />
                <Th label="Agent / CPC" />
                <Th label="Re-engage" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.client_id} className="border-b border-darkbg-border/40 transition hover:bg-darkbg-900/40">
                  <td className="px-3 py-3">
                    <p className="font-medium text-white">{r.business_name || '—'}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-white">{r.contact_person || '—'}</p>
                    <p className="text-[11px] text-soft">{r.email || r.phone || '—'}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${STATUS_TONE[r.current_status] || 'border-darkbg-border text-soft'}`}>
                      {r.current_status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-soft capitalize">{r.former_package || '—'}</td>
                  <td className="px-3 py-3 text-white">{ZAR(r.former_monthly_retainer)}<span className="text-soft">/mo</span></td>
                  <td className="px-3 py-3">
                    <span className={`font-medium ${(r.days_since_activity ?? 0) > 90 ? 'text-brandred' : 'text-white'}`}>
                      {r.days_since_activity ?? '—'}d
                    </span>
                  </td>
                  <td className="px-3 py-3 text-soft">
                    {r.last_closed_won_at
                      ? <><p className="text-white">{ZAR(r.last_closed_won_value_zar)}</p><p className="text-[11px]">{r.last_closed_won_at.slice(0,10)}</p></>
                      : '—'
                    }
                  </td>
                  <td className="px-3 py-3 text-soft text-[12px]">
                    {r.assigned_field_agent && <p>FA: {r.assigned_field_agent}</p>}
                    {r.assigned_cpc && <p>CPC: {r.assigned_cpc}</p>}
                    {!r.assigned_field_agent && !r.assigned_cpc && <p>Unassigned</p>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {r.phone && (
                        <a href={`tel:${r.phone}`} title="Call"
                           className="inline-flex items-center justify-center rounded-lg border border-darkbg-border bg-darkbg-800/60 p-1.5 text-soft hover:text-white hover:border-brandred transition">
                          <Phone size={13}/>
                        </a>
                      )}
                      {r.phone && (
                        <a href={waPhone(r.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                           className="inline-flex items-center justify-center rounded-lg border border-darkbg-border bg-darkbg-800/60 p-1.5 text-soft hover:text-white hover:border-brandred transition">
                          <MessageSquare size={13}/>
                        </a>
                      )}
                      {r.email && (
                        <a href={`mailto:${r.email}?subject=We'd love to have you back`} title="Email"
                           className="inline-flex items-center justify-center rounded-lg border border-darkbg-border bg-darkbg-800/60 p-1.5 text-soft hover:text-white hover:border-brandred transition">
                          <Mail size={13}/>
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
  const danger = tone === 'danger';
  const muted  = tone === 'muted';
  return (
    <div className={`card p-4 ${danger ? 'border border-brandred/40 bg-brandred/5' : ''}`}>
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-soft">
        <Icon size={13} className={danger ? 'text-brandred' : ''}/> {label}
      </div>
      <p className={`font-display text-2xl ${danger ? 'text-brandred' : muted ? 'text-soft' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function Th({ label, onClick, sortIcon }) {
  return (
    <th
      className={`px-3 py-2 ${onClick ? 'cursor-pointer select-none hover:text-white' : ''}`}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">{label}{sortIcon}</span>
    </th>
  );
}
