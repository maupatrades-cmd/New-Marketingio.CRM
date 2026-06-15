export function Mascot({ size = 160, waving = true }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id="bodyGrad" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#00ffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ff00aa" stopOpacity="0.8" />
          </radialGradient>
          <linearGradient id="ring" x1="0" x2="1">
            <stop offset="0%" stopColor="#00ffff" />
            <stop offset="100%" stopColor="#ff00aa" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="86" fill="none" stroke="url(#ring)" strokeWidth="2" opacity="0.6" />
        <ellipse cx="100" cy="118" rx="62" ry="68" fill="url(#bodyGrad)" />
        <ellipse cx="80"  cy="98" rx="9"  ry="13" fill="#0a0118" />
        <ellipse cx="120" cy="98" rx="9"  ry="13" fill="#0a0118" />
        <ellipse cx="83"  cy="93" rx="2.5" ry="3" fill="#fff" />
        <ellipse cx="123" cy="93" rx="2.5" ry="3" fill="#fff" />
        <path d="M82 130 Q100 144 118 130" stroke="#0a0118" strokeWidth="4" fill="none" strokeLinecap="round" />
        <g
          className={waving ? 'origin-bottom animate-wave' : ''}
          style={{ transformOrigin: '160px 130px' }}
        >
          <rect x="150" y="80" width="14" height="60" rx="7" fill="url(#bodyGrad)" />
          <circle cx="157" cy="78" r="14" fill="url(#bodyGrad)" />
        </g>
      </svg>
    </div>
  );
}
