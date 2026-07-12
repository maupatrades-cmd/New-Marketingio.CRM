const NAVY = '#0a1f4d';
const NAVY_DEEP = '#061638';
const RED = '#e63946';
const RED_SOFT = '#ff5a6a';
const SCREEN = '#f4f6fb';
const INK = '#0b0f1a';

const VALID_PHASES = new Set(['thinking', 'sad', 'guide', 'idle']);

export default function MascotGuide({
  phase = 'thinking',
  size = 120,
  message,
  position = 'inline',
  className = '',
  style,
  ...rest
}) {
  const safePhase = VALID_PHASES.has(phase) ? phase : 'thinking';

  const wrapClass = position === 'fixed'
    ? 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50'
    : 'flex flex-col items-center justify-center gap-3';

  return (
    <div className={`${wrapClass} ${className}`} style={style} {...rest}>
      <div
        className="mio-mascot-guide"
        style={{ width: size, height: size }}
        data-phase={safePhase}
        role="img"
        aria-label={message ? `Marketing iO mascot — ${message}` : 'Marketing iO mascot'}
      >
        <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="mg-head" cx="50%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#13327a" />
              <stop offset="70%" stopColor={NAVY} />
              <stop offset="100%" stopColor={NAVY_DEEP} />
            </radialGradient>
            <radialGradient id="mg-screen" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor={SCREEN} />
            </radialGradient>
            <radialGradient id="mg-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(230,57,70,0.55)" />
              <stop offset="100%" stopColor="rgba(230,57,70,0)" />
            </radialGradient>
          </defs>

          <ellipse className="mg-shadow" cx="120" cy="218" rx="58" ry="6" fill="rgba(6,22,56,0.28)" />

          <g className="mg-head-group">
            <circle cx="120" cy="110" r="86" fill="url(#mg-glow)" opacity="0.6" />
            <circle cx="120" cy="110" r="78" fill="url(#mg-head)" stroke={NAVY_DEEP} strokeWidth="1.5" />

            <g stroke={RED} strokeWidth="1" fill="none" opacity="0.95">
              <circle cx="120" cy="110" r="70" strokeDasharray="3 5" />
              <circle cx="120" cy="110" r="62" strokeDasharray="2 7" opacity="0.6" />
            </g>

            <g fill={RED} className="mg-tick-dots">
              <circle cx="120" cy="40" r="2.4" />
              <circle cx="190" cy="110" r="2.4" />
              <circle cx="120" cy="180" r="2.4" />
              <circle cx="50" cy="110" r="2.4" />
              <circle cx="170" cy="60" r="1.6" />
              <circle cx="70" cy="60" r="1.6" />
              <circle cx="170" cy="160" r="1.6" />
              <circle cx="70" cy="160" r="1.6" />
            </g>

            <g className="mg-pulse-dots" fill={RED_SOFT}>
              <circle cx="92" cy="56" r="2" />
              <circle cx="148" cy="58" r="2" />
              <circle cx="60" cy="120" r="2" />
              <circle cx="180" cy="100" r="2" />
              <circle cx="100" cy="170" r="2" />
              <circle cx="146" cy="168" r="2" />
            </g>

            <g>
              <circle cx="120" cy="112" r="38" fill="url(#mg-screen)" stroke={NAVY_DEEP} strokeWidth="2" />
              <circle cx="120" cy="112" r="34" fill="none" stroke="rgba(10,31,77,0.12)" strokeWidth="1" />
            </g>

            <g className="mg-face">
              <g className="mg-eyes">
                <g className="mg-eye mg-eye-left">
                  <circle cx="108" cy="110" r="5.2" fill={INK} />
                  <circle cx="109.6" cy="108.4" r="1.4" fill="#ffffff" />
                </g>
                <g className="mg-eye mg-eye-right">
                  <circle cx="132" cy="110" r="5.2" fill={INK} />
                  <circle cx="133.6" cy="108.4" r="1.4" fill="#ffffff" />
                </g>
              </g>
              <path
                className="mg-mouth"
                d="M108 124 Q120 132 132 124"
                stroke={INK}
                strokeWidth="2.2"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            <g className="mg-antenna">
              <line x1="120" y1="32" x2="120" y2="20" stroke={NAVY_DEEP} strokeWidth="2" />
              <circle cx="120" cy="16" r="4" fill={RED} />
              <circle cx="120" cy="16" r="7" fill={RED} opacity="0.25" className="mg-antenna-glow" />
            </g>
          </g>
        </svg>

        <style>{`
          .mio-mascot-guide {
            display: inline-block;
            position: relative;
            line-height: 0;
          }
          .mio-mascot-guide svg {
            width: 100%;
            height: 100%;
            overflow: visible;
          }

          .mg-head-group {
            transform-origin: 120px 120px;
            animation: mg-bob 2.8s ease-in-out infinite;
          }
          @keyframes mg-bob {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50%      { transform: translateY(-5px); }
          }

          .mg-shadow {
            transform-origin: 120px 218px;
            animation: mg-shadow 2.8s ease-in-out infinite;
          }
          @keyframes mg-shadow {
            0%, 100% { transform: scale(1); opacity: 0.28; }
            50%      { transform: scale(0.86); opacity: 0.18; }
          }

          .mg-pulse-dots circle {
            animation: mg-flicker 2.4s ease-in-out infinite;
          }
          .mg-pulse-dots circle:nth-child(2) { animation-delay: 0.3s; }
          .mg-pulse-dots circle:nth-child(3) { animation-delay: 0.6s; }
          .mg-pulse-dots circle:nth-child(4) { animation-delay: 0.9s; }
          .mg-pulse-dots circle:nth-child(5) { animation-delay: 1.2s; }
          .mg-pulse-dots circle:nth-child(6) { animation-delay: 1.5s; }
          @keyframes mg-flicker {
            0%, 100% { opacity: 0.2; }
            50%      { opacity: 1; }
          }

          /* THINKING — eyes dart side-to-side, antenna spins its ring */
          [data-phase="thinking"] .mg-eye-left,
          [data-phase="thinking"] .mg-eye-right {
            transform-origin: center;
            animation: mg-eye-dart 2.2s ease-in-out infinite;
          }
          @keyframes mg-eye-dart {
            0%, 100% { transform: translateX(0); }
            25%      { transform: translateX(-2.4px); }
            50%      { transform: translateX(0); }
            75%      { transform: translateX(2.4px); }
          }
          [data-phase="thinking"] .mg-tick-dots {
            transform-origin: 120px 110px;
            animation: mg-spin 3.6s linear infinite;
          }
          @keyframes mg-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          [data-phase="thinking"] .mg-antenna-glow {
            transform-origin: 120px 16px;
            animation: mg-antenna-pulse 1.1s ease-in-out infinite;
          }
          @keyframes mg-antenna-pulse {
            0%, 100% { transform: scale(1);   opacity: 0.25; }
            50%      { transform: scale(1.9); opacity: 0.05; }
          }

          /* SAD — droopy eyes, downturned mouth, slower bob, dim antenna */
          [data-phase="sad"] .mg-head-group {
            animation: mg-sad-bob 4s ease-in-out infinite;
          }
          @keyframes mg-sad-bob {
            0%, 100% { transform: translateY(0) rotate(-4deg); }
            50%      { transform: translateY(2px) rotate(-4deg); }
          }
          [data-phase="sad"] .mg-eye-left,
          [data-phase="sad"] .mg-eye-right {
            transform: translateY(1.6px) scaleY(0.65);
            transform-origin: center;
          }
          [data-phase="sad"] .mg-mouth {
            d: path("M108 128 Q120 120 132 128");
          }
          [data-phase="sad"] .mg-antenna-glow {
            opacity: 0.08;
          }

          /* GUIDE — head tilts toward speech bubble on the right */
          [data-phase="guide"] .mg-head-group {
            animation: mg-guide-tilt 3.2s ease-in-out infinite;
          }
          @keyframes mg-guide-tilt {
            0%, 100% { transform: rotate(0deg) translateY(0); }
            50%      { transform: rotate(8deg) translateY(-3px); }
          }
          [data-phase="guide"] .mg-antenna-glow {
            transform-origin: 120px 16px;
            animation: mg-antenna-pulse 1.6s ease-in-out infinite;
          }

          /* IDLE — gentle blink only */
          [data-phase="idle"] .mg-eyes {
            transform-origin: 120px 110px;
            animation: mg-blink 4.2s ease-in-out infinite;
          }
          @keyframes mg-blink {
            0%, 92%, 100% { transform: scaleY(1); }
            95%           { transform: scaleY(0.1); }
          }
        `}</style>
      </div>

      {message && (
        <p
          className={
            position === 'fixed'
              ? 'text-sm font-semibold tracking-wide text-[#0B2143] text-center px-6 max-w-sm'
              : 'text-sm text-gray-500 text-center max-w-xs'
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
