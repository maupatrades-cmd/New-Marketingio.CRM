// sign-contract — public (verify_jwt=false). The signing_token IS the
// auth: client types their name + checks the consent box, we verify the
// token, flip the contract to signed, and audit-log the event.
//
// POST { signing_token, signature_name, popia_consent }
//   → { ok, contract_id, signed_date } | { ok:false, error }
//
// Notes:
//   - We deliberately do NOT generate a signed PDF here yet (follow-up).
//     The signed_by_client flag + signed_date + a row in
//     client_activity_log are the artefact for now.
//   - Client-supplied IPs aren't trusted; we read x-forwarded-for from
//     the request headers and store that.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const SEND_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-email`;
const APP_URL       = Deno.env.get('APP_URL') ?? 'https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app';
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ ok:false, error:'bad_json' }, { status: 400, headers: cors }); }

  const token = String(body?.signing_token ?? '').trim();
  const signatureName = String(body?.signature_name ?? '').trim();
  const popiaConsent  = body?.popia_consent === true;

  if (!token || token.length < 16) return Response.json({ ok:false, error:'invalid_token' }, { status: 400, headers: cors });
  if (signatureName.length < 2)    return Response.json({ ok:false, error:'signature_required' }, { status: 400, headers: cors });
  if (!popiaConsent)               return Response.json({ ok:false, error:'consent_required' }, { status: 400, headers: cors });

  const { data: contract, error: cErr } = await admin
    .from('contracts')
    .select('id, client_id, deal_id, package, add_on_name, status, signing_status, signing_token_expires_at, signed_by_client, signed_date')
    .eq('signing_token', token)
    .maybeSingle();
  if (cErr) return Response.json({ ok:false, error: cErr.message }, { status: 500, headers: cors });
  if (!contract) return Response.json({ ok:false, error:'not_found' }, { status: 404, headers: cors });

  if (contract.signing_token_expires_at && new Date(contract.signing_token_expires_at) < new Date()) {
    return Response.json({ ok:false, error:'expired' }, { status: 410, headers: cors });
  }
  if (contract.signing_status === 'cancelled') {
    return Response.json({ ok:false, error:'cancelled' }, { status: 410, headers: cors });
  }
  if (contract.signed_by_client && contract.signed_date) {
    return Response.json({ ok: true, already_signed: true, contract_id: contract.id, signed_date: contract.signed_date }, { headers: cors });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('cf-connecting-ip')
    ?? null;
  const ua = req.headers.get('user-agent') ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const newStatus = contract.status === 'sent' || contract.status === 'draft' ? 'signed' : contract.status;

  const { error: uErr } = await admin
    .from('contracts')
    .update({
      signed_by_client: true,
      signed_date:      today,
      status:           newStatus,
      signing_status:   'signed',
      popia_signed:     true,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', contract.id);
  if (uErr) return Response.json({ ok:false, error: uErr.message }, { status: 500, headers: cors });

  const { data: clientRow } = await admin
    .from('clients').select('business_name, contact_person, email')
    .eq('id', contract.client_id).maybeSingle();

  await admin.from('client_activity_log').insert({
    client_id:    contract.client_id,
    client_name:  clientRow?.business_name ?? null,
    actor_id:     null,
    actor_role:   'client',
    event_type:   'contract_signed',
    event_category: 'document',
    event_summary: `Contract ${contract.id} signed by ${signatureName}`,
    event_metadata: { contract_id: contract.id, signature_name: signatureName, popia_consent: true },
    ip_address:   ip,
    user_agent:   ua,
  });

  try {
    if (clientRow?.email) {
      await fetch(SEND_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          template: 'contract_signed',
          to: clientRow.email,
          payload: {
            clientName:  clientRow.business_name,
            packageName: contract.package === 'add_on' ? (contract.add_on_name ?? 'Add-on') : (contract.package ?? 'Marketing iO'),
            portalUrl:   `${APP_URL}/client`,
          },
        }),
      });
    }
  } catch (_) { /* swallow — email is best-effort */ }

  return Response.json({ ok: true, contract_id: contract.id, signed_date: today }, { headers: cors });
});
