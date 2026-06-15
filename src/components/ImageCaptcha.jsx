import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, Loader2 } from 'lucide-react';

/* ─────────── Real-photo library (Unsplash CDN, CC0) ─────────── */
const u = (id) => `https://images.unsplash.com/${id}?w=240&h=240&fit=crop&q=70&auto=format`;

const IMAGES = {
  cat: [
    u('photo-1514888286974-6c03e2ca1dba'),
    u('photo-1518791841217-8f162f1e1131'),
    u('photo-1561948955-570b270e7c36'),
    u('photo-1574158622682-e40e69881006'),
    u('photo-1495360010541-f48722b34f7d'),
  ],
  dog: [
    u('photo-1587300003388-59208cc962cb'),
    u('photo-1561037404-61cd46aa615b'),
    u('photo-1583511655857-d19b40a7a54e'),
    u('photo-1518717758536-85ae29035b6d'),
    u('photo-1546238232-20d3b1f8ed25'),
  ],
  car: [
    u('photo-1494976388531-d1058494cdd8'),
    u('photo-1503376780353-7e6692767b70'),
    u('photo-1552519507-da3b142c6e3d'),
    u('photo-1542362567-b07e54358753'),
    u('photo-1583121274602-3e2820c69888'),
  ],
  bicycle: [
    u('photo-1485965120184-e220f721d03e'),
    u('photo-1532298229144-0ec0c57515c7'),
    u('photo-1517649763962-0c623066013b'),
    u('photo-1502744688674-c619d1586c9e'),
  ],
  bus: [
    u('photo-1556122071-e404eaedb77f'),
    u('photo-1544620347-c4fd4a3d5957'),
    u('photo-1565609180520-c1ed2ba8c0d6'),
  ],
  tree: [
    u('photo-1441974231531-c6227db76b6e'),
    u('photo-1542273917363-3b1817f69a2d'),
    u('photo-1502082553048-f009c37129b9'),
    u('photo-1473445361085-b9a07f55608b'),
  ],
  house: [
    u('photo-1568605114967-8130f3a36994'),
    u('photo-1572120360610-d971b9d7767c'),
    u('photo-1518780664697-55e3ad937233'),
    u('photo-1605276374104-dee2a0ed3cd6'),
  ],
  traffic_light: [
    u('photo-1573548842355-73bb50e50323'),
    u('photo-1499951360447-b19be8fe80f5'),
    u('photo-1495395904533-9f1cc23cca81'),
  ],
  motorcycle: [
    u('photo-1568772585407-9361f9bf3a87'),
    u('photo-1558981852-426c6c22a060'),
    u('photo-1568708935081-bbbf8c43c10e'),
  ],
  boat: [
    u('photo-1542066021-4f9b1bbf91a0'),
    u('photo-1502136969935-8d8eef54d77b'),
  ],
};

const CHALLENGES = [
  { label: 'cats',           keys: ['cat'] },
  { label: 'dogs',           keys: ['dog'] },
  { label: 'cars',           keys: ['car'] },
  { label: 'bicycles',       keys: ['bicycle'] },
  { label: 'buses',          keys: ['bus'] },
  { label: 'trees',          keys: ['tree'] },
  { label: 'houses',         keys: ['house'] },
  { label: 'traffic lights', keys: ['traffic_light'] },
  { label: 'motorcycles',    keys: ['motorcycle'] },
  { label: 'animals',        keys: ['cat', 'dog'] },
  { label: 'vehicles',       keys: ['car', 'bus', 'motorcycle', 'bicycle'] },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildBoard(challenge) {
  // 3-4 target tiles + decoys; total 9.
  const decoyKeys = Object.keys(IMAGES).filter((k) => !challenge.keys.includes(k));
  const nTargets = 3 + Math.floor(Math.random() * 2); // 3 or 4
  const targetTiles = [];
  for (let i = 0; i < nTargets; i++) {
    const key = challenge.keys[i % challenge.keys.length];
    const pool = shuffle(IMAGES[key]);
    targetTiles.push({ key, src: pool[i % pool.length], target: true });
  }
  const decoyTiles = [];
  const decoysShuffled = shuffle(decoyKeys);
  for (let i = 0; i < 9 - nTargets; i++) {
    const key = decoysShuffled[i % decoysShuffled.length];
    const pool = shuffle(IMAGES[key]);
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
  const board = useMemo(() => buildBoard(challenge), [challenge]);
  const [picked, setPicked] = useState(new Set());
  const [status, setStatus] = useState('idle'); // 'idle' | 'wrong' | 'ok'

  useEffect(() => { setPicked(new Set()); setStatus('idle'); }, [round]);

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
    if (ok) {
      setStatus('ok');
      onVerified?.(true);
    } else {
      setStatus('wrong');
      onVerified?.(false);
    }
  }

  function newRound() {
    onVerified?.(false);
    setRound((r) => r + 1);
  }

  return (
    <div className="card-light w-full overflow-hidden">
      {/* header bar */}
      <div className="flex items-center justify-between gap-2 border-b border-navy-900/10 bg-navy-900 px-4 py-3 text-white">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
            Verify you're human
          </p>
          <p className="text-sm font-semibold">
            Select all images with <span className="text-brandred">{challenge.label}</span>
          </p>
        </div>
        <button
          type="button" onClick={newRound}
          className="rounded-md p-1.5 text-white/80 hover:bg-white/10"
          aria-label="New challenge"
        >
          <RefreshCw size={16}/>
        </button>
      </div>

      {/* image grid */}
      <div className="grid grid-cols-3 gap-1.5 bg-navy-900/5 p-2 sm:gap-2 sm:p-3">
        {board.map((tile) => {
          const isPicked = picked.has(tile.id);
          return (
            <button
              key={tile.id} type="button" onClick={() => toggle(tile.id)}
              className={`relative aspect-square overflow-hidden rounded-md border transition ${
                isPicked
                  ? 'border-brandred ring-2 ring-brandred/50'
                  : 'border-transparent hover:ring-2 hover:ring-navy-900/20'
              }`}
              aria-pressed={isPicked}
            >
              <img
                src={tile.src} alt=""
                loading="lazy" referrerPolicy="no-referrer"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
                onError={(e) => { e.currentTarget.style.background = '#0a1f4d'; }}
              />
              {isPicked && (
                <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brandred text-white shadow">
                  <Check size={12}/>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* footer / status */}
      <div className="flex items-center justify-between gap-2 border-t border-navy-900/10 px-4 py-3">
        {status === 'ok' ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
            <ShieldCheck size={16}/> Verified
          </p>
        ) : status === 'wrong' ? (
          <p className="text-sm text-brandred">Not quite — try again or hit refresh.</p>
        ) : (
          <p className="text-xs text-navy-900/60">Tap each matching image, then press Verify.</p>
        )}
        <div className="flex items-center gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-navy-900/60 hover:text-navy-ink">
              Cancel
            </button>
          )}
          <button
            type="button" onClick={verify} disabled={status === 'ok'}
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {status === 'ok' ? 'Verified' : 'Verify'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Optional lightweight overlay you can drop in pages to gate access. */
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

export function CaptchaSpinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-navy-900/70">
      <Loader2 size={16} className="animate-spin"/> Loading images…
    </div>
  );
}
