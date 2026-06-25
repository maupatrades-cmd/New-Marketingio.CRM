import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, ChevronDown, Phone, MessageSquare, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';

const STATUS_TONE = {
  onboarding: 'border-blue-400/40   bg-blue-400/10   text-blue-300',
  live:       'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  dormant:    'border-amber-400/40  bg-amber-400/10  text-amber-300',
  cancelled:  'border-brandred/40   bg-brandred/10   text-brandred',
};

const STATUS_CHIPS = [
  { key: 'all',        label: 'All' },
  { key: 'owe',        label: '💰 Owe me money' },
  { key: 'onboarding', label: '🚀 Onboarding' },
  { key: 'live',       label: '✅ Live' },
  { key: 'dormant',    label: '😴 Dormant' },
  { key: 'cancelled',  label: '✕ Cancelled' },
];

function waPhone(phone) {
  if (!phone) return '#';
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('0') ? `27${digits.slice(1)}` : digits;
  return `https://wa.me/${e164}`;
}

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ZAR = (v) =>
  v == null ? '—' : `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

export default function MyClients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [contactMenu, setContactMenu] = useState(null); // client id

  const clientsQ = useQuery({
    queryKey: ['my_clients', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          id, business_name, contact_person, phone, email, industry,
          package, monthly_retainer, setup_fee_amount, setup_fee_paid,
          status, contract_start_date, go_live_date,
          debit_mandate_signed, popia_consent_given,
          created_by, assigned_field_agent, assigned_cpc,
          created_at, updated_at,
          deals!client_id (id, deal_type, stage, add_on_name)
        `)
        .or(`created_by.eq.${user.id},assigned_field_agent.eq.${user.id},assigned_cpc.eq.${user.id}`)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    let data = clientsQ.data ?? [];

    // Apply status filter
    if (statusFilter === 'owe') {
      data = data.filter(c => !c.setup_fee_paid);
    } else if (statusFilter !== 'all') {
      data = data.filter(c => c.status === statusFilter);
    }

    // Apply search
    const q = search.trim().toLowerCase();
    if (q) {
      data = data.filter(c =>
        (c.business_name || '').toLowerCase().includes(q) ||
        (c.contact_person || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    }

    // Sort: unpaid setup fee first, then by updated_at desc
    return [...data].sort((a, b) => {
      const aOwes = !a.setup_fee_paid ? 1 : 0;
      const bOwes = !b.setup_fee_paid ? 1 : 0;
      if (aOwes !== bOwes) return bOwes - aOwes;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [clientsQ.data, statusFilter, search]);

  const totalCount = clientsQ.data?.length ?? 0;

  function addonsCount(client) {
    return (client.deals ?? []).filter(
      d => d.deal_type === 'add_on' && d.stage === 'closed_won'
    ).length;
  }

  return (
    <div className="space-y-6" onClick={() => setContactMenu(null)}>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl">
            <span className="text-gradient">My Clients</span>
          </h1>
          <p className="mt-1 text-sm text-soft">
            Your book of business — {totalCount} client{totalCount !== 1 ? 's' : ''}
          </p>
        </div>
        <input
          type="text"
          placeholder="Search name, contact, phone, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-sm text-white placeholder:text-soft focus:border-brandred focus:outline-none w-64"
        />
      </header>

      {/* Filter chips */}
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
        <span className="ml-auto text-xs text-soft">{rows.length} shown</span>
      </div>

      {clientsQ.isLoading && <p className="text-soft">Loading clients…</p>}
      {clientsQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {clientsQ.error?.message || 'Failed to load clients'}
        </div>
      )}

      {!clientsQ.isLoading && totalCount === 0 && (
        <div className="card p-10 text-center">
          <Users size={36} className="mx-auto mb-3 text-soft/30"/>
          <p className="text-sm text-soft">
            You don't have any clients yet. Once you close a sale or are assigned as a field agent / CPC, they'll appear here.
          </p>
        </div>
      )}

      {!clientsQ.isLoading && totalCount > 0 && rows.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-sm text-soft">No clients match this filter. Try a different one.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map(client => {
          const addons = addonsCount(client);
          const owes = !client.setup_fee_paid && client.setup_fee_amount > 0;
          return (
            <div key={client.id} className="card p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display text-base text-white uppercase">
                      {client.business_name || '—'}
                    </h2>
                    {client.status && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${STATUS_TONE[client.status] || 'border-darkbg-border text-soft'}`}>
                        {client.status}
                      </span>
                    )}
                  </div>
                  {client.package && (
                    <p className="text-sm text-soft mt-0.5">
                      📦 <span className="capitalize">{client.package}</span>
                      {client.monthly_retainer > 0 && ` · ${ZAR(client.monthly_retainer)}/mo`}
                    </p>
                  )}
                  {client.setup_fee_amount > 0 && (
                    <p className={`text-xs mt-0.5 ${owes ? 'text-brandred' : 'text-emerald-300'}`}>
                      Setup: {ZAR(client.setup_fee_amount)} · {owes ? '❌ unpaid' : '✅ paid'}
                    </p>
                  )}
                  {(client.contact_person || client.phone) && (
                    <p className="text-xs text-soft mt-0.5">
                      {[client.contact_person, client.phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="text-xs text-soft mt-0.5">
                    {addons > 0 && `${addons} add-on${addons !== 1 ? 's' : ''} · `}
                    {client.contract_start_date && `Signed up ${fmt(client.contract_start_date)}`}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap border-t border-darkbg-border/40 pt-3">
                <button
                  onClick={() => navigate(`/owner/clients/${client.id}`)}
                  className="rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft hover:text-white hover:border-brandred transition"
                >
                  👁 View
                </button>
                <button
                  onClick={() => navigate(`/owner/sales/upsell/${client.id}`)}
                  className="rounded-lg border border-purple-400/40 bg-purple-400/10 px-3 py-1.5 text-xs text-purple-300 hover:bg-purple-400/20 transition"
                >
                  🎁 Pitch upsell
                </button>

                {/* Contact dropdown */}
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setContactMenu(contactMenu === client.id ? null : client.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs text-soft hover:text-white hover:border-brandred transition"
                  >
                    📞 Contact <ChevronDown size={11}/>
                  </button>
                  {contactMenu === client.id && (
                    <div className="absolute left-0 top-full z-10 mt-1 rounded-lg border border-darkbg-border bg-darkbg-800 shadow-xl min-w-max">
                      {client.phone && (
                        <a
                          href={`tel:${client.phone}`}
                          className="flex items-center gap-2 px-4 py-2 text-xs text-soft hover:text-white hover:bg-darkbg-700/40 first:rounded-t-lg"
                        >
                          <Phone size={11}/> Call {client.phone}
                        </a>
                      )}
                      {client.phone && (
                        <a
                          href={waPhone(client.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 text-xs text-soft hover:text-white hover:bg-darkbg-700/40"
                        >
                          <MessageSquare size={11}/> WhatsApp
                        </a>
                      )}
                      {client.email && (
                        <a
                          href={`mailto:${client.email}`}
                          className="flex items-center gap-2 px-4 py-2 text-xs text-soft hover:text-white hover:bg-darkbg-700/40 last:rounded-b-lg"
                        >
                          <Mail size={11}/> Email
                        </a>
                      )}
                      {!client.phone && !client.email && (
                        <p className="px-4 py-2 text-xs text-soft">No contact info</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
