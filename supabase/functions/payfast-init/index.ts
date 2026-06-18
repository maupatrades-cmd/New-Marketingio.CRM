// payfast-init — verify_jwt=false at the gateway, but the function still
// requires a user JWT in the Authorization header. We dropped the
// gateway-level check because its 401 response is CORS-less, which
// surfaces in the browser as a generic network failure. By handling
// auth inside the function we get to attach the proper CORS headers
// to every error response. Blueprint §10.
//
// POST { invoice_id }
//   → { ok, redirect_url, fields } | { ok:false, error }
//
// `fields` is the full signed form data; the frontend POSTs it to
// PayFast directly (see Invoice.jsx). The signature is generated
// SERVER-SIDE only — the client never sees the merchant key or
// passphrase.

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

function pfEncode(v: string): string {
  return encodeURIComponent(v).replace(/%20/g, '+').replace(/%[0-9a-f]{2}/g, m => m.toUpperCase());
}
function pfSignature(fields: Record<string, string>, passphrase?: string): string {
  const parts: string[] = [];
  for (const k of Object.keys(fields)) {
    const v = fields[k];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${k}=${pfEncode(String(v).trim())}`);
  }
  let payload = parts.join('&');
  if (passphrase && passphrase.length > 0) payload += `&passphrase=${pfEncode(passphrase)}`;
  return createHash('md5').update(payload).digest('hex');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  // The function (not the gateway) enforces auth so we can return
  // CORS-tagged error responses to the browser.
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

  // RLS-bind the caller's JWT for the invoice lookup. If the JWT is
  // expired or forged, PostgREST returns no row.
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

  const fields: Record<string, string> = {
    merchant_id:  PF_MERCHANT_ID,
    merchant_key: PF_MERCHANT_KEY,
    return_url:   `${APP_URL}/client/invoices/${invoice.id}?paid=1`,
    cancel_url:   `${APP_URL}/client/invoices/${invoice.id}?cancelled=1`,
    notify_url:   `${SUPABASE_URL}/functions/v1/payfast-itn`,
    name_first:   firstName,
    name_last:    lastName,
    email_address: client?.email ?? '',
    m_payment_id: invoice.id,
    amount:       Number(invoice.total_amount).toFixed(2),
    item_name:    `Invoice ${invoice.invoice_number ?? invoice.id.slice(0,8)}`,
  };
  fields.signature = pfSignature(fields, PF_PASSPHRASE);

  const host = PF_SANDBOX ? 'https://sandbox.payfast.co.za' : 'https://www.payfast.co.za';
  const redirectUrl = `${host}/eng/process`;

  return Response.json({ ok: true, redirect_url: redirectUrl, fields }, { headers: cors });
});
