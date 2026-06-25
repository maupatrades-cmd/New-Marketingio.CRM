import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';

const BUCKET_LABEL = {
  A: 'Once-off products',
  B: 'Setup + monthly retainer',
  C: 'Annual retainer',
  D: 'Paid ads management',
  E: 'Pass-through (no commission)',
};
const BUCKET_TONE = {
  A: 'border-blue-400/40   bg-blue-400/10   text-blue-300',
  B: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  C: 'border-amber-400/40  bg-amber-400/10  text-amber-300',
  D: 'border-purple-400/40 bg-purple-400/10 text-purple-300',
  E: 'border-darkbg-border  bg-darkbg-800    text-soft',
};
const BUCKET_ORDER = ['A', 'B', 'C', 'D', 'E'];

function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UpsellWorkspace() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const clientQ = useQuery({
    queryKey: ['upsell_workspace_client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, business_name, contact_person, phone, email, package, monthly_retainer, signup_date, last_contact_at')
        .eq('id', clientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const ownedQ = useQuery({
    queryKey: ['owned_addons', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, add_on_name, add_on_code, setup_fee, monthly_retainer, closed_at')
        .eq('client_id', clientId)
        .eq('deal_type', 'add_on')
        .neq('stage', 'closed_lost');
      if (error) throw error;
      return data ?? [];
    },
  });

  const catalogQ = useQuery({
    queryKey: ['addon_catalogue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'addon_catalogue')
        .single();
      if (error) throw error;
      return data?.value ?? [];
    },
    staleTime: 300_000,
  });

  const activityQ = useQuery({
    queryKey: ['client_activity', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_activity_log')
        .select('event_type, event_summary, event_metadata, created_at, actor_role')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Build set of owned add-on codes
  const ownedCodes = new Set(
    (ownedQ.data ?? []).flatMap(d => [d.add_on_code, d.add_on_name].filter(Boolean))
  );

  // Group catalog by bucket
  const byBucket = (() => {
    const catalog = catalogQ.data ?? [];
    const map = {};
    for (const addon of catalog) {
      const b = addon.bucket ?? 'E';
      if (!map[b]) map[b] = [];
      map[b].push(addon);
    }
    return map;
  })();

  async function handleAdd(addon) {
    const client = clientQ.data;
    const note = window.prompt(
      `Add "${addon.name}" to ${client?.business_name}?\n\nOptional note (e.g. "Pitched during call"):`
    );
    if (note === null) return; // cancelled

    const { data, error } = await supabase.rpc('add_product_to_client', {
      p_client_id: clientId,
      p_addon_code: addon.code,
      p_note: note || null,
    });

    if (error) {
      if (error.message?.includes('already_owned')) {
        toast.error(`${client?.business_name} already has ${addon.name}. Use the Renew flow when it's ready.`);
      } else {
        toast.error(`Failed to add: ${error.message}`);
      }
      return;
    }

    toast.success(
      `Added ${data?.addon_name ?? addon.name} to ${client?.business_name}` +
      (data?.commission_amount > 0
        ? ` · Commission R${data.commission_amount}`
        : ' · No commission (pass-through)')
    );
    queryClient.invalidateQueries({ queryKey: ['owned_addons', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client_activity', clientId] });
  }

  async function handleAddPaidAds(addon) {
    const client = clientQ.data;
    const spend = window.prompt(`Monthly ad spend for ${client?.business_name}? (e.g. 10000)`);
    if (!spend) return;
    const spendNum = parseFloat(spend);
    if (isNaN(spendNum) || spendNum <= 0) {
      toast.error('Invalid spend amount');
      return;
    }

    const { data, error } = await supabase.rpc('add_product_to_client', {
      p_client_id: clientId,
      p_addon_code: addon.code,
      p_custom_monthly: spendNum,
      p_note: `Monthly ad spend: R${spendNum}`,
    });

    if (error) {
      if (error.message?.includes('already_owned')) {
        toast.error(`${client?.business_name} already has ${addon.name}.`);
      } else {
        toast.error(`Failed to add: ${error.message}`);
      }
      return;
    }

    toast.success(
      `Added ${data?.addon_name ?? addon.name} · Commission R${data?.commission_amount ?? 0}`
    );
    queryClient.invalidateQueries({ queryKey: ['owned_addons', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client_activity', clientId] });
  }

  const client = clientQ.data;
  const lastContactDays = daysSince(client?.last_contact_at);

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/owner/sales/upsell')}
        className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-white transition"
      >
        <ArrowLeft size={14}/> Back to Upsell
      </button>

      {/* Client header */}
      {clientQ.isLoading && <div className="card p-6 animate-pulse h-24" />}
      {clientQ.isError && (
        <div className="card border border-brandred/40 p-4 text-sm text-brandred">
          {clientQ.error?.message || 'Client not found'}
        </div>
      )}
      {client && (
        <div className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl text-white">{client.business_name}</h1>
              <p className="mt-1 text-sm text-soft">
                {[
                  client.contact_person,
                  client.phone,
                  client.signup_date && `since ${fmt(client.signup_date)}`,
                ].filter(Boolean).join(' · ')}
              </p>
              {lastContactDays !== null && (
                <p className={`mt-1 text-xs ${lastContactDays > 30 ? 'text-amber-300' : 'text-soft'}`}>
                  Last contact: {lastContactDays === 0 ? 'today' : `${lastContactDays}d ago`}
                </p>
              )}
            </div>
            {client.package && (
              <span className="shrink-0 rounded-full border border-darkbg-border px-3 py-1 text-xs uppercase tracking-widest text-soft capitalize">
                {client.package}
                {client.monthly_retainer ? ` · R${Number(client.monthly_retainer).toLocaleString('en-ZA')}/mo` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Add-ons catalog */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Add-ons</h2>
          {catalogQ.isFetching && <RefreshCw size={13} className="animate-spin text-soft"/>}
        </div>

        {catalogQ.isLoading && <p className="text-soft text-sm">Loading catalog…</p>}
        {catalogQ.isError && (
          <p className="text-sm text-brandred">{catalogQ.error?.message || 'Failed to load catalog'}</p>
        )}

        {BUCKET_ORDER.filter(b => byBucket[b]?.length > 0).map(bucket => (
          <div key={bucket}>
            <div className="mb-3 flex items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${BUCKET_TONE[bucket]}`}>
                Bucket {bucket}
              </span>
              <span className="text-xs text-soft">{BUCKET_LABEL[bucket]}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {byBucket[bucket].map(addon => {
                const owned = ownedCodes.has(addon.code);
                return (
                  <div
                    key={addon.code}
                    className={`rounded-xl border p-4 flex flex-col gap-2 transition ${
                      owned
                        ? 'border-darkbg-border bg-darkbg-900/40 opacity-60'
                        : 'border-darkbg-border bg-darkbg-800/40 hover:border-brandred/40'
                    }`}
                  >
                    <div className="text-2xl">{addon.emoji || '📦'}</div>
                    <p className="font-semibold text-white text-sm leading-snug">{addon.name}</p>
                    {addon.headline && (
                      <p className="text-xs text-soft leading-snug">{addon.headline}</p>
                    )}
                    {addon.price_label && (
                      <p className="text-xs font-mono text-white">{addon.price_label}</p>
                    )}
                    {bucket === 'D' && !owned && (
                      <p className="text-[10px] text-amber-300">Custom ad spend required</p>
                    )}
                    {bucket === 'E' && (
                      <p className="text-[10px] text-soft">Pass-through — no commission</p>
                    )}
                    <div className="mt-auto pt-1">
                      {owned ? (
                        <button disabled className="w-full rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">
                          ✓ Already owned
                        </button>
                      ) : (
                        <button
                          onClick={() => bucket === 'D' ? handleAddPaidAds(addon) : handleAdd(addon)}
                          className="w-full rounded-lg border border-brandred/40 bg-brandred/10 px-3 py-1.5 text-xs text-brandred hover:bg-brandred/20 transition"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!catalogQ.isLoading && Object.keys(byBucket).length === 0 && (
          <p className="text-soft text-sm">No add-ons in catalog yet.</p>
        )}
      </section>

      {/* Activity feed */}
      <section className="space-y-3">
        <h2 className="font-display text-xl">Activity</h2>
        {activityQ.isLoading && <p className="text-soft text-sm">Loading…</p>}
        {activityQ.isError && (
          <p className="text-sm text-brandred">{activityQ.error?.message || 'Failed to load activity'}</p>
        )}
        {(activityQ.data ?? []).length === 0 && !activityQ.isLoading && (
          <p className="text-soft text-sm">No activity recorded yet.</p>
        )}
        <div className="space-y-1">
          {(activityQ.data ?? []).map((ev, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-darkbg-border/40 px-4 py-2.5 text-sm">
              <span className="shrink-0 text-soft text-xs mt-0.5">{fmt(ev.created_at)}</span>
              <p className="text-white">{ev.event_summary || ev.event_type}</p>
              {ev.actor_role && (
                <span className="ml-auto shrink-0 text-[10px] text-soft uppercase tracking-widest">
                  {ev.actor_role}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
