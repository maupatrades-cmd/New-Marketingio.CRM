// Slice 3 PR 6 + glow-up v1 — closing-ratio scoreboard at /owner/sales/conversion.
// Owner/admin see every assignee row. field_agent/cpc see their own row only.
// Period tabs: This month | This quarter | All time (default: This month).
// Trend = conversion% vs prior period.
//
// Glow-up additions: gradient hero header with partner greeting, rotating
// motivational quote (one of 25, randomised per page load), and per-row
// Goal / Gap / Progress columns driven by profiles.monthly_goal_wins.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, X, ChevronRight, Quote } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

// ─── Period helpers ──────────────────────────────────────────────────────────

function periodBounds(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === 'month') {
    return {
      start:  new Date(y, m, 1),
      end:    new Date(y, m + 1, 1),
      pStart: new Date(y, m - 1, 1),
      pEnd:   new Date(y, m, 1),
    };
  }
  if (period === 'quarter') {
    const q = Math.floor(m / 3);
    return {
      start:  new Date(y, q * 3, 1),
      end:    new Date(y, q * 3 + 3, 1),
      pStart: new Date(y, (q - 1) * 3, 1),
      pEnd:   new Date(y, q * 3, 1),
    };
  }
  return { start: null, end: null, pStart: null, pEnd: null };
}

function toISO(d) { return d ? d.toISOString() : null; }

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchLeadsForPeriod({ start, end, userId, isOwnerAdmin }) {
  let q = supabase
    .from('leads')
    .select('id, business_name, contact_person, status, assigned_to, assigned_at')
    .not('assigned_to', 'is', null);

  if (!isOwnerAdmin) q = q.eq('assigned_to', userId);
  if (start) q = q.gte('assigned_at', toISO(start));
  if (end)   q = q.lt('assigned_at',  toISO(end));

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function fetchScoreboard({ period, userId, isOwnerAdmin }) {
  const { start, end, pStart, pEnd } = periodBounds(period);

  const [curr, prev] = await Promise.all([
    fetchLeadsForPeriod({ start, end, userId, isOwnerAdmin }),
    (pStart && pEnd)
      ? fetchLeadsForPeriod({ start: pStart, end: pEnd, userId, isOwnerAdmin })
      : Promise.resolve([]),
  ]);

  const allIds = [...new Set([...curr, ...prev].map(r => r.assigned_to))];
  if (allIds.length === 0) return { curr: [], prev: [], goalById: {} };

  const [{ data: profileRows }, { data: roleRows }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, monthly_goal_wins').in('id', allIds),
    supabase.from('user_roles').select('user_id, role').in('user_id', allIds),
  ]);

  const nameById = Object.fromEntries((profileRows ?? []).map(p => [p.id, p.full_name]));
  const goalById = Object.fromEntries((profileRows ?? []).map(p => [p.id, p.monthly_goal_wins ?? 5]));
  const roleById = {};
  for (const r of (roleRows ?? [])) {
    if (!roleById[r.user_id]) roleById[r.user_id] = r.role;
  }

  const enrich = rows => rows.map(r => ({
    ...r,
    _name: nameById[r.assigned_to] ?? r.assigned_to?.slice(0, 8) ?? '—',
    _role: roleById[r.assigned_to] ?? '—',
  }));

  return { curr: enrich(curr), prev: enrich(prev), goalById };
}

function aggregate(rows) {
  const map = new Map();
  for (const r of rows) {
    const id = r.assigned_to;
    if (!map.has(id)) {
      map.set(id, { id, name: r._name, role: r._role, received: 0, qualified: 0, won: 0 });
    }
    const row = map.get(id);
    row.received += 1;
    if (r.status === 'verified')  row.qualified += 1;
    if (r.status === 'won')       row.won       += 1;
  }
  return map;
}

function convPct(won, received) {
  if (!received) return null;
  return Math.round((won / received) * 100);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TrendBadge({ curr, prev }) {
  if (curr == null || prev == null) return <Minus size={14} className="text-soft" />;
  if (curr > prev) return <TrendingUp size={14} className="text-emerald-400" />;
  if (curr < prev) return <TrendingDown size={14} className="text-brandred" />;
  return <Minus size={14} className="text-soft" />;
}

function ProgressRing({ won, goal }) {
  const size = 40, stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(100, Math.round((won / goal) * 100)) : 0;
  const offset = c - (pct / 100) * c;

  const colour =
    pct >= 100 ? '#10b981'
    : pct >= 50 ? '#f59e0b'
    : '#e63946';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="#1e293b" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2} cy={size/2} r={r}
          stroke={colour} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-white">
        {pct}%
      </span>
    </div>
  );
}

