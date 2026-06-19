// captcha-photos v14 — Pexels image-grid proxy + HMAC captcha challenge.
//
// Routes (all unauthenticated — verify_jwt=false):
//   GET  /?query=…&per_page=…  → Pexels photo grid (existing behaviour)
//   POST /issue                → issue a captcha challenge
//   POST /verify               → verify user's answer, return verify_token
//
// CAPTCHA_SIGNING_KEY must be set as a Supabase secret (32+ random bytes).
// PEXELS_API_KEY       must be set as a Supabase secret.

const PEXELS_KEY      = Deno.env.get('PEXEL_API_KEY')!;
const SIGNING_KEY_RAW = Deno.env.get('CAPTCHA_SIGNING_KEY') ?? '';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;   // 5 min
const VERIFY_TTL_MS    = 5 * 60 * 1000;   // 5 min

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

// ─── HMAC helpers ────────────────────────────────────────────────────────────

async function importKey(raw: string): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(raw);
  return crypto.subtle.importKey('raw', enc, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function hmacSign(key: CryptoKey, data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Pexels photo-pool proxy (GET) ───────────────────────────────────────────
// Expects: ?queries=cat,dog,car&per=4
// Returns: { ok: true, photos: { cat: [url, url, ...], dog: [...], ... } }

async function handleGrid(url: URL): Promise<Response> {
  if (!PEXELS_KEY) {
    return Response.json({ error: 'PEXELS_API_KEY not configured' }, { status: 503, headers: cors });
  }

  const queriesRaw = url.searchParams.get('queries') ?? '';
  const per        = Math.min(Math.max(Number(url.searchParams.get('per') ?? '4'), 1), 15);
  const queries    = queriesRaw.split(',').map(q => q.trim()).filter(Boolean);

  if (!queries.length) {
    return Response.json({ ok: false, error: 'missing_queries' }, { status: 400, headers: cors });
  }

  const results = await Promise.all(queries.map(async (q) => {
    const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${per}&orientation=square`;
    const res = await fetch(pexelsUrl, { headers: { Authorization: PEXELS_KEY } });
    if (!res.ok) throw new Error(`Pexels error ${res.status} for "${q}"`);
    const data = await res.json();
    const urls = (data.photos ?? []).map((p: any) => p.src?.medium as string).filter(Boolean);
    return [q, urls] as [string, string[]];
  }));

  const photos: Record<string, string[]> = Object.fromEntries(results);
  return Response.json({ ok: true, photos }, { headers: cors });
}

// ─── /issue — issue a captcha challenge ──────────────────────────────────────

async function handleIssue(): Promise<Response> {
  if (!PEXELS_KEY) {
    return Response.json({ error: 'PEXELS_API_KEY not configured' }, { status: 503, headers: cors });
  }
  if (!SIGNING_KEY_RAW) {
    return Response.json({ error: 'CAPTCHA_SIGNING_KEY not configured' }, { status: 503, headers: cors });
  }

  // Pick a random concrete noun to find + 3 distractors from different searches.
  const subjects = ['cat','dog','car','tree','bicycle','house','bird','flower','laptop','book'];
  const target   = subjects[Math.floor(Math.random() * subjects.length)];
  const others   = subjects.filter(s => s !== target).sort(() => Math.random() - 0.5).slice(0, 3);
  const queries  = [target, ...others].sort(() => Math.random() - 0.5);

  // Fetch one image per query in parallel.
  const results = await Promise.all(queries.map(async q => {
    const page = Math.floor(Math.random() * 3) + 1;
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=1&page=${page}&orientation=square`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    if (!r.ok) throw new Error(`Pexels error ${r.status} for ${q}`);
    const d = await r.json();
    const photo = d.photos?.[0];
    if (!photo) throw new Error(`No photos for ${q}`);
    return { label: q, url: photo.src.medium as string };
  }));

  const challengeId  = crypto.randomUUID();
  const expiresAt    = Date.now() + CHALLENGE_TTL_MS;
  const correctUrl   = results.find(r => r.label === target)!.url;
  const options      = results.map(r => r.url);

  const key = await importKey(SIGNING_KEY_RAW);
  // Payload: challengeId|target|correctUrl|expiresAt
  const sigPayload = `${challengeId}|${target}|${correctUrl}|${expiresAt}`;
  const challengeSig = await hmacSign(key, sigPayload);

  return Response.json({
    challenge_id:   challengeId,
    expected_label: target,
    options,
    expires_at:     expiresAt,
    challenge_sig:  challengeSig,
  }, { headers: cors });
}

// ─── /verify — verify the user's answer ──────────────────────────────────────

async function handleVerify(req: Request): Promise<Response> {
  if (!SIGNING_KEY_RAW) {
    return Response.json({ error: 'CAPTCHA_SIGNING_KEY not configured' }, { status: 503, headers: cors });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: 'bad_json' }, { status: 400, headers: cors }); }

  const { challenge_id, expected_label, options, expires_at, challenge_sig, picked_url } = body ?? {};

  if (!challenge_id || !expected_label || !Array.isArray(options) || !expires_at || !challenge_sig || !picked_url) {
    return Response.json({ ok: false, error: 'missing_fields' }, { status: 400, headers: cors });
  }

  if (Date.now() > Number(expires_at)) {
    return Response.json({ ok: false, error: 'challenge_expired' }, { status: 400, headers: cors });
  }

  const key = await importKey(SIGNING_KEY_RAW);

  // Find which url corresponds to the expected label — it was the only one
  // matching expected_label in the issue response. The sig encodes correctUrl.
  // We need to identify correctUrl: iterate options and check sig for each.
  let correctUrl: string | null = null;
  for (const url of options) {
    const candidate = `${challenge_id}|${expected_label}|${url}|${expires_at}`;
    const expected  = await hmacSign(key, candidate);
    if (expected === challenge_sig) {
      correctUrl = url;
      break;
    }
  }

  if (!correctUrl) {
    return Response.json({ ok: false, error: 'invalid_challenge_sig' }, { status: 400, headers: cors });
  }

  if (picked_url !== correctUrl) {
    return Response.json({ ok: false, error: 'wrong_answer' }, { status: 400, headers: cors });
  }

  // Issue a verify_token valid for VERIFY_TTL_MS.
  const verifyAt      = Date.now();
  const verifyExpires = verifyAt + VERIFY_TTL_MS;
  const verifyPayload = `${challenge_id}|${verifyAt}|${verifyExpires}`;
  const verifyToken   = await hmacSign(key, verifyPayload);

  return Response.json({
    ok: true,
    verify_token:  verifyToken,
    verify_ts:     verifyAt,
    verify_expires: verifyExpires,
    challenge_id,
  }, { headers: cors });
}

// ─── Router ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url      = new URL(req.url);
  const pathPart = url.pathname.split('/').pop() ?? '';

  if (req.method === 'POST' && pathPart === 'issue') return handleIssue();
  if (req.method === 'POST' && pathPart === 'verify') return handleVerify(req);
  if (req.method === 'GET') return handleGrid(url);

  return new Response('Not found', { status: 404, headers: cors });
});
