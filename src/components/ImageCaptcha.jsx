import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShieldCheck } from 'lucide-react';

/* ─────────── SVG tile icons ─────────── */
const Icons = {
  cat: (
    <g>
      <path d="M14 28 L8 14 L18 22 Z" fill="#0a1f4d"/>
      <path d="M50 28 L56 14 L46 22 Z" fill="#0a1f4d"/>
      <ellipse cx="32" cy="36" rx="22" ry="20" fill="#0a1f4d"/>
      <circle cx="24" cy="34" r="3" fill="#fff"/>
      <circle cx="40" cy="34" r="3" fill="#fff"/>
      <circle cx="24" cy="34" r="1.4" fill="#000"/>
      <circle cx="40" cy="34" r="1.4" fill="#000"/>
      <path d="M30 42 L34 42 L32 45 Z" fill="#e63946"/>
      <path d="M8 38 L22 39 M8 42 L22 41 M56 38 L42 39 M56 42 L42 41" stroke="#0a1f4d" strokeWidth="1.2" strokeLinecap="round"/>
    </g>
  ),
  dog: (
    <g>
      <path d="M12 18 Q8 10 16 12 L22 24 Z" fill="#8b4513"/>
      <path d="M52 18 Q56 10 48 12 L42 24 Z" fill="#8b4513"/>
      <ellipse cx="32" cy="34" rx="22" ry="20" fill="#a0522d"/>
      <ellipse cx="32" cy="44" rx="10" ry="8" fill="#deb887"/>
      <circle cx="25" cy="32" r="3" fill="#fff"/>
      <circle cx="39" cy="32" r="3" fill="#fff"/>
      <circle cx="25" cy="32" r="1.5" fill="#000"/>
      <circle cx="39" cy="32" r="1.5" fill="#000"/>
      <ellipse cx="32" cy="42" rx="3" ry="2" fill="#000"/>
    </g>
  ),
  car: (
    <g>
      <path d="M6 38 L12 26 L52 26 L58 38 L58 46 L6 46 Z" fill="#e63946"/>
      <path d="M14 28 L20 22 L44 22 L50 28 L50 36 L14 36 Z" fill="#a8d8ff"/>
      <line x1="32" y1="22" x2="32" y2="36" stroke="#0a1f4d" strokeWidth="1.5"/>
      <circle cx="16" cy="48" r="6" fill="#0a1f4d"/>
      <circle cx="48" cy="48" r="6" fill="#0a1f4d"/>
      <circle cx="16" cy="48" r="2.5" fill="#888"/>
      <circle cx="48" cy="48" r="2.5" fill="#888"/>
    </g>
  ),
  traffic: (
    <g>
      <rect x="22" y="6" width="20" height="42" rx="3" fill="#0a1f4d"/>
      <rect x="28" y="46" width="8" height="14" fill="#0a1f4d"/>
      <circle cx="32" cy="14" r="5" fill="#e63946"/>
      <circle cx="32" cy="27" r="5" fill="#fbbf24"/>
      <circle cx="32" cy="40" r="5" fill="#22c55e"/>
    </g>
  ),
  tree: (
    <g>
      <rect x="28" y="40" width="8" height="20" fill="#6b3410"/>
      <circle cx="32" cy="22" r="14" fill="#22c55e"/>
      <circle cx="20" cy="28" r="10" fill="#16a34a"/>
      <circle cx="44" cy="28" r="10" fill="#16a34a"/>
      <circle cx="32" cy="34" r="11" fill="#15803d"/>
    </g>
  ),
  house: (
    <g>
      <path d="M8 30 L32 8 L56 30 Z" fill="#e63946"/>
      <rect x="14" y="30" width="36" height="26" fill="#fff5f4" stroke="#0a1f4d" strokeWidth="1.5"/>
      <rect x="28" y="40" width="8" height="16" fill="#0a1f4d"/>
      <rect x="18" y="36" width="6" height="6" fill="#a8d8ff" stroke="#0a1f4d"/>
      <rect x="40" y="36" width="6" height="6" fill="#a8d8ff" stroke="#0a1f4d"/>
    </g>
  ),
  bike: (
    <g>
      <circle cx="14" cy="44" r="12" fill="none" stroke="#0a1f4d" strokeWidth="2.5"/>
      <circle cx="50" cy="44" r="12" fill="none" stroke="#0a1f4d" strokeWidth="2.5"/>
      <path d="M14 44 L24 26 L40 26 L50 44 L34 26 L24 26" stroke="#e63946" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      <path d="M38 26 L42 18 L46 18" stroke="#0a1f4d" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <circle cx="32" cy="44" r="2" fill="#0a1f4d"/>
    </g>
  ),
  bus: (
    <g>
      <rect x="6" y="14" width="52" height="34" rx="4" fill="#fbbf24"/>
      <rect x="10" y="18" width="10" height="10" fill="#a8d8ff"/>
      <rect x="22" y="18" width="10" height="10" fill="#a8d8ff"/>
      <rect x="34" y="18" width="10" height="10" fill="#a8d8ff"/>
      <rect x="46" y="18" width="8" height="10" fill="#a8d8ff"/>
      <rect x="10" y="32" width="44" height="6" fill="#e63946"/>
      <circle cx="16" cy="50" r="5" fill="#0a1f4d"/>
      <circle cx="48" cy="50" r="5" fill="#0a1f4d"/>
    </g>
  ),
  hydrant: (
    <g>
      <rect x="22" y="16" width="20" height="36" rx="4" fill="#e63946"/>
      <rect x="18" y="22" width="4" height="8" fill="#e63946"/>
      <rect x="42" y="22" width="4" height="8" fill="#e63946"/>
      <circle cx="32" cy="14" r="6" fill="#e63946"/>
      <rect x="22" y="12" width="20" height="4" fill="#fbbf24"/>
      <rect x="14" y="52" width="36" height="4" fill="#0a1f4d"/>
    </g>
  ),
};