function DrillDown({ row, leads, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-darkbg-900/70 p-4" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto rounded-xl border border-darkbg-border bg-darkbg-800 p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">{row.name}</h2>
            <p className="text-xs text-soft uppercase tracking-widest">{row.role}</p>
          </div>
          <button onClick={onClose} className="text-soft hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="mb-4 grid grid-cols-4 gap-2">
          {[
            { label: 'Received',  value: row.received },
            { label: 'Qualified', value: row.qualified },
            { label: 'Won',       value: row.won },
            { label: 'Goal',      value: row.goal },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-darkbg-border bg-darkbg-900/60 p-3 text-center">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-widest text-soft">{s.label}</p>
            </div>
          ))}
        </div>

        {leads.length === 0 ? (
          <p className="text-sm text-soft">No leads in this period.</p>
        ) : (
          <ul className="space-y-2">
            {leads.map(l => (
              <li key={l.id} className="flex items-center justify-between rounded-md border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-white">{l.business_name || '—'}</p>
                  <p className="text-[11px] text-soft">{l.contact_person || ''}</p>
                </div>
                <span className={`ml-3 flex-none rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest border ${statusStyle(l.status)}`}>
                  {l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function statusStyle(status) {
  switch (status) {
    case 'won':      return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400';
    case 'verified': return 'border-blue-500/50 bg-blue-500/10 text-blue-400';
    case 'lost':     return 'border-red-500/50 bg-red-500/10 text-red-400';
    default:         return 'border-darkbg-border bg-darkbg-900/60 text-soft';
  }
}

function firstName(full) {
  if (!full) return 'partner';
  return String(full).trim().split(/\s+/)[0];
}

// ─── Page ────────────────────────────────────────────────────────────────────

const PERIODS = [
  { id: 'month',   label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'all',     label: 'All time' },
];

const CATEGORY_DOT = {
  sa_legend:     'bg-amber-300',
  business_book: 'bg-emerald-300',
  faith:         'bg-sky-300',
};

export default function Conversion() {
  const { role, user, loading: authLoading } = useAuth();
  const [period, setPeriod]     = useState('month');
  const [drillRow, setDrillRow] = useState(null);

  const isOwnerAdmin = role === 'owner' || role === 'admin';
  const canView      = isOwnerAdmin || role === 'field_agent' || role === 'cpc';

  // Caller profile — for the greeting.
  const meQ = useQuery({
    queryKey:  ['my-profile', user?.id],
    queryFn:   async () => {
      const { data } = await supabase.from('profiles').select('full_name, monthly_goal_wins').eq('id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // Quotes pool — pick one at mount.
  const quotesQ = useQuery({
    queryKey:  ['motivational-quotes-v1'],
    queryFn:   async () => {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'motivational_quotes.v1').maybeSingle();
      return Array.isArray(data?.value) ? data.value : [];
    },
    staleTime: 60 * 60_000,
  });

  // Stable per mount — fresh on each page load.
  const [quoteIdx] = useState(() => Math.random());
  const quote = useMemo(() => {
    const pool = quotesQ.data ?? [];
    if (pool.length === 0) return null;
    return pool[Math.floor(quoteIdx * pool.length)];
  }, [quotesQ.data, quoteIdx]);

  const { data, isLoading, error } = useQuery({
    queryKey:  ['conversion-scoreboard', period, user?.id, isOwnerAdmin],
    queryFn:   () => fetchScoreboard({ period, userId: user?.id, isOwnerAdmin }),
    enabled:   !authLoading && !!user && canView,
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const currMap = aggregate(data.curr);
    const prevMap = aggregate(data.prev);

    return [...currMap.values()]
      .map(r => {
        const prev    = prevMap.get(r.id);
        const pct     = convPct(r.won, r.received);
        const prevPct = prev ? convPct(prev.won, prev.received) : null;
        const goal    = data.goalById?.[r.id] ?? 5;
        const gap     = Math.max(0, goal - r.won);
        return { ...r, pct, prevPct, goal, gap };
      })
      .sort((a, b) => (b.won ?? -1) - (a.won ?? -1));
  }, [data]);

  const drillLeads = useMemo(() => {
    if (!drillRow || !data) return [];
    return data.curr.filter(l => l.assigned_to === drillRow.id);
  }, [drillRow, data]);

  if (authLoading) return <div className="p-6 text-soft">Loading…</div>;

  if (!canView) {
    return (
      <div className="p-6">
        <p className="text-soft text-sm">You don't have permission to view this page.</p>
      </div>
    );
  }

  const greeting = firstName(meQ.data?.full_name);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* Hero header — navy → red gradient */}
      <div
        className="rounded-2xl border border-darkbg-border p-6 shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #0a1f4d 0%, #1a2f5d 55%, #e63946 130%)',
        }}
      >
        <h1 className="font-display text-2xl sm:text-3xl text-white">
          Welcome back, partner <span className="text-amber-200">{greeting}</span> 👊
        </h1>
        <p className="mt-1 text-sm text-white/80">Your team's run for the month</p>

        {/* Rotating quote */}
        {quote && (
          <div className="mt-5 flex gap-3 rounded-xl bg-white/10 p-4 backdrop-blur">
            <Quote size={18} className="mt-0.5 flex-none text-amber-200" />
            <div className="min-w-0">
              <p className="text-sm italic text-white/95 leading-relaxed">"{quote.quote}"</p>
              <p className="mt-1.5 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/70">
                <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[quote.category] ?? 'bg-white/50'}`} />
                {quote.author}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Period tabs */}
      <nav className="flex gap-1 rounded-lg border border-darkbg-border bg-darkbg-900/60 p-1 w-fit">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`rounded-md px-4 py-1.5 text-sm transition ${
              period === p.id
                ? 'bg-brandred text-white'
                : 'text-soft hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </nav>

      {/* Table */}
      {isLoading ? (
        <p className="text-soft text-sm">Loading…</p>
      ) : error ? (
        <p className="text-sm text-brandred">{error.message}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-darkbg-border bg-darkbg-900/40 p-10 text-center">
          <p className="text-soft">No leads assigned yet this period, partner.</p>
          <Link
            to="/owner/leads/my"
            className="mt-3 inline-block text-sm text-brandred hover:underline"
          >
            Go grab some leads →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-darkbg-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border bg-darkbg-900/60">
                {['Name','Role','Received','Qualified','Won','Goal','Gap','Progress','Conv %','Trend'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-soft font-normal">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setDrillRow(r)}
                  className={`cursor-pointer border-b border-darkbg-border transition hover:bg-darkbg-900/60 ${
                    i % 2 === 0 ? 'bg-darkbg-800' : 'bg-darkbg-900/30'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-white">{r.name}</td>
                  <td className="px-4 py-3 text-soft uppercase text-[11px] tracking-widest">{r.role}</td>
                  <td className="px-4 py-3 text-white">{r.received}</td>
                  <td className="px-4 py-3 text-blue-400">{r.qualified}</td>
                  <td className="px-4 py-3 text-emerald-400 font-semibold">{r.won}</td>
                  <td className="px-4 py-3 text-amber-200">{r.goal}</td>
                  <td className="px-4 py-3">
                    {r.gap === 0 ? (
                      <span className="text-emerald-400 font-semibold">✅ Done!</span>
                    ) : (
                      <span className="text-soft">{r.gap} to go</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><ProgressRing won={r.won} goal={r.goal} /></td>
                  <td className="px-4 py-3">
                    {r.pct == null ? (
                      <span className="text-soft">—</span>
                    ) : (
                      <span className={`font-bold ${r.pct >= 50 ? 'text-emerald-400' : r.pct >= 20 ? 'text-amber-300' : 'text-brandred'}`}>
                        {r.pct}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><TrendBadge curr={r.pct} prev={r.prevPct} /></td>
                  <td className="px-4 py-3 text-soft"><ChevronRight size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drillRow && <DrillDown row={drillRow} leads={drillLeads} onClose={() => setDrillRow(null)} />}
    </div>
  );
}
