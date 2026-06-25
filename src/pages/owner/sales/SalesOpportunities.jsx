import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';

// ── Colour maps ──────────────────────────────────────────────────────────────

const INVOICE_TONE = {
  paid:      'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  sent:      'border-blue-400/40   bg-blue-400/10   text-blue-300',
  overdue:   'border-brandred/40   bg-brandred/10   text-brandred',
  cancelled: 'border-darkbg-border bg-darkbg-800    text-soft',
  draft:     'border-amber-400/40  bg-amber-400/10  text-amber-300',
  none:      'border-amber-400/40  bg-amber-400/10  text-amber-300',
};

const TEMP_EMOJI = { hot: '🔥', warm: '⚡', cool: '❄️' };

const FILTER_CHIPS = [
  { key: null,           label: 'All' },
  { key: 'sold_unpaid',  label: '💰 Sold-unpaid' },
  { key: 'negotiating',  label: '🤝 Negotiating' },
  { key: 'prospect',     label: '🌱 Prospects' },
  { key: 'dormant',      label: '😴 Dormant' },
  { key: 'expiring_soon',label: '🔥 Expiring' },
];

const EMPTY_MESSAGES = {
  sold_unpaid:   '🎉 Everyone\'s paid up. Beautiful.',
  negotiating:   'No active negotiations. Time to convert some prospects.',
  prospect:      'No new leads. Maybe nudge the field team?',
  dormant:       'Nobody dormant — your retention is solid.',
  expiring_soon: 'No leads expiring soon.',
  null:          'Nothing on the worksheet. Either you\'re crushing it or your team needs leads.',
};

