// post-sale-orchestrator — fires all 4 post-sale emails in sequence for a
// newly closed_won deal:
//   1) Client login provisioning + branded magic-link email
//   2) Onboarding invite + recap (discovery answers + outstanding list)
//   3) Contract for signature (uses contract.signing_token)
//   4) Setup invoice issued (uses the invoice created by close_sale)
//
// POST { deal_id }
//   → { ok: true, deal_id, results: [{ step, ok, ...detail }] }
//
// Each step is wrapped in try/catch — a failure is recorded against that
// step but never blocks the rest. Called from the deals AFTER INSERT
// trigger via pg_net (fire-and-forget).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const SEND_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-email`;
const APP_URL       = Deno.env.get('APP_URL') ?? 'https://app.marketingio.co.za';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

async function callSendEmail(template: string, to: string, payload: any): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch(SEND_EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ template, to, payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'Bad JSON' }, { status: 400, headers: cors }); }
  const { deal_id } = body ?? {};
  if (!deal_id) return Response.json({ ok: false, error: 'deal_id required' }, { status: 400, headers: cors });

  const { data: deal, error: dErr } = await admin
    .from('deals')
    .select('id, client_id, client_name, package, add_on_name, setup_fee, discovery, brand_notes')
    .eq('id', deal_id).maybeSingle();
  if (dErr || !deal) {
    return Response.json({ ok: false, error: dErr?.message ?? 'deal not found' }, { status: 404, headers: cors });
  }
  const { data: client } = await admin
    .from('clients')
    .select('id, business_name, contact_person, email, client_user_id, logo_url, whatsapp_number')
    .eq('id', deal.client_id).maybeSingle();
  if (!client) {
    return Response.json({ ok: false, error: 'client not found' }, { status: 404, headers: cors });
  }
  const email = client.email?.toLowerCase().trim();
  if (!email) {
    return Response.json({ ok: false, skipped: true, reason: 'no_client_email' }, { headers: cors });
  }

  const [{ data: contract }, { data: invoice }] = await Promise.all([
    admin.from('contracts').select('id, signing_token, package, add_on_name').eq('deal_id', deal_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('invoices').select('id, invoice_number, total_amount, due_date').eq('deal_id', deal_id).eq('invoice_type','setup_fee').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const businessName = client.business_name;
  const firstName = (client.contact_person?.split(' ')[0] ?? businessName) || 'friend';
  const results: any[] = [];

  // ─── STEP 1 — provision client + send magic link ───
  const stepProvision: any = { step: 'provision_client' };
  try {
    let userId = client.client_user_id;
    if (!userId) {
      const { data: list } = await (admin as any).auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = (list?.users ?? []).find((u: any) => (u.email ?? '').toLowerCase() === email);
      if (existing) userId = existing.id;
      else {
        const { data: created, error: cErr } = await (admin as any).auth.admin.createUser({
          email, email_confirm: true,
          user_metadata: { full_name: client.contact_person ?? businessName },
        });
        if (cErr) throw cErr;
        userId = created?.user?.id;
      }
      if (!userId) throw new Error('auth user creation returned no id');
      const { error: linkErr } = await admin.from('clients').update({
        client_user_id: userId,
        has_seen_welcome: false,
        client_user_provisioned_at: new Date().toISOString(),
      }).eq('id', client.id);
      if (linkErr) throw linkErr;
      stepProvision.created_or_linked = true;
    } else {
      stepProvision.already_provisioned = true;
    }

    const { data: linkData, error: linkGenErr } = await (admin as any).auth.admin.generateLink({
      type: 'magiclink', email,
      options: { redirectTo: `${APP_URL}/welcome` },
    });
    if (linkGenErr) throw linkGenErr;
    const magicLink = linkData?.properties?.action_link ?? linkData?.action_link;

    const send = await callSendEmail('client_welcome_magic_link', email, {
      businessName, firstName, magicLink, expiresInHours: 24,
    });
    stepProvision.email = send;
    stepProvision.ok = send.ok;
  } catch (err) {
    stepProvision.ok = false;
    stepProvision.error = (err as Error).message;
  }
  results.push(stepProvision);

  // ─── STEP 2 — onboarding invite + recap ───
  const stepRecap: any = { step: 'onboarding_invite_recap' };
  try {
    const d = deal.discovery ?? {};
    const outstanding: string[] = [];
    if (!client.logo_url) outstanding.push('Logo file');
    const { count: signedCount } = await admin.from('attachments').select('id', { count: 'exact', head: true }).eq('deal_id', deal_id).eq('type','signed_contract');
    if (!signedCount) outstanding.push('Signed contract upload');
    const { count: storeCount } = await admin.from('attachments').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('type','storefront');
    if (!storeCount) outstanding.push('Storefront / business photo');

    const send = await callSendEmail('onboarding_invite_recap', email, {
      businessName,
      profile: {
        businessDoes:   d.biz_does,
        idealCustomers: d.ideal_customer,
        goal:           d.goal,
        differentiator: d.differentiator,
        location:       d.location,
        howFound:       d.how_found,
        socials:        d.socials_existing,
        competitor:     d.competitor,
        busiest:        d.busy_times,
        priceRange:     d.price_range,
        whatsapp:       d.biz_whatsapp ?? client.whatsapp_number,
        avoid:          d.avoid,
        brandAssets:    d.brand_ready,
      },
      outstanding,
    });
    stepRecap.email = send;
    stepRecap.ok = send.ok;
  } catch (err) {
    stepRecap.ok = false;
    stepRecap.error = (err as Error).message;
  }
  results.push(stepRecap);

  // ─── STEP 3 — contract for signature ───
  const stepContract: any = { step: 'contract_for_signature' };
  try {
    if (!contract) throw new Error('no contract found for this deal');
    const signUrl = `${APP_URL}/sign/${contract.signing_token}`;
    const packageName = contract.package === 'add_on'
      ? (contract.add_on_name ?? 'Add-on')
      : (contract.package ?? deal.package ?? 'Marketing iO');
    const send = await callSendEmail('contract_for_signature', email, {
      clientName: businessName,
      packageName,
      signUrl,
    });
    await admin.from('contracts').update({
      signing_status: 'sent',
      last_signature_email_sent_at: new Date().toISOString(),
    }).eq('id', contract.id);
    stepContract.email = send;
    stepContract.ok = send.ok;
  } catch (err) {
    stepContract.ok = false;
    stepContract.error = (err as Error).message;
  }
  results.push(stepContract);

  // ─── STEP 4 — setup invoice issued ───
  const stepInvoice: any = { step: 'invoice_issued' };
  try {
    if (!invoice) {
      stepInvoice.ok = true;
      stepInvoice.skipped = true;
      stepInvoice.reason = 'no_setup_invoice (setup_fee was zero or omitted)';
    } else {
      const invoiceUrl = `${APP_URL}/client/invoices/${invoice.id}`;
      const send = await callSendEmail('invoice_issued', email, {
        clientName:   businessName,
        invoiceNumber: invoice.invoice_number,
        amountZar:    Number(invoice.total_amount),
        dueDateIso:   invoice.due_date,
        invoiceUrl,
      });
      stepInvoice.email = send;
      stepInvoice.ok = send.ok;
    }
  } catch (err) {
    stepInvoice.ok = false;
    stepInvoice.error = (err as Error).message;
  }
  results.push(stepInvoice);

  await admin.from('client_activity_log').insert({
    client_id: client.id,
    client_name: businessName,
    actor_id: null,
    actor_role: 'system',
    event_type: 'post_sale_emails_dispatched',
    event_category: 'communication',
    event_summary: `Post-sale orchestrator: ${results.filter(r => r.ok).length}/${results.length} ok`,
    event_metadata: { deal_id, results },
  });

  return Response.json({ ok: true, deal_id, client_email: email, results }, { headers: cors });
});