/* ─────────── challenge catalogue ─────────── */
const CHALLENGES = [
  { key: 'cat',     label: 'cats',           targets: ['cat'] },
  { key: 'dog',     label: 'dogs',           targets: ['dog'] },
  { key: 'tree',    label: 'trees',          targets: ['tree'] },
  { key: 'car',     label: 'cars',           targets: ['car'] },
  { key: 'traffic', label: 'traffic lights', targets: ['traffic'] },
  { key: 'house',   label: 'houses',         targets: ['house'] },
  { key: 'animal',  label: 'animals',        targets: ['cat', 'dog'] },
  { key: 'vehicle', label: 'vehicles',       targets: ['car', 'bus', 'bike'] },
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
  // 3 to 4 target tiles + decoys; total 9.
  const allKeys = Object.keys(Icons);
  const decoys = allKeys.filter((k) => !challenge.targets.includes(k));
  const nTargets = Math.min(4, Math.max(3, challenge.targets.length + 2));
  const pool = [];
  for (let i = 0; i < nTargets; i++) {
    pool.push(challenge.targets[i % challenge.targets.length]);
  }
  const decoyPool = shuffle(decoys).slice(0, 9 - nTargets);
  return shuffle(pool.concat(decoyPool)).map((k, i) => ({ id: i, key: k }));
}

export default function ImageCaptcha({ onVerified }) {
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
    const correctIds = new Set(board.filter((t) => challenge.targets.includes(t.key)).map((t) => t.id));
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
    <div className="rounded-xl border border-navy-900/15 bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-navy-900/60">
            Verify you're human
          </p>
          <p className="text-sm font-semibold text-navy-ink">
            Select all images with <span className="text-brandred">{challenge.label}</span>
          </p>
        </div>
        <button
          type="button" onClick={newRound}
          className="rounded-md p-1.5 text-navy-900/60 hover:bg-navy-900/5"
          aria-label="New challenge"
        >
          <RefreshCw size={16}/>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {board.map((tile) => {
          const isPicked = picked.has(tile.id);
          return (
            <button
              key={tile.id} type="button" onClick={() => toggle(tile.id)}
              className={`relative aspect-square overflow-hidden rounded-lg border transition ${
                isPicked
                  ? 'border-brandred ring-2 ring-brandred/40'
                  : 'border-navy-900/15 hover:border-navy-900/35'
              }`}
              aria-pressed={isPicked}
            >
              <svg viewBox="0 0 64 64" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
                <rect width="64" height="64" fill="#fff5f4"/>
                {Icons[tile.key]}
              </svg>
              {isPicked && (
                <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brandred text-white">
                  <Check size={12}/>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {status === 'ok' ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
            <ShieldCheck size={16}/> Verified
          </p>
        ) : status === 'wrong' ? (
          <p className="text-sm text-brandred">Not quite — try again or hit refresh.</p>
        ) : (
          <p className="text-xs text-navy-900/60">Tap each matching image, then press Verify.</p>
        )}
        <button
          type="button" onClick={verify} disabled={status === 'ok'}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {status === 'ok' ? 'Verified' : 'Verify'}
        </button>
      </div>
    </div>
  );
}
