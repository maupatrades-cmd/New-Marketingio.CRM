// Supabase Edge Function: generate-dream-hero
//
// AI-generates a motivational "dream" hero image for a staff member from
// their dream_type + dream_details, uploads it to the `dream-heroes`
// Storage bucket under {uid}/hero.png, writes the public URL onto
// profiles.dream_hero_image_url, and returns the URL.
//
// Brick I — the polish layer behind My Day motivation.
//
// POST JSON (optional overrides; falls back to stored profile values):
//   { dream_type?: string, dream_details?: string, dream_caption?: string }
//
// Response:
//   { ok: true, url: string, prompt: string }
//   { ok: false, error: string, code: string }
//
// Secret: GOOGLE_AI_STUDIO_API_KEYS — single key OR comma-separated pool.
// verify_jwt: true — the caller's identity is taken from the JWT, never
// from the body, so a user can only generate into their own folder.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const BUCKET = 'dream-heroes';
const MODEL  = 'gemini-2.5-flash-image-preview';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DREAM_SCENES: Record<string, string> = {
  property:  'a beautiful modern home with a warm, inviting exterior at golden hour — keys in hand, a proud new homeowner moment',
  vehicle:   'a gleaming, desirable new car parked on an open scenic road, freedom and achievement in the air',
  education: 'a proud graduation moment with cap and gown, books and a bright campus, a future full of possibility',
  travel:    'a breathtaking travel destination — turquoise water, mountains or a vibrant city skyline — the trip of a lifetime',
  business:  'a thriving, busy small business with a confident owner, growth and success radiating from the scene',
  family:    'a happy, secure family together in a warm home, provided for and content, surrounded by comfort',
  freedom:   'a serene scene of financial freedom and peace — open horizon, relaxed and unburdened, life on your own terms',
  other:     'an aspirational scene of a dream achieved — bright, hopeful, triumphant and personal',
};

const BRAND_SUFFIX =
  ' Cinematic, warm, optimistic and inspiring. High quality, balanced composition, ' +
  'rich natural light. Subtle accents of deep navy blue (#0a1f4d) and bright red (#e63946). ' +
  'No text, no words, no letters, no logos, no watermark.';

function buildDreamPrompt(dreamType?: string | null, dreamDetails?: string | null): string {
  const key = String(dreamType || 'other').toLowerCase().trim();
  const scene = DREAM_SCENES[key] || DREAM_SCENES.other;
  const detail = (dreamDetails && dreamDetails.trim())
    ? ` Personal touch to weave in: ${dreamDetails.trim().slice(0, 300)}.`
    : '';
  return `A cinematic motivational hero image of ${scene}.${detail}${BRAND_SUFFIX}`;
}

function pickKey(): string | null {
  // Accept both the plural pool name and the singular name.
  const raw = Deno.env.get('GOOGLE_AI_STUDIO_API_KEYS')
    || Deno.env.get('GOOGLE_AI_STUDIO_API_KEY')
    || '';
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`storage upload failed: ${res.status} ${text}`);
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function generateImage(prompt: string, apiKey: string): Promise<Uint8Array> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gemini ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const data = p?.inlineData?.data || p?.inline_data?.data;
    if (data) return base64ToBytes(data);
  }
  throw new Error('gemini response missing inlineData');
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

  // Prefer explicit body values; fall back to stored profile.
  let dreamType = body?.dream_type;
  let dreamDetails = body?.dream_details;
  if (!dreamType) {
    const stored = await getProfileDream(uid);
    dreamType = stored.dream_type;
    dreamDetails = dreamDetails ?? stored.dream_details;
  }

  const apiKey = pickKey();
  if (!apiKey) {
    return Response.json({ ok: false, error: 'GOOGLE_AI_STUDIO_API_KEY(S) not set', code: 'missing_key' }, { status: 500, headers: CORS });
  }

  const prompt = buildDreamPrompt(dreamType, dreamDetails);
  const path = `${uid}/hero.png`;

  try {
    const bytes = await generateImage(prompt, apiKey);
    await uploadPng(path, bytes);
    // Cache-bust so the freshly generated image replaces any cached copy.
    const url = `${publicUrl(path)}?v=${Date.now()}`;
    await saveHeroUrl(uid, url);
    return Response.json({ ok: true, url, prompt }, { headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-dream-hero]', msg);
    return Response.json({ ok: false, error: msg, code: 'generation_failed' }, { status: 502, headers: CORS });
  }
});
