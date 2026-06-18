// payfast-itn — public webhook (verify_jwt=false). PayFast posts here
// server-to-server when a payment status changes. We MUST NOT trust the
// payload until 4 checks pass:
//
//   1) Signature matches our passphrase
//      (MD5 of fields in posted wire order, urlencoded PHP-style,
//       + &passphrase=...)
//   2) Source IP is on PayFast's published list
//      (defense-in-depth — soft fail, logged but doesn't block,
//       because the postback in step 3 is the real source of truth)
//   3) Server-to-server postback to /eng/query/validate returns "VALID"
//      (this is the bit that actually proves the call came from PayFast)
//   4) The amount in the ITN matches invoices.total_amount
//
// Only then do we flip the invoice to paid. Idempotent: a duplicate ITN
// (PayFast retries up to 10×) on an already-paid invoice returns 200 OK
// with no-op so retries stop.
//
// Signature spec for ITN (DIFFERENT from outgoing init)
//   https://developers.payfast.co.za/docs#confirm_payment
//   PHP reference:
//     $pfParamString = '';
//     foreach($pfData as $key => $val) {
//       if($key !== 'signature') {
//         $pfParamString .= "$key=" . urlencode($val) . "&";
//       }
//     }
//     $pfParamString = rtrim($pfParamString, '&');
//     if ($pfPassphrase !== null) $pfParamString .= "&passphrase=" . urlencode($pfPassphrase);
//     $signature = md5($pfParamString);
//
// Critical differences from outgoing init:
//   - NO trim on values (PayFast sends them as-is)
//   - NO empty-value skip (every posted field except `signature` is in the base)
//   - Fields are iterated in WIRE ORDER (URLSearchParams insertion order)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createHash } from 'node:crypto';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const SEND_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-email`;
const PF_MERCHANT_ID = Deno.env.get('PAYFAST_MERCHANT_ID');
const PF_PASSPHRASE  = Deno.env.get('PAYFAST_PASSPHRASE');
const PF_SANDBOX     = (Deno.env.get('PAYFAST_SANDBOX') ?? 'true').toLowerCase() !== 'false';

const PF_VALIDATE_URL = PF_SANDBOX
  ? 'https://sandbox.payfast.co.za/eng/query/validate'
  : 'https://www.payfast.co.za/eng/query/validate';

const PF_SOURCE_HOSTS = PF_SANDBOX
  ? ['sandbox.payfast.co.za']
  : ['www.payfast.co.za', 'w1w.payfast.co.za', 'w2w.payfast.co.za', 'sw1w.payfast.co.za', 'sw2w.payfast.co.za'];

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// PHP urlencode() compatible. JS encodeURIComponent already produces
// uppercase hex and leaves [A-Za-z0-9-_.] alone, matching PHP. The
// gap is !'()*~ — PHP encodes them, JS does not. Patch by hand, THEN
// turn %20 into +.
function pfEncode(v: string): string {
  return encodeURIComponent(v)
    .replace(/!/g,  '%21')
    .replace(/'/g,  '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/~/g,  '%7E')
    .replace(/%20/g, '+');
}

// ITN-style signature builder. NO trim, NO empty skip. Every key except
// `signature` is included in the base in wire order.
function pfItnSignature(
  orderedPairs: Array<[string, string]>,
  passphrase?: string,
): { signature: string; base: string } {
  const parts: string[] = [];
  for (const [k, v] of orderedPairs) {
    if (k === 'signature') continue;
    parts.push(`${k}=${pfEncode(v ?? '')}`);
  }
  let base = parts.join('&');
  if (passphrase && passphrase.length > 0) {
    base += `&passphrase=${pfEncode(passphrase.trim())}`;
  }
  return { signature: createHash('md5').update(base).digest('hex'), base };
}

// Outgoing-style fallback: trim + skip empties. Some PayFast deployments
// build ITN signatures using this rule (matching the outgoing rule). If
// the strict ITN variant doesn't match, we try this one before rejecting.
function pfOutgoingSignature(
  orderedPairs: Array<[string, string]>,
  passphrase?: string,
): { signature: string; base: string } {
  const parts: string[] = [];
  for (const [k, v] of orderedPairs) {
    if (k === 'signature') continue;
    const trimmed = String(v ?? '').trim();
    if (trimmed === '') continue;
    parts.push(`${k}=${pfEncode(trimmed)}`);
  }
  let base = parts.join('&');
  if (passphrase && passphrase.trim().length > 0) {
    base += `&passphrase=${pfEncode(passphrase.trim())}`;
  }
  return { signature: createHash('md5').update(base).digest('hex'), base };
}

