import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldCheck } from 'lucide-react';

/* ─────────── Photographic-style SVG tiles ────────────
 * Shipped with the bundle so the captcha works even when
 * outside CDNs (Unsplash, Picsum, etc.) reject hotlinks. */

const Tile = ({ children, bg = ['#fef3f2','#fed7d7'] }) => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full block">
    <defs>
      <linearGradient id={`g-${bg[0]}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={bg[0]} />
        <stop offset="100%" stopColor={bg[1]} />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#g-${bg[0]})`} />
    {children}
  </svg>
);

const Tiles = {
  cat: (
    <Tile bg={['#fff5f4','#fed7d7']}>
      <ellipse cx="50" cy="68" rx="32" ry="26" fill="#3a2f4a"/>
      <ellipse cx="50" cy="68" rx="28" ry="22" fill="#5d4e6e"/>
      <path d="M28 48 L24 30 L40 42 Z" fill="#3a2f4a"/>
      <path d="M72 48 L76 30 L60 42 Z" fill="#3a2f4a"/>
      <ellipse cx="50" cy="55" rx="20" ry="14" fill="#d9c5b8"/>
      <ellipse cx="42" cy="56" rx="3.5" ry="5" fill="#1a1a2e"/>
      <ellipse cx="58" cy="56" rx="3.5" ry="5" fill="#1a1a2e"/>
      <ellipse cx="43" cy="54" rx="1" ry="1.5" fill="#fff"/>
      <ellipse cx="59" cy="54" rx="1" ry="1.5" fill="#fff"/>
      <path d="M48 64 L50 66 L52 64 Z" fill="#e63946"/>
      <path d="M30 62 L42 64 M30 65 L42 65 M70 62 L58 64 M70 65 L58 65"
            stroke="#3a2f4a" strokeWidth="0.6" strokeLinecap="round"/>
    </Tile>
  ),
  dog: (
    <Tile bg={['#fef9e7','#f6d99c']}>
      <ellipse cx="50" cy="70" rx="32" ry="26" fill="#a0703a"/>
      <ellipse cx="50" cy="70" rx="28" ry="22" fill="#c89968"/>
      <ellipse cx="28" cy="58" rx="10" ry="16" fill="#7a5524" transform="rotate(-20 28 58)"/>
      <ellipse cx="72" cy="58" rx="10" ry="16" fill="#7a5524" transform="rotate(20 72 58)"/>
      <ellipse cx="50" cy="76" rx="14" ry="10" fill="#f0d4a8"/>
      <ellipse cx="42" cy="56" rx="3" ry="4" fill="#1a1a2e"/>
      <ellipse cx="58" cy="56" rx="3" ry="4" fill="#1a1a2e"/>
      <ellipse cx="43" cy="54" rx="1" ry="1.4" fill="#fff"/>
      <ellipse cx="59" cy="54" rx="1" ry="1.4" fill="#fff"/>
      <ellipse cx="50" cy="70" rx="3.5" ry="2.5" fill="#1a1a2e"/>
      <path d="M44 76 Q50 80 56 76" stroke="#1a1a2e" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </Tile>
  ),
  car: (
    <Tile bg={['#e0f2fe','#bae6fd']}>
      <rect x="0" y="68" width="100" height="32" fill="#475569"/>
      <path d="M10 60 L22 38 L78 38 L90 60 L90 78 L10 78 Z" fill="#e63946"/>
      <path d="M22 60 L30 42 L70 42 L78 60 Z" fill="#a8d8ff"/>
      <path d="M22 60 L30 42 L70 42 L78 60 L74 62 L26 62 Z" fill="#bfe1ff" opacity="0.5"/>
      <line x1="50" y1="42" x2="50" y2="60" stroke="#475569" strokeWidth="1"/>
      <circle cx="26" cy="78" r="9" fill="#1e293b"/>
      <circle cx="74" cy="78" r="9" fill="#1e293b"/>
      <circle cx="26" cy="78" r="4" fill="#94a3b8"/>
      <circle cx="74" cy="78" r="4" fill="#94a3b8"/>
      <rect x="14" y="62" width="4" height="3" fill="#fef08a"/>
      <rect x="82" y="62" width="4" height="3" fill="#fca5a5"/>
    </Tile>
  ),
  traffic: (
    <Tile bg={['#e0e7ff','#a5b4fc']}>
      <rect x="46" y="86" width="8" height="14" fill="#1e293b"/>
      <rect x="34" y="8" width="32" height="74" rx="6" fill="#1e293b"/>
      <rect x="36" y="10" width="28" height="70" rx="4" fill="#0f172a"/>
      <circle cx="50" cy="22" r="7" fill="#e63946"/>
      <circle cx="50" cy="22" r="3" fill="#fca5a5" opacity="0.8"/>
      <circle cx="50" cy="44" r="7" fill="#fbbf24"/>
      <circle cx="50" cy="44" r="3" fill="#fef3c7" opacity="0.8"/>
      <circle cx="50" cy="66" r="7" fill="#22c55e"/>
      <circle cx="50" cy="66" r="3" fill="#bbf7d0" opacity="0.8"/>
    </Tile>
  ),
  tree: (
    <Tile bg={['#dbeafe','#bfdbfe']}>
      <rect x="44" y="62" width="12" height="38" fill="#78350f"/>
      <rect x="44" y="62" width="6" height="38" fill="#92400e"/>
      <circle cx="50" cy="36" r="22" fill="#15803d"/>
      <circle cx="32" cy="44" r="16" fill="#166534"/>
      <circle cx="68" cy="44" r="16" fill="#166534"/>
      <circle cx="50" cy="54" r="18" fill="#16a34a"/>
      <circle cx="42" cy="32" r="6" fill="#22c55e" opacity="0.5"/>
      <circle cx="60" cy="36" r="5" fill="#22c55e" opacity="0.5"/>
    </Tile>
  ),
  house: (
    <Tile bg={['#fef9c3','#fde68a']}>
      <rect x="0" y="82" width="100" height="18" fill="#65a30d"/>
      <path d="M16 50 L50 18 L84 50 L84 56 L16 56 Z" fill="#e63946"/>
      <path d="M16 50 L50 18 L84 50 Z" fill="#dc2626" opacity="0.4"/>
      <rect x="22" y="50" width="56" height="38" fill="#fef3c7" stroke="#92400e" strokeWidth="1"/>
      <rect x="42" y="60" width="16" height="28" fill="#78350f"/>
      <circle cx="55" cy="74" r="1.4" fill="#fbbf24"/>
      <rect x="28" y="58" width="10" height="10" fill="#bae6fd" stroke="#92400e" strokeWidth="0.6"/>
      <rect x="62" y="58" width="10" height="10" fill="#bae6fd" stroke="#92400e" strokeWidth="0.6"/>
      <line x1="33" y1="58" x2="33" y2="68" stroke="#92400e" strokeWidth="0.5"/>
      <line x1="28" y1="63" x2="38" y2="63" stroke="#92400e" strokeWidth="0.5"/>
      <line x1="67" y1="58" x2="67" y2="68" stroke="#92400e" strokeWidth="0.5"/>
      <line x1="62" y1="63" x2="72" y2="63" stroke="#92400e" strokeWidth="0.5"/>
    </Tile>
  ),
  bike: (
    <Tile bg={['#fce7f3','#fbcfe8']}>
      <circle cx="22" cy="72" r="18" fill="none" stroke="#1e293b" strokeWidth="3"/>
      <circle cx="78" cy="72" r="18" fill="none" stroke="#1e293b" strokeWidth="3"/>
      <circle cx="22" cy="72" r="3" fill="#1e293b"/>
      <circle cx="78" cy="72" r="3" fill="#1e293b"/>
      <path d="M22 72 L42 44 L62 44 L78 72 L52 44 L42 44" stroke="#e63946" strokeWidth="3.5" fill="none" strokeLinejoin="round"/>
      <path d="M58 44 L66 26 L72 26" stroke="#1e293b" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <rect x="48" y="38" width="14" height="3" fill="#1e293b" rx="1"/>
      <g stroke="#1e293b" strokeWidth="0.8" fill="none">
        <line x1="22" y1="72" x2="38" y2="62"/>
        <line x1="22" y1="72" x2="38" y2="82"/>
        <line x1="22" y1="72" x2="8" y2="68"/>
        <line x1="22" y1="72" x2="8" y2="76"/>
        <line x1="78" y1="72" x2="62" y2="62"/>
        <line x1="78" y1="72" x2="62" y2="82"/>
      </g>
    </Tile>
  ),
  bus: (
    <Tile bg={['#fef9e7','#fef08a']}>
      <rect x="0" y="84" width="100" height="16" fill="#475569"/>
      <rect x="8" y="22" width="84" height="62" rx="4" fill="#fbbf24"/>
      <rect x="8" y="22" width="84" height="6" fill="#dc2626"/>
      <rect x="12" y="32" width="14" height="14" fill="#bae6fd"/>
      <rect x="28" y="32" width="14" height="14" fill="#bae6fd"/>
      <rect x="44" y="32" width="14" height="14" fill="#bae6fd"/>
      <rect x="60" y="32" width="14" height="14" fill="#bae6fd"/>
      <rect x="76" y="32" width="14" height="14" fill="#bae6fd"/>
      <rect x="12" y="52" width="78" height="6" fill="#dc2626"/>
      <rect x="12" y="62" width="20" height="20" fill="#0f172a"/>
      <circle cx="22" cy="84" r="6" fill="#1e293b"/>
      <circle cx="78" cy="84" r="6" fill="#1e293b"/>
    </Tile>
  ),
  motorcycle: (
    <Tile bg={['#fef2f2','#fecaca']}>
      <circle cx="22" cy="74" r="14" fill="#1e293b"/>
      <circle cx="78" cy="74" r="14" fill="#1e293b"/>
      <circle cx="22" cy="74" r="6" fill="#475569"/>
      <circle cx="78" cy="74" r="6" fill="#475569"/>
      <path d="M22 74 L40 54 L62 54 L78 74" stroke="#e63946" strokeWidth="6" fill="none" strokeLinejoin="round"/>
      <rect x="42" y="48" width="22" height="10" rx="3" fill="#1e293b"/>
      <path d="M60 54 L74 38 L80 38" stroke="#475569" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <rect x="30" y="58" width="20" height="6" fill="#fbbf24" rx="2"/>
    </Tile>
  ),
};

