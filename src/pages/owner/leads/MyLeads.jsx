// /owner/leads/my — personal lead view for field_agent and cpc roles.
// Shows only leads the current user submitted or is assigned to (enforced
// server-side by RLS). Owner/admin can also see this page but will be nudged
// toward the full inbox at /owner/sales/leads.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, ChevronLeft, ChevronRight, Flame, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

const PAGE_SIZE = 25;

const STATUS_BADGE = {
  pending_verification: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  verified:             'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  needs_clarification:  'border-sky-400/40 bg-sky-400/10 text-sky-300',
  rejected:             'border-brandred/40 bg-brandred/10 text-brandred',
  duplicate:            'border-darkbg-border bg-darkbg-900/60 text-soft',
  converted:            'border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300',
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { dateStyle: 'short' });
};

export default function MyLeads() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-leads', user?.id, page, search, statusFilter],
    queryFn: async () => {
      if (!user?.id) return { rows: [], count: 0 };
      let q = supabase
        .from('leads')
        .select('id, business_name, contact_person, phone, status, lead_temperature, interest_package, created_at, submitted_by_name, profiles!leads_assigned_to_fkey(full_name)', { count: 'exact' })
        .or(`submitted_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (statusFilter !== '__all__') q = q.eq('status', statusFilter);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`business_name.ilike.${s},contact_person.ilike.${s},phone.ilike.${s}`);
      }

      const { data: rows, count, error } = await q;
      if (error) throw error;
      return { rows: rows ?? [], count: count ?? 0 };
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  const STATUS_FILTERS = [
    { id: '__all__',              label: 'All' },
    { id: 'pending_verification', label: 'Pending' },
    { id: 'verified',             label: 'Verified' },
    { id: 'needs_clarification',  label: 'Clarify' },
    { id: 'converted',            label: 'Converted' },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gradient">My leads</h1>
          <p className="text-sm text-soft">Leads you submitted or are assigned to</p>
        </div>
        <button
          onClick={() => navigate('/owner/leads/new')}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus size={16} /> New lead
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
          <input
            className="input w-full pl-8"
            placeholder="Search…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => { setStatusFilter(f.id); setPage(0); }}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                statusFilter === f.id
                  ? 'border-brandred bg-brandred/20 text-brandred font-semibold'
                  : 'border-darkbg-border text-soft hover:border-brandred/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-center text-soft py-10">Loading…</p>}
      {isError  && <p className="text-center text-brandred py-10">Failed to load leads</p>}

      {!isLoading && !isError && (
        <>
          {(data?.rows ?? []).length === 0 ? (
            <div className="card p-10 text-center text-soft">
              <p className="mb-3">No leads yet.</p>
              <button onClick={() => navigate('/owner/leads/new')} className="btn-primary">
                Capture your first lead
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.rows ?? []).map(lead => (
                <div key={lead.id} className="card p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white truncate">
                        {lead.business_name ?? '—'}
                      </span>
                      {lead.lead_temperature === 'hot' && (
                        <span className="flex items-center gap-0.5 text-xs text-orange-400">
                          <Flame size={12} /> Hot
                        </span>
                      )}
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_BADGE[lead.status] ?? 'border-darkbg-border text-soft'}`}>
                        {lead.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-soft mt-0.5">
                      {lead.contact_person ?? '—'}{lead.phone ? ` · ${lead.phone}` : ''}
                      {lead.interest_package ? ` · ${lead.interest_package}` : ''}
                    </p>
                    <p className="text-xs text-soft/60 mt-0.5">
                      Captured {fmtDate(lead.created_at)}
                      {lead.submitted_by_name ? ` by ${lead.submitted_by_name}` : ''}
                      {' · '}
                      {lead.profiles?.full_name ? `Assigned to ${lead.profiles.full_name}` : 'Unassigned'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-ghost flex items-center gap-1 disabled:opacity-40">
                <ChevronLeft size={16}/> Prev
              </button>
              <span className="text-sm text-soft">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn-ghost flex items-center gap-1 disabled:opacity-40">
                Next <ChevronRight size={16}/>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