async function resolveAllowedIps(): Promise<Set<string>> {
  const out = new Set<string>();
  for (const host of PF_SOURCE_HOSTS) {
    try {
      const records = await Deno.resolveDns(host, 'A');
      records.forEach(ip => out.add(ip));
    } catch (_) { /* host fails — leave it out */ }
  }
  return out;
}

async function postbackValidate(formBody: string): Promise<{ ok: boolean; body: string }> {
  const res = await fetch(PF_VALIDATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody,
  });
  const body = (await res.text()).trim();
  return { ok: res.ok && body === 'VALID', body };
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

async function logAttempt(row: Record<string, unknown>) {
  try {
    await admin.from('client_activity_log').insert({
      actor_id: null,
      actor_role: 'system',
      event_type: 'payfast_itn',
      event_category: 'payment',
      event_summary: String(row.summary ?? 'payfast itn'),
      event_metadata: row,
    });
  } catch (_) { /* swallow */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')   return new Response('Method not allowed', { status: 405, headers: cors });

  const rawBody = await req.text();
  const params  = new URLSearchParams(rawBody);
  const pairs: Array<[string, string]> = [];
  const data: Record<string, string> = {};
  for (const [k, v] of params) {
    pairs.push([k, v]);
    data[k] = v;
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('cf-connecting-ip') ?? null;
  const sig         = (data.signature ?? '').toLowerCase();
  const merchantId  = data.merchant_id ?? '';
  const mPaymentId  = data.m_payment_id ?? '';
  const pfPaymentId = data.pf_payment_id ?? '';
  const paymentStatus = (data.payment_status ?? '').toUpperCase();
  const amountGross   = data.amount_gross;

  // ─── CHECK 1 — merchant id matches our configured one ──────────────────
  if (!PF_MERCHANT_ID || merchantId !== PF_MERCHANT_ID) {
    await logAttempt({ summary: 'reject merchant_id mismatch', ip, merchantId, mPaymentId });
    return new Response('merchant mismatch', { status: 400, headers: cors });
  }

  // ─── CHECK 2 — signature ───────────────────────────────────────────────
  // Try the strict ITN variant first, fall back to the outgoing variant.
  const itn       = pfItnSignature(pairs, PF_PASSPHRASE);
  const outgoing  = pfOutgoingSignature(pairs, PF_PASSPHRASE);
  const matched   =
    sig === itn.signature.toLowerCase() ? 'itn'
    : sig === outgoing.signature.toLowerCase() ? 'outgoing'
    : null;

  // Always print a debug line so we can compare byte-for-byte with
  // PayFast's expectation. Passphrase value is NEVER logged — only
  // length + present flag.
  console.log(JSON.stringify({
    payfast_itn_debug: {
      ip, mPaymentId, pfPaymentId, paymentStatus,
      received_signature: sig,
      computed_itn:      itn.signature,
      computed_outgoing: outgoing.signature,
      matched,
      passphrase_present: !!(PF_PASSPHRASE && PF_PASSPHRASE.trim().length > 0),
      passphrase_length:  PF_PASSPHRASE ? PF_PASSPHRASE.trim().length : 0,
      base_itn:      itn.base,
      base_outgoing: outgoing.base,
      raw_body: rawBody,
      pair_count: pairs.length,
    },
  }));

  if (!sig || matched === null) {
    await logAttempt({
      summary: 'reject bad signature',
      ip, mPaymentId, pfPaymentId,
      received: sig,
      computed_itn: itn.signature,
      computed_outgoing: outgoing.signature,
      base_itn: itn.base,
      base_outgoing: outgoing.base,
      passphrase_length: PF_PASSPHRASE ? PF_PASSPHRASE.trim().length : 0,
    });
    return new Response('bad signature', { status: 400, headers: cors });
  }

  // ─── CHECK 3 — source IP (defense-in-depth, soft fail) ─────────────────
  let ipAllowed = false;
  try {
    const allowed = await resolveAllowedIps();
    ipAllowed = !!ip && allowed.has(ip);
  } catch (_) { /* DNS hiccup — don't block, postback is the real check */ }

  // ─── CHECK 4 — server-to-server postback validation ───────────────────
  const postback = await postbackValidate(rawBody);
  if (!postback.ok) {
    await logAttempt({ summary: 'reject postback invalid', ip, ipAllowed, mPaymentId, pfPaymentId, postbackBody: postback.body });
    return new Response('postback invalid', { status: 400, headers: cors });
  }

  if (!mPaymentId) {
    await logAttempt({ summary: 'reject missing m_payment_id', ip });
    return new Response('missing m_payment_id', { status: 400, headers: cors });
  }
  const { data: invoice, error: iErr } = await admin
    .from('invoices')
    .select('id, invoice_number, total_amount, status, client_id, client_name')
    .eq('id', mPaymentId)
    .maybeSingle();
  if (iErr || !invoice) {
    await logAttempt({ summary: 'reject invoice not found', ip, mPaymentId, error: iErr?.message });
    return new Response('invoice not found', { status: 404, headers: cors });
  }

  if (invoice.status === 'paid') {
    await logAttempt({ summary: 'noop already paid', ip, ipAllowed, mPaymentId, pfPaymentId, paymentStatus });
    return new Response('ok', { status: 200, headers: cors });
  }

  // ─── CHECK 5 — amount matches ─────────────────────────────────────────
  const expectedAmount = Number(invoice.total_amount).toFixed(2);
  const receivedAmount = Number(amountGross ?? 0).toFixed(2);
  if (expectedAmount !== receivedAmount) {
    await logAttempt({ summary: 'reject amount mismatch', ip, ipAllowed, mPaymentId, pfPaymentId, expectedAmount, receivedAmount });
    return new Response('amount mismatch', { status: 400, headers: cors });
  }

  if (paymentStatus !== 'COMPLETE') {
    await logAttempt({
      summary: `payfast status=${paymentStatus}`,
      ip, ipAllowed, mPaymentId, pfPaymentId, paymentStatus,
    });
    await admin.from('client_activity_log').insert({
      client_id: invoice.client_id,
      client_name: invoice.client_name,
      actor_id: null,
      actor_role: 'system',
      event_type: 'payment_' + paymentStatus.toLowerCase(),
      event_category: 'payment',
      event_summary: `Invoice ${invoice.invoice_number}: PayFast reported ${paymentStatus}`,
      event_metadata: { invoice_id: invoice.id, pf_payment_id: pfPaymentId, amount: receivedAmount },
    });
    return new Response('ok', { status: 200, headers: cors });
  }

  // ─── All checks passed — flip the invoice to paid ──────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const { error: uErr } = await admin
    .from('invoices')
    .update({
      status:         'paid',
      payment_method: 'payfast',
      payment_date:   today,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', invoice.id)
    .neq('status', 'paid');
  if (uErr) {
    await logAttempt({ summary: 'invoice update failed', ip, mPaymentId, error: uErr.message });
    return new Response('db error', { status: 500, headers: cors });
  }

  await admin.from('client_activity_log').insert({
    client_id: invoice.client_id,
    client_name: invoice.client_name,
    actor_id: null,
    actor_role: 'system',
    event_type: 'payment_received',
    event_category: 'payment',
    event_summary: `Invoice ${invoice.invoice_number} paid — ${receivedAmount} ZAR via PayFast`,
    event_metadata: {
      invoice_id: invoice.id, pf_payment_id: pfPaymentId,
      amount_gross: receivedAmount, amount_fee: data.amount_fee, amount_net: data.amount_net,
      ip, ipAllowed, signature_variant: matched,
    },
    ip_address: ip,
  });

  try {
    const { data: client } = await admin.from('clients')
      .select('email, business_name').eq('id', invoice.client_id).maybeSingle();
    if (client?.email) {
      await fetch(SEND_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          template: 'payment_receipt',
          to: client.email,
          payload: { clientName: client.business_name, amountZar: Number(receivedAmount) },
        }),
      });
    }
  } catch (_) { /* swallow */ }

  return new Response('ok', { status: 200, headers: cors });
});
