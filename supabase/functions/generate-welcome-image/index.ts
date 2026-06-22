// generate-welcome-image — hero image for client welcome email via Cloudflare Workers AI
// Secrets: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'welcome-images';
const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';

const INDUSTRY_SCENES: Record<string, string> = {
  retail:       'a vibrant busy local retail shop with happy customers browsing and buying',
  services:     'a friendly local service business delighting satisfied customers with a steady stream of bookings',
  construction: 'a confident construction crew on an active worksite with a project taking shape',
  hospitality:  'a warm full cafe or restaurant with happy diners enjoying great food',
  beauty:       'a stylish fully-booked beauty salon with happy clients in a bright welcoming space',
  health:       'a calm professional health and wellness practice with content clients',
  professional: 'a confident professional services team in a modern office advising trusted clients',
  education:    'a lively education space with engaged smiling learners and a passionate teacher',
  other:        'a thriving local small business buzzing with happy customers and growing demand',
};

const STYLES: string[] = [
  'flat vector illustration with bold simple shapes',
  'isometric 3D illustration with soft shadows',
  'glossy soft 3D render with gentle studio lighting',
  'warm bright photographic style with natural light',
  'bold duotone navy-and-red photographic style',
  'friendly energetic hand-drawn illustration',
  'cinematic photograph at golden hour with a hero spotlight feel',
  'soft warm watercolour illustration',
  'sleek modern vector with smooth gradient accents',
  'editorial magazine photographic style',
];

const BRAND_SUFFIX =
  ' Brand palette: deep navy blue and bright red with clean white space. ' +
  'Optimistic warm professional. No text, no words, no letters, no logos, no watermark.';

const SCENE_TAIL =
  ' The business is being discovered with nearby people noticing and five-star energy. The mood is proud and optimistic.';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildWelcomePrompt(client: { id?: string | null; industry?: string | null; business_name?: string | null }): string {
  const key = String(client?.industry || 'other').toLowerCase().trim();
  const scene = INDUSTRY_SCENES[key] || INDUSTRY_SCENES.other;
  const style = STYLES[hash(String(client?.id || client?.business_name || 'x')) % STYLES.length];
  return `A hero image of ${scene}.${SCENE_TAIL} Rendered as ${style}.${BRAND_SUFFIX}`;
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

  try {
    if (await objectExists(path)) {
      return Response.json({ ok: true, url: publicUrl(path), cached: true });
    }
  } catch (err) {
    console.warn('[generate-welcome-image] cache check failed', String(err));
  }

  const prompt = buildWelcomePrompt({ id: client_id, industry, business_name });
  try {
    const bytes = await generateImage(prompt);
    await uploadPng(path, bytes);
    return Response.json({ ok: true, url: publicUrl(path), cached: false, prompt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-welcome-image]', msg);
    const code = msg.startsWith('missing_key') ? 'missing_key' : 'generation_failed';
    return Response.json({ ok: false, error: msg, code }, { status: 502 });
  }
});
