export function Mascot({ size = 180, waving = true }) {
  return (
    <div className={`relative ${waving ? 'animate-floaty' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 220 220" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#FFC83D" />
            <stop offset="50%"  stopColor="#FF3142" />
            <stop offset="100%" stopColor="#FF2E97" />
          </linearGradient>
          <linearGradient id="ringGrad" x1="0" x2="1">
            <stop offset="0%"   stopColor="#FF6A2C" />
            <stop offset="100%" stopColor="#FF2E97" />
          </linearGradient>
          <radialGradient id="cheek" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FF2E97" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#FF2E97" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* outer ring */}
        <circle cx="110" cy="110" r="98" fill="none" stroke="url(#ringGrad)" strokeWidth="2.5" opacity="0.7" />

        {/* body */}
        <ellipse cx="110" cy="128" rx="66" ry="72" fill="url(#bodyGrad)" />
        <ellipse cx="110" cy="128" rx="66" ry="72" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />

        {/* cheeks */}
        <circle cx="80"  cy="138" r="14" fill="url(#cheek)" />
        <circle cx="140" cy="138" r="14" fill="url(#cheek)" />

        {/* eyes */}
        <ellipse cx="88"  cy="108" rx="9"  ry="13" fill="#081530" />
        <ellipse cx="132" cy="108" rx="9"  ry="13" fill="#081530" />
        <ellipse cx="91"  cy="103" rx="3"  ry="3.5" fill="#FFFFFF" />
        <ellipse cx="135" cy="103" rx="3"  ry="3.5" fill="#FFFFFF" />

        {/* smile */}
        <path d="M88 142 Q110 160 132 142" stroke="#081530" strokeWidth="4" fill="none" strokeLinecap="round" />

        {/* waving arm */}
        <g
          className={waving ? 'animate-wave' : ''}
          style={{ transformOrigin: '170px 138px' }}
        >
          <rect x="162" y="86" width="16" height="64" rx="8" fill="url(#bodyGrad)" />
          <circle cx="170" cy="82" r="16" fill="url(#bodyGrad)" />
          <circle cx="170" cy="82" r="16" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}
