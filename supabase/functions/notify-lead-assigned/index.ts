// notify-lead-assigned v1 — unauthenticated (verify_jwt=false).
// Called manually (and later by assign_lead RPC via pg_net, Phase 3 PR 2.5).
//
// POST { lead_id, assignee_id, assigner_id }
//
// Flow:
//   1. Look up lead (business_name, contact_person, phone).
//   2. Look up assignee email + full_name.
//   3. Look up assigner full_name (for email copy).
//   4. 60-min debounce per (lead_id, assignee_id) — prevents reassignment spam.
//   5. Fan-out (independent try/catches):
//      a) Bell: insert client_notifications row for assignee.
//      b) Email: send-email template `lead_assigned` to assignee only.
//         No owner CC per spec §1.2.
//   6. Audit log: lead_assigned_dispatched.

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

  const leadId     = String(body?.lead_id     ?? '').trim();
  const assigneeId = String(body?.assignee_id ?? '').trim();
  const assignerId = String(body?.assigner_id ?? '').trim();

  if (!leadId || !assigneeId || !assignerId) {
    return Response.json(
      { ok: false, error: 'lead_id, assignee_id, and assigner_id are required' },
      { status: 400, headers: cors },
    );
  }

  console.log('[notify-lead-assigned] START lead_id:', leadId, 'assignee_id:', assigneeId, 'assigner_id:', assignerId);

  // 1. Lead lookup.
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('id, business_name, contact_person, phone')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    console.error('[notify-lead-assigned] lead lookup failed:', leadErr?.message ?? 'not found');
    return Response.json({ ok: false, error: leadErr?.message ?? 'lead not found' }, { status: 404, headers: cors });
  }

  // 2. Assignee: need email for the email channel, full_name for the bell title.
  const { data: assigneeAuth, error: assigneeAuthErr } = await admin.auth.admin.getUserById(assigneeId);
  if (assigneeAuthErr || !assigneeAuth?.user) {
    console.error('[notify-lead-assigned] assignee auth lookup failed:', assigneeAuthErr?.message ?? 'not found');
    return Response.json({ ok: false, error: 'assignee not found' }, { status: 404, headers: cors });
  }
  const assigneeEmail = assigneeAuth.user.email ?? '';

  const { data: assigneeProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', assigneeId)
    .maybeSingle();
  const assigneeName = assigneeProfile?.full_name ?? assigneeEmail;

  // 3. Assigner name (for email copy).
  const { data: assignerProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', assignerId)
    .maybeSingle();
  const assignerName = assignerProfile?.full_name ?? 'Your manager';

  console.log('[notify-lead-assigned] assignee:', assigneeName, assigneeEmail, '| assigner:', assignerName);

  // 4. 60-min debounce per (lead_id, assignee_id).
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from('client_notifications')
    .select('id')
    .eq('notification_type', 'lead_assigned')
    .eq('related_entity_id', leadId)
    .eq('recipient_user_id', assigneeId)
    .gt('created_at', oneHourAgo)
    .limit(1);

  if (recent && recent.length > 0) {
    console.log('[notify-lead-assigned] debounced — recent notification id:', recent[0].id);
    await admin.from('audit_log').insert({
      actor_id:   assignerId,
      action:     'lead_assigned_debounce_skipped',
      table_name: 'leads',
      row_id:     leadId,
      after_data: { reason: 'debounce_60min', notification_id: recent[0].id, assignee_id: assigneeId },
    });
    return Response.json({ ok: true, skipped: true, reason: 'debounced', debounce_window_minutes: 60 }, { headers: cors });
  }

  const leadUrl = `${APP_URL}/owner/sales/leads?focus=${leadId}`;
  const channels: Record<string, unknown> = {};

  // 5a. Bell notification.
  const bell: Record<string, unknown> = {};
  try {
    const { data: inserted, error: bellErr } = await admin
      .from('client_notifications')
      .insert({
        recipient_user_id:   assigneeId,
        notification_type:   'lead_assigned',
        title:               `📬 New lead assigned: ${lead.business_name ?? 'New lead'}`,
        body:                [lead.contact_person, lead.phone].filter(Boolean).join(' · ') || 'No contact details',
        related_entity_type: 'lead',
        related_entity_id:   leadId,
        action_url:          leadUrl,
      })
      .select('id')
      .single();

    if (bellErr) throw bellErr;
    bell.ok    = true;
    bell.id    = inserted?.id;
    console.log('[notify-lead-assigned] bell inserted id:', bell.id);
  } catch (err: any) {
    bell.ok    = false;
    bell.error = err.message;
    console.error('[notify-lead-assigned] bell insert error:', err.message);
  }
  channels.bell = bell;

  // 5b. Email to assignee only — no owner CC per spec §1.2.
  const email: Record<string, unknown> = {};
  if (!assigneeEmail) {
    email.ok      = false;
    email.skipped = true;
    email.reason  = 'assignee_has_no_email';
    console.warn('[notify-lead-assigned] skipping email — assignee has no email address');
  } else {
    try {
      const res = await fetch(SEND_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          template: 'lead_assigned',
          to: assigneeEmail,
          payload: {
            businessName:   lead.business_name ?? 'New lead',
            assignedByName: assignerName,
            leadUrl,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        email.ok    = false;
        email.error = json?.error ?? `HTTP ${res.status}`;
      } else {
        email.ok = true;
        email.id = json.id;
      }
      console.log('[notify-lead-assigned] email to', assigneeEmail, ':', email.ok ? 'ok' : (email as any).error);
    } catch (err: any) {
      email.ok    = false;
      email.error = err.message;
      console.error('[notify-lead-assigned] email threw:', err.message);
    }
  }
  channels.email = email;

  // 6. Audit log.
  const { error: auditErr } = await admin.from('audit_log').insert({
    actor_id:   assignerId,
    action:     'lead_assigned_dispatched',
    table_name: 'leads',
    row_id:     leadId,
    after_data: { lead_id: leadId, assignee_id: assigneeId, assigner_id: assignerId, channels },
  });
  if (auditErr) console.error('[notify-lead-assigned] audit insert failed:', auditErr.message);

  console.log('[notify-lead-assigned] DONE lead_id:', leadId, 'channels:', JSON.stringify(channels));
  return Response.json({ ok: true, lead_id: leadId, assignee_id: assigneeId, channels }, { headers: cors });
});
