// Supabase Edge Function: generate-welcome-image
//
// Generates the hero image for a client's welcome email via Google AI
// Studio (Gemini 2.5 Flash Image — preview model), uploads it to the
// `welcome-images` Storage bucket, and returns the public URL.
//
// Caches per client: if welcome/<client_id>.png already exists, returns
// the existing URL without re-generating (cheap + consistent).
//
// POST JSON:
//   { client_id: string, industry?: string, business_name?: string }
//
// Response:
//   { ok: true, url: string, cached: boolean, prompt?: string }
//   { ok: false, error: string, code: string }
//
// Secret: GOOGLE_AI_STUDIO_API_KEYS — single key, OR comma-separated
// pool. The function picks one per request (round-robin via random).
//
// Deploy:
//   supabase functions deploy generate-welcome-image --no-verify-jwt

import { buildWelcomePrompt } from '../_shared/welcomeImagePrompt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'welcome-images';
const MODEL  = 'gemini-2.5-flash-image-preview';

function pickKey(): string | null {
  const raw = Deno.env.get('GOOGLE_AI_STUDIO_API_KEY')
    || Deno.env.get('GOOGLE_AI_STUDIO_API_KEYS')
    || '';
  const keys = raw.split(',').map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}

function publicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function objectExists(path: string): Promise<boolean> {
  // Use the storage HEAD endpoint via service role; public URL HEAD also
  // works but goes through CDN with caching, so the auth path is more
  // reliable for the "did we just upload it" question.
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/info/${BUCKET}/${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  return res.ok;
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: 'Bad JSON', code: 'bad_json' }, { status: 400 }); }

  const { client_id, industry, business_name } = body ?? {};
  if (!client_id || typeof client_id !== 'string') {
    return Response.json({ ok: false, error: 'client_id required', code: 'missing_client_id' }, { status: 400 });
  }

  const path = `welcome/${client_id}.png`;

  // Cache check
  try {
    if (await objectExists(path)) {
      return Response.json({ ok: true, url: publicUrl(path), cached: true });
    }
  } catch (err) {
    // Don't fail on cache-check errors — fall through to generate.
    console.warn('[generate-welcome-image] cache check failed', String(err));
  }

  const apiKey = pickKey();
  if (!apiKey) {
    return Response.json({ ok: false, error: 'GOOGLE_AI_STUDIO_API_KEYS not set', code: 'missing_key' }, { status: 500 });
  }

  const prompt = buildWelcomePrompt({ id: client_id, industry, business_name });
  try {
    const bytes = await generateImage(prompt, apiKey);
    await uploadPng(path, bytes);
    return Response.json({ ok: true, url: publicUrl(path), cached: false, prompt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-welcome-image]', msg);
    return Response.json({ ok: false, error: msg, code: 'generation_failed' }, { status: 502 });
  }
});
