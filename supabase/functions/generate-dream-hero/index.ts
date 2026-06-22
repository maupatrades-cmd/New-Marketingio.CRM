// generate-dream-hero — AI hero image via Cloudflare Workers AI (Flux-1-schnell)
// Secrets: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const BUCKET = 'dream-heroes';
const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DREAM_SCENES: Record<string, string> = {
  property:  'a beautiful modern home with a warm inviting exterior at golden hour, keys in hand, a proud new homeowner moment',
  vehicle:   'a gleaming desirable new car parked on an open scenic road, freedom and achievement in the air',
  education: 'a proud graduation moment with cap and gown, books and a bright campus, a future full of possibility',
  travel:    'a breathtaking travel destination, turquoise water, mountains or a vibrant city skyline, the trip of a lifetime',
  business:  'a thriving busy small business with a confident owner, growth and success radiating from the scene',
  family:    'a happy secure family together in a warm home, provided for and content, surrounded by comfort',
  freedom:   'a serene scene of financial freedom and peace, open horizon, relaxed and unburdened, life on your own terms',
  other:     'an aspirational scene of a dream achieved, bright hopeful triumphant and personal',
};

const BRAND_SUFFIX =
  ' Cinematic, warm, optimistic and inspiring. High quality balanced composition, ' +
  'rich natural light. Subtle accents of deep navy blue and bright red. ' +
  'No text, no words, no letters, no logos, no watermark.';

function buildDreamPrompt(dreamType?: string | null, dreamDetails?: string | null): string {
  const key = String(dreamType || 'other').toLowerCase().trim();
  const scene = DREAM_SCENES[key] || DREAM_SCENES.other;
  const detail = (dreamDetails && dreamDetails.trim())
    ? ` Personal touch: ${dreamDetails.trim().slice(0, 300)}.`
    : '';
  return `A cinematic motivational hero image of ${scene}.${detail}${BRAND_SUFFIX}`;
}

function publicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function uploadPng(path: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
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

async function getUserId(authHeader: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ?? null;
}

async function getProfileDream(uid: string): Promise<{ dream_type?: string; dream_details?: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}&select=dream_type,dream_details`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE } },
  );
  if (!res.ok) return {};
  const rows = await res.json();
  return rows?.[0] ?? {};
}

async function saveHeroUrl(uid: string, url: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ dream_hero_image_url: url }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const authHeader = req.headers.get('Authorization') || '';
  const uid = await getUserId(authHeader);
  if (!uid) {
    return Response.json({ ok: false, error: 'Unauthorized', code: 'no_auth' }, { status: 401, headers: CORS });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* body optional */ }

  let dreamType = body?.dream_type;
  let dreamDetails = body?.dream_details;
  if (!dreamType) {
    const stored = await getProfileDream(uid);
    dreamType = stored.dream_type;
    dreamDetails = dreamDetails ?? stored.dream_details;
  }

  const prompt = buildDreamPrompt(dreamType, dreamDetails);
  const path = `${uid}/hero.png`;

  try {
    const bytes = await generateImage(prompt);
    await uploadPng(path, bytes);
    const url = `${publicUrl(path)}?v=${Date.now()}`;
    await saveHeroUrl(uid, url);
    return Response.json({ ok: true, url, prompt }, { headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-dream-hero]', msg);
    const code = msg.startsWith('missing_key') ? 'missing_key' : 'generation_failed';
    return Response.json({ ok: false, error: msg, code }, { status: 502, headers: CORS });
  }
});
