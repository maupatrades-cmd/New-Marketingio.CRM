// send-client-login-link — public (verify_jwt=false). Client enters their
// email on the login page; we look them up server-side and (if they're a
// provisioned client) generate a fresh Supabase magic link and email it
// via our branded template. Owner/staff emails are silently ignored from
// this surface — they use the password tab.
//
// POST { email, redirect_to? }
//   → { ok: true }   // constant-time response, no email enumeration
//
// `redirect_to` is validated against APP_URL — if it doesn't start with
// our APP_URL it's discarded and we fall back to `${APP_URL}/client`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const SEND_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-email`;
// APP_URL is the *only* source of truth for portal links (used by
// safeRedirect's open-redirect guard). If it's not set on this
// deployment we fail loud on the first request — silently falling back
// to a stale preview URL was how magic-link redirects started 404'ing.
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

function safeRedirect(input: unknown): string {
  const fallback = `${APP_URL}/client`;
  if (typeof input !== 'string' || !input) return fallback;
  let absolute: string;
  try {
    absolute = new URL(input, APP_URL).toString();
  } catch {
    return fallback;
  }
  // Open-redirect guard: must stay on APP_URL's origin.
  return absolute.startsWith(APP_URL + '/') || absolute === APP_URL
    ? absolute
    : fallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  if (!APP_URL) {
    console.error('[send-client-login-link] APP_URL env is not set');
    return Response.json({ ok: false, error: 'app_url_not_configured' }, { status: 503, headers: cors });
  }

  let body: any;
  try { body = await req.json(); } catch { return Response.json({ ok: true }, { headers: cors }); }
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return Response.json({ ok: true }, { headers: cors });
  }
  const redirectTo = safeRedirect(body?.redirect_to);

  // Only send a link if the email belongs to a provisioned client.
  // Owner/staff don't have a `clients` row, so this surface ignores
  // them silently — they use the password tab.
  const { data: client } = await admin
    .from('clients')
    .select('id, business_name, contact_person, client_user_id')
    .eq('email', email)
    .not('client_user_id', 'is', null)
    .maybeSingle();

  // Always return ok=true regardless — no enumeration.
  if (!client) {
    return Response.json({ ok: true }, { headers: cors });
  }

  try {
    const { data: linkData, error: linkErr } = await (admin as any).auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (linkErr) throw linkErr;
    const magicLink = linkData?.properties?.action_link ?? linkData?.action_link;
    if (!magicLink) throw new Error('no_action_link');

    const firstName = (client.contact_person?.split(' ')[0] ?? client.business_name) || 'friend';
    await fetch(SEND_EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        template: 'client_welcome_magic_link',
        to: email,
        payload: {
          businessName: client.business_name,
          firstName,
          magicLink,
          expiresInHours: 1,
        },
      }),
    });

    await admin.from('client_activity_log').insert({
      client_id: client.id,
      client_name: client.business_name,
      actor_id: null,
      actor_role: 'system',
      event_type: 'login_magic_link_sent',
      event_category: 'auth',
      event_summary: `Login magic link sent to ${email}`,
      event_metadata: { redirect_to: redirectTo },
    });
  } catch (_err) {
    // Don't leak failure to the caller.
  }

  return Response.json({ ok: true }, { headers: cors });
});
