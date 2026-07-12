import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Phone, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const MANAGER_ROLES = ['owner', 'admin', 'head_of_tech'];
const OUTCOME_LABEL = {
  connected_interested:     '✅ Interested',
  connected_not_interested: '🚫 Not interested',
  connected_callback_later: '📅 Callback later',
  voicemail_left:           '📬 Voicemail',
  no_answer:               '📵 No answer',
  wrong_number:            '❌ Wrong number',
  do_not_call:             '🔴 Do not call',
  busy:                    '📞 Busy',
};
const OUTCOME_TONE = {
  connected_interested:     'text-emerald-400',
  connected_not_interested: 'text-red-400',
  connected_callback_later: 'text-amber-400',
  voicemail_left:           'text-blue-400',
  no_answer:               'text-soft',
  wrong_number:            'text-red-400/60',
  do_not_call:             'text-red-500',
  busy:                    'text-soft',
};

export default function CallLog() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isManager = MANAGER_ROLES.includes(role);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const callsQ = useQuery({
    queryKey: ['call_log', user?.id, dateFrom, dateTo, outcomeFilter, page],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('call_log')
        .select('id, called_phone, called_name, outcome, duration_seconds, was_answered, follow_up_date, notes, called_at, lead_id', { count: 'exact' })
        .eq('caller_id', user.id)
        .order('called_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (dateFrom)                 q = q.gte('called_at', dateFrom);
      if (dateTo)                   q = q.lte('called_at', dateTo + 'T23:59:59');
      if (outcomeFilter !== 'all')  q = q.eq('outcome', outcomeFilter);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const rows  = callsQ.data?.rows ?? [];
  const total = callsQ.data?.total ?? 0;

  function fmtDuration(s) {
    if (!s) return '—';
    if (s < 60) return `${s}s`;
    return `${Math.floor(s/60)}m ${s % 60}s`;
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl"><span className="text-gradient">Call Log</span></h1>
          <p className="mt-1 text-sm text-soft">Your outbound call history</p>
        </div>
        <button
          onClick={() => navigate('/owner/calls/new')}
          className="inline-flex items-center gap-2 rounded-xl bg-brandred px-4 py-2 text-sm text-white hover:brightness-110"
        >
          <Plus size={15}/> Log call
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }}
          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 text-sm text-white"/>
        <span className="text-soft text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }}
          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 text-sm text-white"/>
        <select value={outcomeFilter} onChange={e => { setOutcomeFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-2 py-1.5 text-sm text-white">
          <option value="all">All outcomes</option>
          {Object.entries(OUTCOME_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button onClick={() => callsQ.refetch()} disabled={callsQ.isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft hover:text-white disabled:opacity-50">
          <RefreshCw size={12} className={callsQ.isFetching ? 'animate-spin' : ''}/> Refresh
        </button>
        <span className="ml-auto text-xs text-soft">{total} call{total !== 1 ? 's' : ''}</span>
      </div>

      {callsQ.isLoading && <p className="text-soft">Loading…</p>}
      {callsQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">{callsQ.error?.message}</div>
      )}

      {!callsQ.isLoading && rows.length === 0 && (
        <div className="card p-10 text-center">
          <Phone size={32} className="mx-auto mb-3 text-soft/30"/>
          <p className="text-sm text-soft">No calls logged yet.</p>
          <button onClick={() => navigate('/owner/calls/new')}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brandred px-4 py-2 text-sm text-white hover:brightness-110">
            <Plus size={14}/> Log your first call
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border text-left text-xs uppercase tracking-widest text-soft">
                <th className="px-3 py-2">Date/time</th>
                <th className="px-3 py-2">Number</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Follow up</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-darkbg-border/40 transition hover:bg-darkbg-900/40">
                  <td className="px-3 py-2 text-soft whitespace-nowrap">
                    {new Date(r.called_at).toLocaleString('en-ZA', { dateStyle:'medium', timeStyle:'short' })}
                  </td>
                  <td className="px-3 py-2">
                    <a href={`tel:${r.called_phone}`} className="font-mono text-white hover:text-brandred">
                      {r.called_phone}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-soft">{r.called_name || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={OUTCOME_TONE[r.outcome] || 'text-soft'}>
                      {OUTCOME_LABEL[r.outcome] || r.outcome}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-soft">{fmtDuration(r.duration_seconds)}</td>
                  <td className="px-3 py-2 text-soft">{r.follow_up_date || '—'}</td>
                  <td className="px-3 py-2 text-soft max-w-[200px] truncate">{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-soft">
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
            className="rounded border border-darkbg-border px-3 py-1.5 hover:text-white disabled:opacity-40">← Prev</button>
          <span>Page {page+1} of {Math.ceil(total/PAGE_SIZE)}</span>
          <button onClick={() => setPage(p => p+1)} disabled={(page+1)*PAGE_SIZE >= total}
            className="rounded border border-darkbg-border px-3 py-1.5 hover:text-white disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
