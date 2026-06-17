// resolve-signing-token — public (verify_jwt=false). The signing_token IS
// the auth: without it, no contract is returned. Used by /sign/:token
// to render the contract preview before the client signs.
//
// POST { signing_token }
//   → { ok, contract, client, deal, package_meta } | { ok:false, error }
//
// Returns a SAFE subset (no internal IDs of the signer/admin, no notes).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
  if (!token || token.length < 16) {
    return Response.json({ ok:false, error:'invalid_token' }, { status: 400, headers: cors });
  }

  const { data: contract, error: cErr } = await admin
    .from('contracts')
    .select('id, client_id, deal_id, package, add_on_name, setup_fee, monthly_retainer, initial_term_months, debit_order_date, contract_start_date, contract_end_date, status, signing_status, signing_token_expires_at, signed_date, signed_by_client')
    .eq('signing_token', token)
    .maybeSingle();

  if (cErr) return Response.json({ ok:false, error: cErr.message }, { status: 500, headers: cors });
  if (!contract) return Response.json({ ok:false, error:'not_found' }, { status: 404, headers: cors });

  if (contract.signing_token_expires_at && new Date(contract.signing_token_expires_at) < new Date()) {
    return Response.json({ ok:false, error:'expired', expires_at: contract.signing_token_expires_at }, { status: 410, headers: cors });
  }
  if (contract.signing_status === 'cancelled') {
    return Response.json({ ok:false, error:'cancelled' }, { status: 410, headers: cors });
  }

  const [{ data: client }, { data: deal }] = await Promise.all([
    admin.from('clients').select('id, business_name, contact_person, email, address').eq('id', contract.client_id).maybeSingle(),
    admin.from('deals').select('id, package, add_on_name, setup_fee, monthly_retainer').eq('id', contract.deal_id).maybeSingle(),
  ]);

  const { data: settings } = await admin.from('system_settings')
    .select('value').eq('key','package_catalog').maybeSingle();
  const catalog = Array.isArray(settings?.value) ? settings!.value as any[] : [];
  const pkgCode = contract.package === 'add_on' ? null : contract.package;
  const package_meta = pkgCode ? catalog.find(p => p.code === pkgCode) ?? null : null;

  return Response.json({
    ok: true,
    already_signed: contract.signing_status === 'signed' || contract.signed_by_client === true,
    contract: {
      id: contract.id,
      package: contract.package,
      add_on_name: contract.add_on_name,
      setup_fee: contract.setup_fee,
      monthly_retainer: contract.monthly_retainer,
      initial_term_months: contract.initial_term_months,
      debit_order_date: contract.debit_order_date,
      contract_start_date: contract.contract_start_date,
      contract_end_date: contract.contract_end_date,
      status: contract.status,
      signing_status: contract.signing_status,
      signed_date: contract.signed_date,
    },
    client: client ? {
      business_name: client.business_name,
      contact_person: client.contact_person,
      email: client.email,
      address: client.address,
    } : null,
    deal: deal ?? null,
    package_meta,
  }, { headers: cors });
});
