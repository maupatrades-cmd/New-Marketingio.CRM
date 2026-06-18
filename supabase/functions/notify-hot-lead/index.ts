// notify-hot-lead — unauthenticated (verify_jwt=false).
// Called by the fire_hot_lead_alert DB trigger via pg_net.
//
// POST { lead_id }
//
// Flow:
//   1. Look up the lead.
//   2. Read hot_lead_alert_recipients from system_settings.
//   3. 60-min debounce: if a hot_lead notification already exists for this
//      lead in the last hour, log a breadcrumb and skip fan-out.
//   4. Fan-out (three independent try/catches):
//      a) Insert client_notifications rows for every owner + admin user.
//      b) Send send-email template `hot_lead_alert` to each recipient.
//      c) (CPC direct channel — deferred; flag for follow-up.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL        = Deno.env.get('APP_URL') ?? 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app';
const SEND_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-email`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: 'bad_json' }, { status: 400, headers: cors }); }

  const leadId = String(body?.lead_id ?? '').trim();
  if (!leadId) {
    return Response.json({ ok: false, error: 'lead_id required' }, { status: 400, headers: cors });
  }

  // ── 1. Look up lead ───────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('id, business_name, contact_person, phone, interest_package, submitted_by, submitted_by_name, lead_temperature')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    return Response.json({ ok: false, error: leadErr?.message ?? 'lead not found' }, { status: 404, headers: cors });
  }

  if (lead.lead_temperature !== 'hot') {
    return Response.json({ ok: true, skipped: true, reason: 'lead not hot' }, { headers: cors });
  }

  // ── 2. Alert recipients ───────────────────────────────────────────────────
  const { data: settingRow } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'hot_lead_alert_recipients')
    .maybeSingle();

  const recipients: string[] = Array.isArray(settingRow?.value)
    ? settingRow!.value as string[]
    : ['business.lekgoro@gmail.com', 'thapelom@marketingio.co.za'];

  // ── 3. 60-min debounce ────────────────────────────────────────────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from('client_notifications')
    .select('id')
    .eq('notification_type', 'hot_lead')
    .eq('related_entity_id', leadId)
    .gt('created_at', oneHourAgo)
    .limit(1);

  if (recent && recent.length > 0) {
    try {
      await admin.from('audit_log').insert({
        actor_id:   null,
        action:     'skipped',
        table_name: 'leads',
        record_id:  leadId,
        metadata:   { reason: 'hot_lead_debounce_60min', notification_id: recent[0].id },
      });
    } catch (_) { /* non-fatal */ }

    return Response.json({
      ok: true,
      skipped: true,
      reason: 'debounced',
      debounce_window_minutes: 60,
    }, { headers: cors });
  }

  const leadUrl = `${APP_URL}/owner/sales/leads?focus=${leadId}`;
  const channels: Record<string, unknown> = {};

  // ── 4a. In-app notifications for every owner + admin ─────────────────────
  const inApp: Record<string, unknown> = {};
  try {
    const { data: staffList, error: staffErr } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('role', ['owner', 'admin']);

    if (staffErr) throw staffErr;

    if (!staffList || staffList.length === 0) {
      inApp.ok = false;
      inApp.skipped = true;
      inApp.reason = 'no_owner_admin_profiles';
    } else {
      const rows = staffList.map((u: any) => ({
        recipient_user_id:   u.id,
        notification_type:   'hot_lead',
        title:               `🔥 Hot lead — ${lead.business_name ?? 'New lead'}`,
        body:                `${lead.contact_person ?? 'Unknown'}${lead.phone ? ' · ' + lead.phone : ''}${lead.interest_package ? ' · interested in ' + lead.interest_package : ''}`,
        related_entity_type: 'lead',
        related_entity_id:   leadId,
        action_url:          leadUrl,
      }));

      const { data: inserted, error: insErr } = await admin
        .from('client_notifications')
        .insert(rows)
        .select('id');

      if (insErr) throw insErr;
      inApp.ok = true;
      inApp.count = inserted?.length ?? 0;
    }
  } catch (err) {
    inApp.ok = false;
    inApp.error = (err as Error).message;
  }
  channels.inApp = inApp;

  // ── 4b. Email alert to each recipient ────────────────────────────────────
  channels.email = await Promise.all(recipients.map(async to => {
    try {
      const res = await fetch(SEND_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          template: 'hot_lead_alert',
          to,
          payload: {
            businessName: lead.business_name ?? 'Unknown',
            capturer:     lead.submitted_by_name ?? 'Public referral',
            phone:        lead.phone ?? '—',
            interest:     lead.interest_package ?? '—',
            leadUrl,
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

  // ── 4c. CPC direct channel — deferred ────────────────────────────────────
  channels.cpc = { deferred: true, reason: 'CPC notification channel not yet implemented' };

  // ── Audit log ─────────────────────────────────────────────────────────────
  try {
    await admin.from('audit_log').insert({
      actor_id:   null,
      action:     'hot_lead_alert_dispatched',
      table_name: 'leads',
      record_id:  leadId,
      metadata:   { lead_id: leadId, recipients, channels },
    });
  } catch (_) { /* swallow */ }

  return Response.json({ ok: true, lead_id: leadId, channels }, { headers: cors });
});
