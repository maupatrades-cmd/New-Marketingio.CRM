// notify-lead-milestone v2 — unauthenticated (verify_jwt=false).
// Fires assigner bell + email at every significant milestone in a lead's lifecycle.
// Called by: qualify_lead RPC (milestones 1-3), deals trigger (4-6), cold-lead cron (7).
//
// POST { lead_id, milestone, metadata? }
//
// Milestone set (v2):
//   qualified_verified | qualified_clarify | qualified_reject
//   deal_created | sale_won | sale_lost | cold
//
// Also accepted but NOT YET WIRED — Slice 8 Activity:
//   contacted | meeting
//
// Idempotency: lead_milestones_fired table — one fire per (lead_id, milestone).
// cold v1: fires once per lifecycle. To re-fire after reassignment, DELETE the row
//   for that lead from lead_milestones_fired where milestone='cold'. Deferred to PR 3.5.
//
// Flow:
//   1. Validate lead_id + milestone.
//   2. Lead lookup → assigned_by + business_name.
//   3. If no assigner, skip (no_assigner).
//   4. Check lead_milestones_fired — if row exists, skip (already_fired).
//   5. Assigner profile + email lookup.
//   6. Fan-out (independent try/catches): bell + email.
//   7. INSERT lead_milestones_fired ON CONFLICT DO NOTHING.
//   8. Audit log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL        = Deno.env.get('APP_URL') ?? 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app';
const SEND_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-email`;

// Milestones wired today. contacted + meeting accepted but not wired until Slice 8.
const VALID_MILESTONES = new Set([
  'qualified_verified', 'qualified_clarify', 'qualified_reject',
  'deal_created', 'sale_won', 'sale_lost', 'cold',
  'contacted', 'meeting', // Slice 8 — accepted, nothing calls these yet
]);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

const MILESTONE_COPY: Record<string, { emoji: string; title: string; line: string }> = {
  qualified_verified: { emoji: '✅', title: 'Lead qualified',      line: 'has been qualified and verified.' },
  qualified_clarify:  { emoji: '💬', title: 'Needs clarification', line: 'needs more information before it can be verified.' },
  qualified_reject:   { emoji: '❌', title: 'Lead rejected',       line: 'has been rejected after review.' },
  deal_created:       { emoji: '📝', title: 'Deal opened',         line: 'has been converted — a deal is now open.' },
  sale_won:           { emoji: '💰', title: 'Sale won',            line: 'has closed — sale won!' },
  sale_lost:          { emoji: '😞', title: 'Sale lost',           line: 'has been marked lost.' },
  cold:               { emoji: '🧊', title: 'Lead gone cold',      line: 'has had no activity for 7+ days.' },
  // Slice 8 placeholders — not wired yet:
  contacted:          { emoji: '📞', title: 'First contact made',  line: 'had their first contact logged.' },
  meeting:            { emoji: '📅', title: 'Meeting booked',      line: 'has a meeting booked.' },
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: 'bad_json' }, { status: 400, headers: cors }); }

  const leadId    = String(body?.lead_id   ?? '').trim();
  const milestone = String(body?.milestone ?? '').trim();
  const metadata  = body?.metadata ?? {};

  if (!leadId || !milestone) {
    return Response.json({ ok: false, error: 'lead_id and milestone are required' }, { status: 400, headers: cors });
  }
  if (!VALID_MILESTONES.has(milestone)) {
    return Response.json(
      { ok: false, error: `Unknown milestone '${milestone}'. Valid: ${[...VALID_MILESTONES].join(', ')}` },
      { status: 400, headers: cors },
    );
  }

  console.log('[notify-lead-milestone] START lead_id:', leadId, 'milestone:', milestone);

  // 2. Lead lookup.
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('id, business_name, contact_person, assigned_by')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    console.error('[notify-lead-milestone] lead lookup failed:', leadErr?.message ?? 'not found');
    return Response.json({ ok: false, error: leadErr?.message ?? 'lead not found' }, { status: 404, headers: cors });
  }

  // 3. No assigner — nothing to notify.
  if (!lead.assigned_by) {
    console.log('[notify-lead-milestone] skipped — lead has no assigner');
    return Response.json({ ok: true, skipped: true, reason: 'no_assigner' }, { headers: cors });
  }

  // 4. Idempotency check.
  const { data: fired } = await admin
    .from('lead_milestones_fired')
    .select('fired_at')
    .eq('lead_id', leadId)
    .eq('milestone', milestone)
    .maybeSingle();

  if (fired) {
    console.log('[notify-lead-milestone] skipped — already fired at:', fired.fired_at);
    await admin.from('audit_log').insert({
      actor_id:   null,
      action:     'lead_milestone_already_fired',
      table_name: 'leads',
      row_id:     leadId,
      after_data: { milestone, fired_at: fired.fired_at },
    });
    return Response.json({ ok: true, skipped: true, reason: 'already_fired', fired_at: fired.fired_at }, { headers: cors });
  }

  // 5. Assigner profile + email.
  const { data: assignerAuth, error: assignerAuthErr } = await admin.auth.admin.getUserById(lead.assigned_by);
  if (assignerAuthErr || !assignerAuth?.user) {
    console.error('[notify-lead-milestone] assigner auth lookup failed:', assignerAuthErr?.message ?? 'not found');
    return Response.json({ ok: false, error: 'assigner not found' }, { status: 404, headers: cors });
  }
  const assignerEmail = assignerAuth.user.email ?? '';

  const { data: assignerProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', lead.assigned_by)
    .maybeSingle();
  const assignerName = assignerProfile?.full_name ?? assignerEmail;

  console.log('[notify-lead-milestone] assigner:', assignerName, assignerEmail, '| milestone:', milestone);

  const copy      = MILESTONE_COPY[milestone];
  const leadUrl   = `${APP_URL}/owner/sales/leads?focus=${leadId}`;
  const notifType = `lead_milestone_${milestone}`;
  const channels: Record<string, unknown> = {};

  // 6a. Bell notification.
  const bell: Record<string, unknown> = {};
  try {
    const { data: inserted, error: bellErr } = await admin
      .from('client_notifications')
      .insert({
        recipient_user_id:   lead.assigned_by,
        notification_type:   notifType,
        title:               `${copy.emoji} ${copy.title}: ${lead.business_name ?? 'Lead'}`,
        body:                `${lead.business_name ?? 'Your lead'} ${copy.line}`,
        related_entity_type: 'lead',
        related_entity_id:   leadId,
        action_url:          leadUrl,
      })
      .select('id')
      .single();

    if (bellErr) throw bellErr;
    bell.ok = true;
    bell.id = inserted?.id;
    console.log('[notify-lead-milestone] bell inserted id:', bell.id);
  } catch (err: any) {
    bell.ok    = false;
    bell.error = err.message;
    console.error('[notify-lead-milestone] bell insert error:', err.message);
  }
  channels.bell = bell;

  // 6b. Email to assigner.
  const email: Record<string, unknown> = {};
  if (!assignerEmail) {
    email.ok      = false;
    email.skipped = true;
    email.reason  = 'assigner_has_no_email';
    console.warn('[notify-lead-milestone] skipping email — assigner has no email');
  } else {
    const subject   = `${copy.emoji} ${copy.title} — ${lead.business_name ?? 'Lead'}`;
    const amountNum = Number(metadata?.amount ?? 0);
    const amountStr = amountNum > 0
      ? `R${amountNum.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
      : null;

    const bodyHtml = `
<h1 style="margin:0 0 10px 0;font-size:24px;font-weight:bold;color:#0f172a;line-height:1.25;">
  ${copy.emoji} ${copy.title}
</h1>
<p style="margin:0 0 20px 0;font-size:16px;color:#475569;line-height:1.6;">
  Hi ${escapeHtmlBasic(assignerName)}, a lead you assigned has reached a new milestone.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="border:1px solid #eef1f6;border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 24px 0;">
  <tr>
    <td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:13px;color:#64748b;width:40%;">Lead</td>
    <td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtmlBasic(lead.business_name ?? '—')}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;${amountStr ? 'border-bottom:1px solid #eef1f6;' : ''}font-size:13px;color:#64748b;">Milestone</td>
    <td style="padding:10px 14px;${amountStr ? 'border-bottom:1px solid #eef1f6;' : ''}font-size:14px;color:#0f172a;font-weight:600;">${escapeHtmlBasic(copy.title)}</td>
  </tr>${amountStr ? `
  <tr>
    <td style="padding:10px 14px;font-size:13px;color:#64748b;">Amount</td>
    <td style="padding:10px 14px;font-size:14px;color:#10b981;font-weight:700;">${escapeHtmlBasic(amountStr)}</td>
  </tr>` : ''}
</table>
<a href="${leadUrl}" style="display:inline-block;background:linear-gradient(135deg,#e63946 0%,#ff2e97 100%);color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;text-decoration:none;">
  View lead →
</a>
<p style="font-size:14px;color:#64748b;margin:24px 0 0 0;">Need help? Email <a href="mailto:support@marketingio.co.za" style="color:#e63946;text-decoration:none;">support@marketingio.co.za</a>.</p>`;

    try {
      const res = await fetch(SEND_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ template: 'generic', to: assignerEmail, payload: { subject, bodyHtml } }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        email.ok    = false;
        email.error = json?.error ?? `HTTP ${res.status}`;
      } else {
        email.ok = true;
        email.id = json.id;
      }
      console.log('[notify-lead-milestone] email to', assignerEmail, ':', email.ok ? 'ok' : (email as any).error);
    } catch (err: any) {
      email.ok    = false;
      email.error = err.message;
      console.error('[notify-lead-milestone] email threw:', err.message);
    }
  }
  channels.email = email;

  // 7. Mark as fired (lifecycle idempotency).
  const { error: firedErr } = await admin
    .from('lead_milestones_fired')
    .insert({ lead_id: leadId, milestone });
  if (firedErr && firedErr.code !== '23505') {
    // 23505 = unique_violation (race — another concurrent call beat us). Fine.
    console.error('[notify-lead-milestone] lead_milestones_fired insert failed:', firedErr.message);
  }

  // 8. Audit log.
  const { error: auditErr } = await admin.from('audit_log').insert({
    actor_id:   null,
    action:     'lead_milestone_dispatched',
    table_name: 'leads',
    row_id:     leadId,
    after_data: { lead_id: leadId, milestone, assigner_id: lead.assigned_by, channels },
  });
  if (auditErr) console.error('[notify-lead-milestone] audit insert failed:', auditErr.message);

  console.log('[notify-lead-milestone] DONE lead_id:', leadId, 'milestone:', milestone);
  return Response.json({ ok: true, lead_id: leadId, milestone, channels }, { headers: cors });
});

function escapeHtmlBasic(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
