// generate-payment-image — celebratory hero image for the
// payment_success email. Calls Google AI Studio (Gemini 2.5 Flash Image),
// caches the result to payment-images/payment/<invoice_id>.png in a
// public bucket so duplicate ITNs don't re-generate.
//
// POST JSON:
//   { invoice_id, package_key?, business_name?, industry? }
//
// Response:
//   { ok: true, url, cached?: boolean }
//   { ok: false, error, code }
//
// Secret: GOOGLE_AI_STUDIO_API_KEYS — single key or comma-separated pool.
// Mirrors the established generate-welcome-image pattern.

import { buildPaymentImagePrompt } from '../_shared/paymentSuccess.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'payment-images';
const MODEL  = 'gemini-2.0-flash-exp';

function pickKey(): string | null {
  const raw = Deno.env.get('GEMINI_API_KEY')
    || Deno.env.get('GOOGLE_AI_STUDIO_API_KEY')
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

  const { invoice_id, package_key, business_name, industry } = body ?? {};
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

  const apiKey = pickKey();
  if (!apiKey) {
    return Response.json({ ok: false, error: 'GOOGLE_AI_STUDIO_API_KEYS not set', code: 'missing_key' }, { status: 500, headers: cors });
  }

  const prompt = buildPaymentImagePrompt({
    packageKey: package_key ?? null,
    businessName: business_name ?? null,
    industry: industry ?? null,
  });
  try {
    const bytes = await generateImage(prompt, apiKey);
    await uploadPng(path, bytes);
    return Response.json({ ok: true, url: publicUrl(path), cached: false }, { headers: cors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-payment-image]', msg);
    return Response.json({ ok: false, error: msg, code: 'generation_failed' }, { status: 502, headers: cors });
  }
});
