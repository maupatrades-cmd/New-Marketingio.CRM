// payfast-init — verify_jwt=false at the gateway, but the function still
// requires a user JWT in the Authorization header. We dropped the
// gateway-level check because its 401 response is CORS-less, which
// surfaces in the browser as a generic network failure. By handling
// auth inside the function we get to attach the proper CORS headers
// to every error response. Blueprint §10.
//
// POST { invoice_id, _debug? }
//   → { ok, redirect_url, fields, _debug? } | { ok:false, error }
//
// `fields` is the full signed form data; the frontend POSTs it to
// PayFast directly (see Invoice.jsx). The signature is generated
// SERVER-SIDE only — the client never sees the merchant key or
// passphrase.
//
// Signature spec
//   https://developers.payfast.co.za/docs#step_2_create_md5_signature
//   PHP reference:
//     foreach($data as $key => $val) {
//       if ($val !== '') {
//         $payload .= "$key=" . urlencode(trim($val)) . "&";
//       }
//     }
//     $payload = rtrim($payload, '&');
//     if ($passPhrase !== '') $payload .= "&passphrase=" . urlencode(trim($passPhrase));
//     $signature = md5($payload);
//
// Three things had to be right for PayFast to accept us:
//   1) ORDER: the signature base is built from the *exact same key
//      sequence* as the form POST, with `signature` appended last.
//      We use explicit ordered tuples so this can't drift.
//   2) ENCODING: PHP urlencode() ≠ JS encodeURIComponent. PHP encodes
//      `!'()*~` to %21 %27 %28 %29 %2A %7E, JS leaves those alone.
//      pfEncode patches the gap before the &-join. Spaces become +,
//      hex stays UPPERCASE.
//   3) EMPTY VALUES: PHP skips empty values in the signature base.
//      We must ALSO skip them in the form POST — otherwise PayFast
//      computes signature over a different set than we did. We
//      filter once, up front, and build both signature and response
//      from the filtered set.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createHash } from 'node:crypto';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL      = 'https://new-marketingio-crm-git-claude-nice-bohr-rtmziz-thapelo-l.vercel.app';
const PF_MERCHANT_ID  = Deno.env.get('PAYFAST_MERCHANT_ID');
const PF_MERCHANT_KEY = Deno.env.get('PAYFAST_MERCHANT_KEY');
const PF_PASSPHRASE   = Deno.env.get('PAYFAST_PASSPHRASE');
const PF_SANDBOX      = (Deno.env.get('PAYFAST_SANDBOX') ?? 'true').toLowerCase() !== 'false';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

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

function pfSignature(
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt || jwt === ANON_KEY) {
    return Response.json({ ok:false, error:'no_auth' }, { status: 401, headers: cors });
  }

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ ok:false, error:'bad_json' }, { status: 400, headers: cors }); }
  const invoiceId = String(body?.invoice_id ?? '').trim();
  if (!invoiceId) return Response.json({ ok:false, error:'invoice_id_required' }, { status: 400, headers: cors });

  if (!PF_MERCHANT_ID || !PF_MERCHANT_KEY) {
    return Response.json({ ok:false, error:'payfast_not_configured' }, { status: 503, headers: cors });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { persistSession: false },
  });
  const { data: invoice, error: iErr } = await userClient
    .from('invoices')
    .select('id, invoice_number, total_amount, status, client_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (iErr) return Response.json({ ok:false, error: iErr.message }, { status: 500, headers: cors });
  if (!invoice) return Response.json({ ok:false, error:'not_found_or_forbidden' }, { status: 404, headers: cors });
  if (invoice.status === 'paid') return Response.json({ ok:false, error:'already_paid' }, { status: 409, headers: cors });

  const { data: client } = await admin.from('clients')
    .select('business_name, contact_person, email').eq('id', invoice.client_id).maybeSingle();
  const [firstName, ...rest] = (client?.contact_person ?? client?.business_name ?? 'Customer').split(' ');
  const lastName = rest.join(' ') || 'Customer';

  // Build in PayFast's documented attribute order. signature is appended
  // LAST, after we compute it from the rest.
  const orderedEntries: Array<[string, string]> = [
    ['merchant_id',   PF_MERCHANT_ID],
    ['merchant_key',  PF_MERCHANT_KEY],
    ['return_url',    `${APP_URL}/client/invoices/${invoice.id}?paid=1`],
    ['cancel_url',    `${APP_URL}/client/invoices/${invoice.id}?cancelled=1`],
    ['notify_url',    `${SUPABASE_URL}/functions/v1/payfast-itn`],
    ['name_first',    firstName],
    ['name_last',     lastName],
    ['email_address', client?.email ?? ''],
    ['m_payment_id',  invoice.id],
    ['amount',        Number(invoice.total_amount).toFixed(2)],
    ['item_name',     `Invoice ${invoice.invoice_number ?? invoice.id.slice(0,8)}`],
  ];

  // Filter empties ONCE — signature base and response use the same set.
  const nonEmpty = orderedEntries.filter(([, v]) => String(v ?? '').trim() !== '');

  const { signature, base } = pfSignature(nonEmpty, PF_PASSPHRASE);

  // Debug log — base string + signature + whether a passphrase was
  // included. Lets us compare byte-for-byte with what PayFast expects.
  // We deliberately do NOT log PF_PASSPHRASE — only whether it was set.
  console.log(JSON.stringify({
    payfast_debug: {
      invoice_id: invoice.id,
      sandbox: PF_SANDBOX,
      passphrase_present: !!(PF_PASSPHRASE && PF_PASSPHRASE.trim().length > 0),
      base_length: base.length,
      base,
      signature,
    },
  }));

  const responseFields: Record<string, string> = {};
  for (const [k, v] of nonEmpty) responseFields[k] = String(v).trim();
  responseFields.signature = signature;

  const host = PF_SANDBOX ? 'https://sandbox.payfast.co.za' : 'https://www.payfast.co.za';
  const redirectUrl = `${host}/eng/process`;

  // Caller may opt-in to a debug echo so we can verify the base string
  // off-band. Not surfaced for normal client traffic.
  const wantDebug = body?._debug === true;
  const payload: Record<string, unknown> = { ok: true, redirect_url: redirectUrl, fields: responseFields };
  if (wantDebug) {
    payload._debug = {
      base,
      signature,
      passphrase_present: !!(PF_PASSPHRASE && PF_PASSPHRASE.trim().length > 0),
      passphrase_length:  PF_PASSPHRASE ? PF_PASSPHRASE.trim().length : 0,
      sandbox: PF_SANDBOX,
    };
  }

  return Response.json(payload, { headers: cors });
});