const ICONS = Object.keys(Tiles);

const CHALLENGES = [
  { label: 'cats',           keys: ['cat'] },
  { label: 'dogs',           keys: ['dog'] },
  { label: 'cars',           keys: ['car'] },
  { label: 'bicycles',       keys: ['bike'] },
  { label: 'buses',          keys: ['bus'] },
  { label: 'trees',          keys: ['tree'] },
  { label: 'houses',         keys: ['house'] },
  { label: 'traffic lights', keys: ['traffic'] },
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

function buildBoard(challenge) {
  const decoyKeys = ICONS.filter((k) => !challenge.keys.includes(k));
  const nTargets = 3 + Math.floor(Math.random() * 2);
  const tiles = [];
  for (let i = 0; i < nTargets; i++) {
    tiles.push({ key: challenge.keys[i % challenge.keys.length], target: true });
  }
  const decoysShuffled = shuffle(decoyKeys);
  for (let i = 0; i < 9 - nTargets; i++) {
    tiles.push({ key: decoysShuffled[i % decoysShuffled.length], target: false });
  }
  return shuffle(tiles).map((t, i) => ({ ...t, id: i }));
}

export default function ImageCaptcha({ onVerified, onCancel }) {
  const [round, setRound] = useState(0);
  const challenge = useMemo(
    () => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)],
    [round]
  );
  const board = useMemo(() => buildBoard(challenge), [challenge]);
  const [picked, setPicked] = useState(new Set());
  const [status, setStatus] = useState('idle');

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
              {Tiles[tile.key]}
              {isPicked && (
                <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brandred text-white shadow">
                  <Check size={12}/>
                </span>
              )}
            </button>
          );
        })}
      </div>

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
            <button type="button" onClick={onCancel}
                    className="text-sm text-navy-900/60 hover:text-navy-ink">Cancel</button>
          )}
          <button type="button" onClick={verify} disabled={status === 'ok'}
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
