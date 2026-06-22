// generate-payment-image — celebratory hero image via Cloudflare Workers AI
// Secrets: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'payment-images';
const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';

type PackageKey = 'ignite' | 'accelerate' | 'dominate' | 'street_pulse' | 'township_pulse' | 'add_on';

const BRAND_DIRECTION =
  'Brand palette: deep navy, vivid red, clean white, warm gold-to-pink accent glow. ' +
  'Modern optimistic premium. Celebratory stepping-into-the-spotlight energy. ' +
  'Photo-real soft cinematic lighting, shallow depth of field. ' +
  'No text, no words, no letters, no logos.';

const PACKAGE_SCENE: Record<PackageKey, string> = {
  ignite:       'A small local South African business owner standing proudly in the doorway of their shop at golden hour, red and gold light rays spotlighting the storefront.',
  accelerate:   'A thriving township small business with a growing crowd of happy customers arriving, light beams sweeping the scene like a brand catching fire.',
  dominate:     'A confident South African entrepreneur under a dramatic spotlight with camera flashes in the background, commanding the market.',
  street_pulse: 'A vibrant South African street scene with a branded vehicle and fresh signage drawing smiling pedestrians toward a local shop.',
  township_pulse: 'A lively township marketplace where a local business has become the centre of friendly attention, neighbours gathering with community pride.',
  add_on:       'A South African small business owner delighted by a new tool clicking into place for their brand, a subtle upgrade glow.',
};

function buildPaymentImagePrompt(opts: { packageKey?: string | null; industry?: string | null }): string {
  const key = (opts.packageKey ?? 'ignite').toLowerCase() as PackageKey;
  const scene = PACKAGE_SCENE[key] ?? PACKAGE_SCENE.ignite;
  const industryLine = opts.industry ? ` The business is in the ${opts.industry} sector.` : '';
  return `${scene}${industryLine} ${BRAND_DIRECTION}`;
}

function publicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function objectExists(path: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/info/${BUCKET}/${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  return res.ok;
}

async function uploadPng(path: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'image/png',
      apikey: SERVICE_ROLE, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`storage upload failed: ${res.status} ${await res.text()}`);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function generateImage(prompt: string): Promise<Uint8Array> {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const apiKey    = Deno.env.get('CLOUDFLARE_API_KEY') || Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!accountId || !apiKey) throw new Error('missing_key: CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_KEY not set');

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, steps: 6 }),
  });
  if (!res.ok) throw new Error(`cloudflare ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const b64 = json?.result?.image;
  if (!b64) throw new Error('cloudflare response missing result.image');
  return base64ToBytes(b64);
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: 'Bad JSON', code: 'bad_json' }, { status: 400, headers: cors }); }

  const { invoice_id, package_key, industry } = body ?? {};
  if (!invoice_id || typeof invoice_id !== 'string') {
    return Response.json({ ok: false, error: 'invoice_id required', code: 'missing_invoice_id' }, { status: 400, headers: cors });
  }

  const path = `payment/${invoice_id}.png`;

  try {
    if (await objectExists(path)) {
      return Response.json({ ok: true, url: publicUrl(path), cached: true }, { headers: cors });
    }
  } catch (err) {
    console.warn('[generate-payment-image] cache check failed', String(err));
  }

  const prompt = buildPaymentImagePrompt({ packageKey: package_key ?? null, industry: industry ?? null });
  try {
    const bytes = await generateImage(prompt);
    await uploadPng(path, bytes);
    return Response.json({ ok: true, url: publicUrl(path), cached: false }, { headers: cors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-payment-image]', msg);
    const code = msg.startsWith('missing_key') ? 'missing_key' : 'generation_failed';
    return Response.json({ ok: false, error: msg, code }, { status: 502, headers: cors });
  }
});
