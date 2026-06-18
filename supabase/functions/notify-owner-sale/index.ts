// notify-owner-sale — public Edge Function (verify_jwt=false). Called
// from the deals AFTER-INSERT trigger (and, when rebuilt, from the
// Upsell + Sales Opportunities surfaces). Fans out an owner alert on
// three channels, EACH WRAPPED IN ITS OWN TRY/CATCH so any one channel
// failing can never block the sale or the other channels.
//
// Channels
//   1) Email   → send-email template `owner_sale_alert` to BOTH addresses
//                in OWNER_SALE_ALERT_RECIPIENTS.
//   2) In-app  → insert a client_notifications row for the owner's
//                auth user. The same bell + Communication list the
//                hot-lead engine reads from picks this up automatically.
//   3) Bell    → derived from (2) — no separate emit, the bell badge
//                counts unread client_notifications rows.
//
// POST { deal_id, event_type? = 'sale_logged' | 'upsell_added' | 'opportunity_closed' }
//   → { ok: true, channels: { email: [...], inApp: {...} }, event_type }
//
// Reuses the existing notification engine. Does NOT build a second one.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const SEND_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-email`;
const APP_URL        = 'https://new-marketingio-crm-git-claude-nice-bohr-rtmziz-thapelo-l.vercel.app';

// Single source of truth for who gets the email alert. Edit here only.
// business.lekgoro@gmail.com is the owner's long-standing personal
// address — KEEP, do not swap.
const OWNER_SALE_ALERT_RECIPIENTS = [
  'business.lekgoro@gmail.com',
  'thapelom@marketingio.co.za',
];

// Owner's primary login email — used to resolve the recipient_user_id
// for the in-app notification. If this email has no auth user (e.g.,
// the owner hasn't signed in yet) the in-app channel is silently
// skipped — the emails still go.
const OWNER_LOGIN_EMAIL = 'business.lekgoro@gmail.com';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

type EventType = 'sale_logged' | 'upsell_added' | 'opportunity_closed';

function eventCopy(eventType: EventType) {
  switch (eventType) {
    case 'upsell_added':
      return { emoji: '➕', headline: 'New upsell added', verb: 'upsell logged' };
    case 'opportunity_closed':
      return { emoji: '🤝', headline: 'Sales opportunity closed', verb: 'opportunity closed' };
    case 'sale_logged':
    default:
      return { emoji: '💰', headline: 'New sale logged', verb: 'sale logged' };
  }
}

function fmtZar(n: number | string | null | undefined) {
  return 'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: 'bad_json' }, { status: 400, headers: cors }); }

  const dealId = String(body?.deal_id ?? '').trim();
  const eventType: EventType = (body?.event_type ?? 'sale_logged') as EventType;
  if (!dealId) return Response.json({ ok: false, error: 'deal_id required' }, { status: 400, headers: cors });

  // Resolve everything we need in one shot.
  const { data: deal, error: dErr } = await admin
    .from('deals')
    .select('id, client_id, client_name, package, add_on_name, deal_type, setup_fee, monthly_retainer, closer_id, closer_name, closer_role, stage, source')
    .eq('id', dealId)
    .maybeSingle();
  if (dErr || !deal) {
    return Response.json({ ok: false, error: dErr?.message ?? 'deal not found' }, { status: 404, headers: cors });
  }

  const { data: catalogRow } = await admin
    .from('system_settings').select('value').eq('key', 'package_catalog').maybeSingle();
  const catalog = Array.isArray(catalogRow?.value)
    ? catalogRow!.value as Array<{ code: string; name: string }>
    : [];
  const pkgCode = (deal.package ?? '').toLowerCase();
  const packageName =
    deal.deal_type === 'add_on'
      ? (deal.add_on_name ?? 'Add-on')
      : (catalog.find(p => p.code === pkgCode)?.name
         ?? (pkgCode ? pkgCode.charAt(0).toUpperCase() + pkgCode.slice(1) : 'Package'));

  const copy = eventCopy(eventType);
  const setupFee = Number(deal.setup_fee ?? 0);
  const monthly  = Number(deal.monthly_retainer ?? 0);
  const dealUrl  = `${APP_URL}/owner/sales/deals?focus=${deal.id}`;

  const channels: Record<string, unknown> = {};

  // ─── CHANNEL 1 — Email both addresses ─────────────────────────────────
  channels.email = await Promise.all(OWNER_SALE_ALERT_RECIPIENTS.map(async to => {
    try {
      const res = await fetch(SEND_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          template: 'owner_sale_alert',
          to,
          payload: {
            eventEmoji:  copy.emoji,
            eventHeadline: copy.headline,
            businessName: deal.client_name ?? 'a new client',
            packageName,
            setupFee,
            monthlyRetainer: monthly,
            closerName: deal.closer_name ?? 'Unknown closer',
            closerRole: deal.closer_role ?? null,
            source:     deal.source ?? null,
            dealUrl,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) return { to, ok: false, error: json?.error ?? `HTTP ${res.status}` };
      return { to, ok: true, id: json.id };
    } catch (err) {
      return { to, ok: false, error: (err as Error).message };
    }
  }));

  // ─── CHANNEL 2 — In-app row for the owner (drives Channel 3 bell) ─────
  const inApp: Record<string, unknown> = { event_type: eventType };
  try {
    // Lookup owner's auth user id by email. Skip in-app silently if
    // the owner hasn't been provisioned yet (emails still go out).
    const { data: list, error: listErr } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;
    const ownerAuth = (list?.users ?? []).find(
      (u: any) => (u.email ?? '').toLowerCase() === OWNER_LOGIN_EMAIL.toLowerCase()
    );

    if (!ownerAuth?.id) {
      inApp.ok = false;
      inApp.skipped = true;
      inApp.reason = 'owner_auth_user_not_found';
    } else {
      const titleParts = [
        copy.emoji, copy.headline, '—', deal.client_name ?? 'New client',
      ].filter(Boolean);
      const bodyText = `${packageName} · ${fmtZar(monthly)}/mo + ${fmtZar(setupFee)} setup` +
        (deal.closer_name ? ` · ${copy.verb} by ${deal.closer_name}` : '');

      const { data: inserted, error: insErr } = await admin
        .from('client_notifications')
        .insert({
          recipient_user_id:   ownerAuth.id,
          client_id:           deal.client_id,
          notification_type:   eventType,
          title:               titleParts.join(' '),
          body:                bodyText,
          related_entity_type: 'deal',
          related_entity_id:   deal.id,
          action_url:          dealUrl,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      inApp.ok = true;
      inApp.notification_id = inserted?.id;
    }
  } catch (err) {
    inApp.ok = false;
    inApp.error = (err as Error).message;
  }
  channels.inApp = inApp;

  // Audit
  try {
    await admin.from('client_activity_log').insert({
      client_id: deal.client_id,
      client_name: deal.client_name,
      actor_id: null,
      actor_role: 'system',
      event_type: 'owner_sale_alert_dispatched',
      event_category: 'communication',
      event_summary: `Owner ${eventType} alert dispatched`,
      event_metadata: { deal_id: deal.id, event_type: eventType, channels },
    });
  } catch (_) { /* swallow */ }

  return Response.json({ ok: true, deal_id: deal.id, event_type: eventType, channels }, { headers: cors });
});
