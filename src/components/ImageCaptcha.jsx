import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

/* ─────────── Categories ─────────── */
const CATEGORIES = ['cat', 'dog', 'car', 'bike', 'bus', 'tree', 'house', 'traffic light', 'motorcycle'];

const CHALLENGES = [
  { label: 'cats',           keys: ['cat'] },
  { label: 'dogs',           keys: ['dog'] },
  { label: 'cars',           keys: ['car'] },
  { label: 'bicycles',       keys: ['bike'] },
  { label: 'buses',          keys: ['bus'] },
  { label: 'trees',          keys: ['tree'] },
  { label: 'houses',         keys: ['house'] },
  { label: 'traffic lights', keys: ['traffic light'] },
  { label: 'motorcycles',    keys: ['motorcycle'] },
  { label: 'animals',        keys: ['cat', 'dog'] },
  { label: 'vehicles',       keys: ['car', 'bus', 'motorcycle', 'bike'] },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fetch a pool of photos for a list of categories from our Pexels proxy. */
async function fetchPhotoPools(queries) {
  const params = new URLSearchParams({ queries: queries.join(','), per: '4' });
  const { data, error } = await supabase.functions.invoke('captcha-photos', {
    method: 'GET',
    headers: {},
    // supabase-js doesn't take query strings directly — fall back to fetch
  }).catch(() => ({ error: 'unsupported' }));

  // Fallback: direct fetch (supabase.functions.invoke can't do GET with query)
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/captcha-photos?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) throw new Error(`captcha-photos HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.ok) throw new Error(json?.error || 'captcha-photos failed');
  return json.photos ?? {};
}

function buildBoard(challenge, pools) {
  const decoyKeys = CATEGORIES.filter((k) => !challenge.keys.includes(k));
  const nTargets = 3 + Math.floor(Math.random() * 2); // 3 or 4

  const targetTiles = [];
  for (let i = 0; i < nTargets; i++) {
    const key = challenge.keys[i % challenge.keys.length];
    const pool = shuffle(pools[key] ?? []);
    if (!pool.length) continue;
    targetTiles.push({ key, src: pool[i % pool.length], target: true });
  }

  const decoyTiles = [];
  for (const key of shuffle(decoyKeys)) {
    if (decoyTiles.length >= 9 - targetTiles.length) break;
    const pool = shuffle(pools[key] ?? []);
    if (!pool.length) continue;
    decoyTiles.push({ key, src: pool[0], target: false });
  }

  return shuffle(targetTiles.concat(decoyTiles)).map((t, i) => ({ ...t, id: i }));
}

export default function ImageCaptcha({ onVerified, onCancel }) {
  const [round, setRound] = useState(0);
  const challenge = useMemo(
    () => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)],
    [round]
  );

  const [pools, setPools] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [status, setStatus] = useState('idle'); // 'idle' | 'wrong' | 'ok'

  useEffect(() => {
    let cancelled = false;
    setPools(null); setLoadError(null); setPicked(new Set()); setStatus('idle');
    const wanted = [...new Set([...challenge.keys, ...shuffle(CATEGORIES.filter(k => !challenge.keys.includes(k))).slice(0, 5)])];
    fetchPhotoPools(wanted)
      .then(p => { if (!cancelled) setPools(p); })
      .catch(err => { if (!cancelled) setLoadError(String(err?.message ?? err)); });
    return () => { cancelled = true; };
  }, [challenge]);

  const board = useMemo(() => (pools ? buildBoard(challenge, pools) : []), [pools, challenge]);

  function toggle(id) {
    if (status === 'ok') return;
    setStatus('idle');
    setPicked((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function verify() {
    const correctIds = new Set(board.filter((t) => t.target).map((t) => t.id));
    const ok = picked.size === correctIds.size && [...picked].every((id) => correctIds.has(id));
    if (ok) { setStatus('ok'); onVerified?.(true); }
    else    { setStatus('wrong'); onVerified?.(false); }
  }

  function newRound() {
    onVerified?.(false);
    setRound((r) => r + 1);
  }

  return (
    <div className="card-light w-full overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-navy-900/10 bg-navy-900 px-4 py-3 text-white">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">Verify you're human</p>
          <p className="text-sm font-semibold">
            Select all images with <span className="text-brandred">{challenge.label}</span>
          </p>
        </div>
        <button type="button" onClick={newRound}
                className="rounded-md p-1.5 text-white/80 hover:bg-white/10" aria-label="New challenge">
          <RefreshCw size={16}/>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 bg-navy-900/5 p-2 sm:gap-2 sm:p-3 min-h-[260px]">
        {loadError ? (
          <div className="col-span-3 flex flex-col items-center justify-center gap-2 p-6 text-sm text-brandred">
            <p>Couldn't load images: {loadError}</p>
            <button type="button" onClick={newRound} className="btn-navy text-xs">Retry</button>
          </div>
        ) : !pools ? (
          <div className="col-span-3 flex items-center justify-center gap-2 p-6 text-sm text-navy-900/60">
            <Loader2 size={16} className="animate-spin"/> Loading photos…
          </div>
        ) : (
          board.map((tile) => {
            const isPicked = picked.has(tile.id);
            return (
              <button
                key={tile.id} type="button" onClick={() => toggle(tile.id)}
                className={`relative aspect-square overflow-hidden rounded-md border bg-navy-900/20 transition ${
                  isPicked
                    ? 'border-brandred ring-2 ring-brandred/50'
                    : 'border-transparent hover:ring-2 hover:ring-navy-900/20'
                }`}
                aria-pressed={isPicked}
              >
                <img
                  src={tile.src} alt=""
                  loading="lazy" referrerPolicy="no-referrer" draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {isPicked && (
                  <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brandred text-white shadow">
                    <Check size={12}/>
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-navy-900/10 px-4 py-3">
        {status === 'ok' ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
            <ShieldCheck size={16}/> Verified
          </p>
        ) : status === 'wrong' ? (
          <p className="text-sm text-brandred">Not quite — try again or hit refresh.</p>
        ) : (
          <p className="text-xs text-navy-900/60">Tap each matching photo, then press Verify.</p>
        )}
        <div className="flex items-center gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel}
                    className="text-sm text-navy-900/60 hover:text-navy-ink">Cancel</button>
          )}
          <button type="button" onClick={verify} disabled={status === 'ok' || !pools}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {status === 'ok' ? 'Verified' : 'Verify'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImageCaptchaOverlay({ open, onPass, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md">
        <ImageCaptcha onVerified={(ok) => ok && onPass?.()} onCancel={onCancel}/>
      </div>
    </div>
  );
}
