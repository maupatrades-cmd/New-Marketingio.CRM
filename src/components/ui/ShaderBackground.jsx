// src/components/ui/ShaderBackground.jsx
// Marketing iO Motherboard — converted from Thapelo's HTML design
// White base, navy traces, red circuit paths with animated pellets + mascot runners

export default function ShaderBackground() {
  return (
    <div className="board" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
      <style>{`
        @keyframes pelletShimmer { to { stroke-dashoffset: -64; } }
        @keyframes glowPulse { 0%, 100% { opacity: .25; } 50% { opacity: .7; } }
        .pellets { animation: pelletShimmer 6s linear infinite; }
        .glow { animation: glowPulse 5s ease-in-out infinite; }
      `}</style>

      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Marketing iO circuit board background"
      >
        <defs>
          {/* Repeating trace pattern — navy lines + junction dots + chip rectangles */}
          <pattern id="traces" width="240" height="240" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="#14274E" strokeWidth="2" opacity="0.09" strokeLinecap="round">
              <path d="M0 40 H90 L130 80 V150" />
              <path d="M240 100 H170 L140 130 H60" />
              <path d="M40 240 V190 L80 150" />
              <path d="M200 0 V50 L160 90" />
              <path d="M0 200 H50 L90 240" />
              <path d="M240 200 H190 V240" />
            </g>
            <g fill="#14274E" opacity="0.14">
              <circle cx="90" cy="40" r="4" />
              <circle cx="130" cy="150" r="4" />
              <circle cx="60" cy="130" r="4" />
              <circle cx="200" cy="50" r="4" />
              <circle cx="50" cy="200" r="4" />
              <circle cx="190" cy="200" r="4" />
            </g>
            <rect x="106" y="96" width="28" height="18" rx="2" fill="none" stroke="#14274E" opacity="0.10" strokeWidth="2" />
          </pattern>

          {/* Mascot symbol — navy circle with white face + red accent dots */}
          <symbol id="mascot" viewBox="-40 -40 80 80">
            <circle r="33" fill="#14274E" />
            <circle r="26" fill="none" stroke="#ffffff" strokeOpacity="0.30" strokeWidth="2.5" strokeDasharray="4 9" strokeLinecap="round" />
            <circle cx="0" cy="-29.5" r="3" fill="#E0313A" />
            <circle cx="25.5" cy="15" r="2.4" fill="#E0313A" />
            <circle cx="-25.5" cy="15" r="2.4" fill="#E0313A" />
            <circle r="16.5" fill="#ffffff" />
            <circle cx="-5.5" cy="-1" r="2.8" fill="#14274E" />
            <circle cx="5.5" cy="-1" r="2.8" fill="#14274E" />
          </symbol>

          {/* Soft glow filter */}
          <filter id="soft" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* White base */}
        <rect width="1920" height="1080" fill="#ffffff" />

        {/* Repeating trace pattern overlay */}
        <rect width="1920" height="1080" fill="url(#traces)" />

        {/* Main red circuit paths */}
        <g fill="none" stroke="#E0313A" strokeWidth="2.5" opacity="0.28" strokeLinecap="round">
          <path d="M140 180 H760 V460 H1180 V200 H1720 V620 H1400 V900 H640 V640 H140 Z" />
          <path d="M980 760 H1600 V980 H400 V760 Z" />
        </g>

        {/* Animated pellets running along the main circuit */}
        <path
          className="pellets"
          d="M140 180 H760 V460 H1180 V200 H1720 V620 H1400 V900 H640 V640 H140 Z"
          fill="none"
          stroke="#E0313A"
          strokeWidth="7"
          opacity="0.45"
          strokeLinecap="round"
          strokeDasharray="0.1 64"
        />

        {/* Junction nodes — red dots with glow */}
        <g fill="#E0313A">
          <circle cx="760" cy="460" r="6" opacity="0.5" />
          <circle cx="1180" cy="200" r="6" opacity="0.5" />
          <circle cx="1400" cy="900" r="6" opacity="0.5" />
          <circle cx="400" cy="980" r="6" opacity="0.5" />
          <circle cx="1720" cy="620" r="6" opacity="0.5" />
          <circle cx="140" cy="640" r="6" opacity="0.5" />
          {/* Pulsing glow on key junctions */}
          <circle className="glow" cx="760" cy="460" r="20" filter="url(#soft)" />
          <circle className="glow" cx="1400" cy="900" r="20" filter="url(#soft)" style={{ animationDelay: '-2.5s' }} />
        </g>

        {/* Static mascots at circuit junctions */}
        <g opacity="0.92">
          <use href="#mascot" x="-40" y="-40" width="80" height="80" transform="translate(320,300)" />
          <use href="#mascot" x="-40" y="-40" width="80" height="80" transform="translate(1560,860)" />
          <use href="#mascot" x="-30" y="-30" width="60" height="60" transform="translate(1180,460)" />
          <use href="#mascot" x="-30" y="-30" width="60" height="60" transform="translate(640,900)" />
        </g>

        {/* Animated mascot runner — travels along main circuit path */}
        <g>
          <use href="#mascot" x="-44" y="-44" width="88" height="88" />
          <animateMotion dur="45s" repeatCount="indefinite" path="M140 180 H760 V460 H1180 V200 H1720 V620 H1400 V900 H640 V640 H140 Z" />
        </g>

        {/* Second runner — smaller, faster, on the inner circuit */}
        <g opacity="0.95">
          <use href="#mascot" x="-32" y="-32" width="64" height="64" />
          <animateMotion dur="27s" repeatCount="indefinite" path="M980 760 H1600 V980 H400 V760 Z" />
        </g>
      </svg>
    </div>
  );
}
