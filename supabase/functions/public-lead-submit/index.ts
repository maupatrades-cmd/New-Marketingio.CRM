// public-lead-submit — unauthenticated (verify_jwt=false).
//
// Called by the public /refer/:token page after the captcha is solved.
//
// POST { token, verify_token, verify_ts, verify_expires, challenge_id, payload }
//
// payload: {
//   business_name, contact_person, phone, email, address?, industry?,
//   interest_package?, keenness?, best_time?, preferred_channel?,
//   qualification_answers?, referrer_name, referrer_contact,
//   popia_consent: true
// }
//
// Validations (in order — fail-fast):
//   1. verify_token HMAC check (challenge_id, verify_ts, verify_expires).
//   2. verify_token not expired.
//   3. lead_link_tokens row is live (exists, revoked_at IS NULL).
//   4. Required payload fields present.
//   5. POPIA consent given.
//   6. Do-not-contact pre-check (mirror of the trigger; the trigger is the
//      hard guarantee but we surface a friendly error here rather than a
//      raw 42501 from the DB).
//
// On success: INSERT leads row + bump lead_link_tokens.uses.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNING_KEY_RAW = Deno.env.get('CAPTCHA_SIGNING_KEY') ?? '';

const VERIFY_TTL_MS = 5 * 60 * 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function importKey(raw: string): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(raw);
  return crypto.subtle.importKey('raw', enc, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function hmacSign(key: CryptoKey, data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  if (!SIGNING_KEY_RAW) {
    return Response.json({ ok: false, error: 'CAPTCHA_SIGNING_KEY not configured' }, { status: 503, headers: cors });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: 'bad_json' }, { status: 400, headers: cors }); }

  const {
    token,
    verify_token,
    verify_ts,
    verify_expires,
    challenge_id,
    payload,
  } = body ?? {};

  // ── 1. HMAC check ────────────────────────────────────────────────────────
  if (!verify_token || !verify_ts || !verify_expires || !challenge_id) {
    return Response.json({ ok: false, error: 'missing_captcha_fields' }, { status: 400, headers: cors });
  }

  const key = await importKey(SIGNING_KEY_RAW);
  const expectedToken = await hmacSign(key, `${challenge_id}|${verify_ts}|${verify_expires}`);
  if (verify_token !== expectedToken) {
    return Response.json({ ok: false, error: 'invalid_verify_token' }, { status: 400, headers: cors });
  }

  // ── 2. Expiry check ──────────────────────────────────────────────────────
  if (Date.now() > Number(verify_expires)) {
    return Response.json({ ok: false, error: 'verify_token_expired' }, { status: 400, headers: cors });
  }

  // ── 3. Token validity ────────────────────────────────────────────────────
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return Response.json({ ok: false, error: 'token_required' }, { status: 400, headers: cors });
  }

  const { data: tokenRow, error: tokenErr } = await admin
    .from('lead_link_tokens')
    .select('token, label, created_by, revoked_at')
    .eq('token', token.trim())
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return Response.json({ ok: false, error: 'token_not_found' }, { status: 404, headers: cors });
  }
  if (tokenRow.revoked_at) {
    return Response.json({ ok: false, error: 'token_revoked' }, { status: 403, headers: cors });
  }

  // ── 4. Required payload fields ───────────────────────────────────────────
  const p = payload ?? {};
  const businessName   = typeof p.business_name   === 'string' ? p.business_name.trim()   : '';
  const contactPerson  = typeof p.contact_person  === 'string' ? p.contact_person.trim()  : '';
  const phone          = typeof p.phone           === 'string' ? p.phone.trim()           : '';
  const referrerName   = typeof p.referrer_name   === 'string' ? p.referrer_name.trim()   : '';
  const referrerContact = typeof p.referrer_contact === 'string' ? p.referrer_contact.trim() : '';

  if (!businessName) {
    return Response.json({ ok: false, error: 'business_name required' }, { status: 400, headers: cors });
  }
  if (!phone && !p.email) {
    return Response.json({ ok: false, error: 'phone or email required' }, { status: 400, headers: cors });
  }
  if (!referrerName) {
    return Response.json({ ok: false, error: 'referrer_name required' }, { status: 400, headers: cors });
  }

  // ── 5. POPIA consent ─────────────────────────────────────────────────────
  if (!p.popia_consent) {
    return Response.json({ ok: false, error: 'popia_consent required' }, { status: 400, headers: cors });
  }

  // ── 6. Do-not-contact pre-check ──────────────────────────────────────────
  const dncConditions = [];
  if (phone) dncConditions.push(`phone.eq.${phone}`);
  if (p.email) dncConditions.push(`email.eq.${String(p.email).toLowerCase()}`);

  if (dncConditions.length > 0) {
    const { data: dncRows } = await admin
      .from('leads')
      .select('id')
      .eq('do_not_contact', true)
      .or(dncConditions.join(','))
      .limit(1);

    if (dncRows && dncRows.length > 0) {
      return Response.json({
        ok: false,
        error: 'do_not_contact_violation',
        message: 'This contact has opted out of being contacted.',
      }, { status: 422, headers: cors });
    }
  }

  // ── INSERT lead ───────────────────────────────────────────────────────────
  const { data: lead, error: insErr } = await admin
    .from('leads')
    .insert({
      business_name:         businessName,
      contact_person:        contactPerson || null,
      phone:                 phone || null,
      email:                 p.email ? String(p.email).trim() : null,
      address:               p.address ? String(p.address).trim() : null,
      industry:              p.industry ? String(p.industry).trim() : null,
      source:                'external_marketer',
      captured_via:          'public_link',
      status:                'pending_verification',
      submitted_by:          null,
      submitted_by_name:     referrerName,
      interest_package:      p.interest_package ?? null,
      keenness:              p.keenness ?? null,
      best_time:             p.best_time ?? null,
      preferred_channel:     p.preferred_channel ?? null,
      qualification_answers: p.qualification_answers ?? null,
      referrer_name:         referrerName,
      referrer_contact:      referrerContact || null,
    })
    .select('id')
    .single();

  if (insErr) {
    const msg = insErr.message ?? '';
    if (msg.includes('do_not_contact_violation')) {
      return Response.json({
        ok: false,
        error: 'do_not_contact_violation',
        message: 'This contact has opted out of being contacted.',
      }, { status: 422, headers: cors });
    }
    return Response.json({ ok: false, error: msg }, { status: 500, headers: cors });
  }

  // ── Bump uses ─────────────────────────────────────────────────────────────
  try {
    await admin.rpc('increment_lead_link_uses', { p_token: token.trim() });
  } catch (_) {
    // Non-fatal: uses counter is informational only.
    // Use a raw update as fallback since the RPC may not exist yet.
    await admin
      .from('lead_link_tokens')
      .update({ uses: (tokenRow as any).uses + 1 })
      .eq('token', token.trim())
      .catch(() => {});
  }

  return Response.json({ ok: true, lead_id: lead!.id }, { headers: cors });
});