const ZAR = (v) =>
  v == null ? '—' : `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function waPhone(phone) {
  if (!phone) return '#';
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('0') ? `27${digits.slice(1)}` : digits;
  return `https://wa.me/${e164}`;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SalesOpportunities() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('sold_unpaid');
  const [search, setSearch] = useState('');
  const [debSearch, setDebSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const oppsQ = useQuery({
    queryKey: ['sales_opportunities', statusFilter, debSearch],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_opportunities', {
        p_search: debSearch || null,
        p_status_filter: statusFilter,
        p_limit: 200,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Count badges per chip — only for 'all' query when no search
  const countsQ = useQuery({
    queryKey: ['sales_opportunities_counts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_opportunities', {
        p_search: null,
        p_status_filter: null,
        p_limit: 500,
      });
      if (error) throw error;
      const all = data ?? [];
      return {
        sold_unpaid:   all.filter(r => r.opportunity_type === 'sold_unpaid').length,
        negotiating:   all.filter(r => r.opportunity_type === 'negotiating').length,
        prospect:      all.filter(r => r.opportunity_type === 'prospect').length,
        dormant:       all.filter(r => r.opportunity_type === 'dormant').length,
        expiring_soon: all.filter(r => r.claim_status === 'expiring_soon').length,
        total:         all.length,
      };
    },
    staleTime: 120_000,
  });
  const counts = countsQ.data ?? {};

  async function handleChaseFee(opp) {
    const { error } = await supabase.rpc('create_task', {
      p_title: `Chase setup fee — ${opp.business_name}`,
      p_description: `Outstanding ${ZAR(opp.setup_fee_amount)} on invoice ${opp.latest_invoice_number || '(no invoice)'}.\nInvoice status: ${opp.invoice_status || 'none'}.`,
      p_priority: opp.invoice_status === 'overdue' ? 'urgent' : 'high',
      p_due_date: tomorrow(),
      p_assignee_id: null,
      p_client_id: opp.client_id_if_sold || null,
      p_deal_id: null,
    });
    if (error) {
      toast.error(`Failed to create task: ${error.message}`);
      return;
    }
    toast.success('Task created — find it in Tasks');
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }

  const rows = oppsQ.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">Sales Opportunities</span>
          </h1>
          <p className="mt-1 text-sm text-soft">
            The pitch worksheet — every prospect, every sold-unpaid, every dormant.
          </p>
        </div>
        <button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['sales_opportunities'] });
            queryClient.invalidateQueries({ queryKey: ['sales_opportunities_counts'] });
          }}
          disabled={oppsQ.isFetching}
          className="inline-flex items-center gap-2 rounded-xl border border-darkbg-border bg-darkbg-800/60 px-3 py-2 text-sm text-soft transition hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={oppsQ.isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* Filter chips with counts */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_CHIPS.map(chip => {
          const count = chip.key ? counts[chip.key] : counts.total;
          return (
            <button
              key={String(chip.key)}
              onClick={() => setStatusFilter(chip.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs uppercase tracking-widest transition ${
                statusFilter === chip.key
                  ? 'border-brandred bg-brandred/10 text-brandred'
                  : 'border-darkbg-border text-soft hover:text-white'
              }`}
            >
              {chip.label}
              {count != null && (
                <span className="rounded-full bg-darkbg-700 px-1.5 text-[10px]">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search business name, contact, phone…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none w-72"
      />

      {oppsQ.isLoading && (
        <div className="flex items-center gap-2 text-soft">
          <Loader2 size={16} className="animate-spin"/> Loading…
        </div>
      )}
      {oppsQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {oppsQ.error?.message || 'Failed to load opportunities'}
        </div>
      )}

      {!oppsQ.isLoading && rows.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-sm text-soft">
            {EMPTY_MESSAGES[statusFilter] ?? EMPTY_MESSAGES.null}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((opp, i) => (
          <OppRow
            key={opp.id ?? i}
            opp={opp}
            navigate={navigate}
            onChaseFee={handleChaseFee}
          />
        ))}
      </div>
    </div>
  );
}

// ── Opportunity row ──────────────────────────────────────────────────────────

function OppRow({ opp, navigate, onChaseFee }) {
  const type = opp.opportunity_type;
  const days = daysSince(opp.last_activity_at);

  return (
    <div className="card p-4 space-y-3">
      {/* Type badge + meta */}
      <div className="flex items-center gap-2 text-xs text-soft">
        {type === 'sold_unpaid'  && <span className="text-amber-300 font-semibold uppercase tracking-wide">💰 Sold — invoice</span>}
        {type === 'negotiating'  && <span className="text-purple-300 font-semibold uppercase tracking-wide">🤝 Negotiating</span>}
        {type === 'prospect'     && <span className="text-blue-300 font-semibold uppercase tracking-wide">🌱 Prospect</span>}
        {type === 'dormant'      && <span className="text-amber-300 font-semibold uppercase tracking-wide">😴 Dormant</span>}

        {opp.invoice_status && type === 'sold_unpaid' && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${INVOICE_TONE[opp.invoice_status] || INVOICE_TONE.none}`}>
            {opp.invoice_status}
          </span>
        )}
        {opp.current_stage && type !== 'sold_unpaid' && (
          <span>stage: {opp.current_stage.replace('_', ' ')}</span>
        )}
        {days != null && <span>· {days}d since activity</span>}
      </div>

      {/* Identity */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-display text-base text-white uppercase">{opp.business_name || '—'}</p>
          {opp.lead_temperature && (
            <span className="text-sm">{TEMP_EMOJI[opp.lead_temperature] || ''} <span className="text-xs text-soft capitalize">{opp.lead_temperature}</span></span>
          )}
          {opp.claim_status === 'expiring_soon' && opp.claim_days_remaining != null && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
              Expiring in {opp.claim_days_remaining}d
            </span>
          )}
          {opp.claim_status === 'expired' && (
            <span className="rounded-full border border-brandred/40 bg-brandred/10 px-2 py-0.5 text-[10px] text-brandred">
              Claim expired
            </span>
          )}
        </div>

        {/* Package info */}
        {type === 'sold_unpaid' && opp.actual_package && (
          <p className="text-sm text-soft mt-0.5">
            📦 <span className="capitalize">{opp.actual_package}</span>
            {opp.setup_fee_amount > 0 && ` · ${ZAR(opp.setup_fee_amount)} setup`}
            {opp.addons_count > 0 && ` · ${opp.addons_count} add-on${opp.addons_count !== 1 ? 's' : ''}`}
          </p>
        )}
        {type === 'dormant' && opp.actual_package && (
          <p className="text-sm text-soft mt-0.5">
            Was: <span className="capitalize">{opp.actual_package}</span> · now no active package
          </p>
        )}
        {(type === 'negotiating' || type === 'prospect') && (
          <p className="text-sm text-soft mt-0.5">
            📋 Proposed: {opp.proposed_package
              ? <span className="capitalize text-white">{opp.proposed_package}</span>
              : <span className="italic">Not specified</span>}
          </p>
        )}

        {/* Contact */}
        {(opp.contact_person || opp.phone) && (
          <p className="text-xs text-soft mt-0.5">
            {[opp.contact_person, opp.phone].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Invoice number */}
        {opp.latest_invoice_number && (
          <p className="text-xs text-soft mt-0.5">Invoice {opp.latest_invoice_number}</p>
        )}

        {/* Assigned / originator */}
        {opp.assigned_to_name && (
          <p className="text-xs text-soft mt-0.5">Assigned: {opp.assigned_to_name}</p>
        )}
        {opp.originator_name && type === 'prospect' && (
          <p className="text-xs text-soft mt-0.5">
            Submitted by: {opp.originator_name}
            {opp.claim_days_remaining != null && ` · expires in ${opp.claim_days_remaining}d`}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap border-t border-darkbg-border/40 pt-3">
        {type === 'sold_unpaid' && (
          <button
            onClick={() => onChaseFee(opp)}
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-400/20 transition"
          >
            📞 Chase fee
          </button>
        )}
        {type === 'sold_unpaid' && opp.client_id_if_sold && (
          <button
            onClick={() => navigate(`/owner/sales/upsell/${opp.client_id_if_sold}`)}
            className="rounded-lg border border-purple-400/40 bg-purple-400/10 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-400/20 transition"
          >
            🎁 Pitch upsell
          </button>
        )}
        {(type === 'negotiating' || type === 'prospect') && (
          <button
            onClick={() => navigate(`/owner/sales/log?lead=${opp.id}&from_so=1`)}
            className="rounded-lg border border-brandred/40 bg-brandred/10 px-3 py-1.5 text-xs text-brandred hover:bg-brandred/20 transition"
          >
            💰 Log Sale
          </button>
        )}
        {type === 'dormant' && (
          <button
            onClick={() => navigate(`/owner/sales/upsell/${opp.id}`)}
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-400/20 transition"
          >
            🔄 Re-engage
          </button>
        )}

        {/* View */}
        <button
          onClick={() => {
            if (opp.source_type === 'dormant_client') navigate(`/owner/clients/${opp.id}`);
            else navigate(`/owner/leads/${opp.id}/inbox`);
          }}
          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft hover:text-white hover:border-brandred transition"
        >
          👁 View
        </button>

        {/* Quick contact */}
        {opp.phone && (
          <a
            href={waPhone(opp.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft hover:text-white hover:border-emerald-400 transition"
          >
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
