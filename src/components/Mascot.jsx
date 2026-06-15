import { useEffect, useState } from 'react';

const NAVY = '#0a1f4d';
const NAVY_DEEP = '#061638';
const RED = '#e63946';
const RED_SOFT = '#ff5a6a';
const SCREEN = '#f4f6fb';
const INK = '#0b0f1a';

export default function Mascot({ size = 320, className = '', style, ...rest }) {
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    const seq = [
      { p: 'idle', ms: 1200 },
      { p: 'wave', ms: 1800 },
      { p: 'turn', ms: 1600 },
      { p: 'idle', ms: 1200 },
    ];
    let i = 0;
    let t;
    const tick = () => {
      setPhase(seq[i].p);
      t = setTimeout(() => {
        i = (i + 1) % seq.length;
        tick();
      }, seq[i].ms);
    };
    tick();
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`mio-mascot ${className}`}
      style={{ width: size, height: size, ...style }}
      data-phase={phase}
      role="img"
      aria-label="Marketing.io mascot"
      {...rest}
    >
      <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="mio-head" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#13327a" />
            <stop offset="70%" stopColor={NAVY} />
            <stop offset="100%" stopColor={NAVY_DEEP} />
          </radialGradient>
          <radialGradient id="mio-screen" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={SCREEN} />
          </radialGradient>
          <radialGradient id="mio-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(230,57,70,0.55)" />
            <stop offset="100%" stopColor="rgba(230,57,70,0)" />
          </radialGradient>
        </defs>

        <ellipse className="mio-shadow" cx="120" cy="218" rx="58" ry="6" fill="rgba(6,22,56,0.28)" />

        <g className="mio-head-group">
          <circle cx="120" cy="110" r="86" fill="url(#mio-glow)" opacity="0.6" />
          <circle cx="120" cy="110" r="78" fill="url(#mio-head)" stroke={NAVY_DEEP} strokeWidth="1.5" />

          <g stroke={RED} strokeWidth="1" fill="none" opacity="0.95">
            <circle cx="120" cy="110" r="70" strokeDasharray="3 5" />
            <circle cx="120" cy="110" r="62" strokeDasharray="2 7" opacity="0.6" />
            <path d="M120 40 L120 48 L128 48" />
            <path d="M120 180 L120 172 L112 172" />
            <path d="M50 110 L58 110 L58 102" />
            <path d="M190 110 L182 110 L182 118" />
            <path d="M70 60 L78 68 L86 68" />
            <path d="M170 60 L162 68 L154 68" />
            <path d="M70 160 L78 152 L86 152" />
            <path d="M170 160 L162 152 L154 152" />
          </g>

          <g fill={RED}>
            {[
              [120, 40], [128, 48], [112, 172], [58, 102], [182, 118],
              [86, 68], [154, 68], [86, 152], [154, 152],
              [78, 90], [162, 90], [78, 130], [162, 130],
              [104, 44], [136, 44], [104, 176], [136, 176],
              [62, 78], [178, 78], [62, 142], [178, 142],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.4 : 1.6} />
            ))}
          </g>

          <g className="mio-pulse-dots" fill={RED_SOFT}>
            <circle cx="92" cy="56" r="2" />
            <circle cx="148" cy="58" r="2" />
            <circle cx="60" cy="120" r="2" />
            <circle cx="180" cy="100" r="2" />
            <circle cx="100" cy="170" r="2" />
            <circle cx="146" cy="168" r="2" />
          </g>

          <g>
            <circle cx="120" cy="112" r="38" fill="url(#mio-screen)" stroke={NAVY_DEEP} strokeWidth="2" />
            <circle cx="120" cy="112" r="34" fill="none" stroke="rgba(10,31,77,0.12)" strokeWidth="1" />
          </g>

          <g className="mio-face">
            <g className="mio-eyes" fill={INK}>
              <circle cx="108" cy="110" r="5.2" />
              <circle cx="132" cy="110" r="5.2" />
              <circle cx="109.6" cy="108.4" r="1.4" fill="#ffffff" />
              <circle cx="133.6" cy="108.4" r="1.4" fill="#ffffff" />
            </g>
            <path
              d="M108 124 Q120 132 132 124"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
          </g>

          <g className="mio-antenna">
            <line x1="120" y1="32" x2="120" y2="20" stroke={NAVY_DEEP} strokeWidth="2" />
            <circle cx="120" cy="16" r="4" fill={RED} />
            <circle cx="120" cy="16" r="7" fill={RED} opacity="0.25" className="mio-antenna-glow" />
          </g>
        </g>

        <g className="mio-hand mio-hand-left">
          <rect x="38" y="160" width="34" height="10" rx="3" fill={NAVY} />
          <rect x="38" y="160" width="34" height="3" fill={RED} />
          <path
            d="M40 170 q-6 8 0 18 q6 8 18 8 q14 0 18 -10 q3 -8 -2 -16 z"
            fill={NAVY}
            stroke={NAVY_DEEP}
            strokeWidth="1"
          />
          <g transform="translate(46 174)">
            <rect width="20" height="20" rx="4" fill="#1da1f2" />
            <path
              d="M5 14 q4 1 7 -1 q-3 0 -4 -3 q1 0 2 0 q-3 -1 -3 -4 q1 1 2 1 q-2 -2 -1 -5 q3 4 8 5 q-1 -4 3 -5 q3 0 4 2 q1 0 3 -1 q-1 2 -2 3 q2 0 3 -1 q-1 2 -3 3 q0 6 -5 9 q-5 3 -14 -3"
              fill="#fff"
              transform="scale(0.6) translate(2 2)"
            />
          </g>
        </g>

        <g className="mio-hand mio-hand-right">
          <rect x="168" y="160" width="34" height="10" rx="3" fill={NAVY} />
          <rect x="168" y="160" width="34" height="3" fill={RED} />
          <path
            d="M170 170 q-5 8 0 18 q6 8 18 8 q14 0 18 -10 q3 -8 -3 -16 z"
            fill={NAVY}
            stroke={NAVY_DEEP}
            strokeWidth="1"
          />
          <g transform="translate(176 174)">
            <rect width="20" height="20" rx="4" fill="#1877f2" />
            <path
              d="M12 18 v-6 h2 l0.4 -2.4 H12 V8.2 c0 -0.7 0.2 -1.2 1.2 -1.2 H14.5 V4.8 c-0.3 0 -1.1 -0.1 -2 -0.1 c-2 0 -3.4 1.2 -3.4 3.4 v1.5 H7 v2.4 h2.1 V18 z"
              fill="#fff"
            />
          </g>
        </g>
      </svg>

      <style>{`
        .mio-mascot {
          display: inline-block;
          position: relative;
          line-height: 0;
        }
        .mio-mascot svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .mio-head-group {
          transform-origin: 120px 120px;
          animation: mio-bob 2.8s ease-in-out infinite;
        }
        @keyframes mio-bob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-5px); }
        }

        .mio-shadow {
          transform-origin: 120px 218px;
          animation: mio-shadow 2.8s ease-in-out infinite;
        }
        @keyframes mio-shadow {
          0%, 100% { transform: scale(1); opacity: 0.28; }
          50%      { transform: scale(0.86); opacity: 0.18; }
        }

        .mio-eyes {
          transform-origin: 120px 110px;
          animation: mio-blink 4.2s ease-in-out infinite;
        }
        @keyframes mio-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%           { transform: scaleY(0.1); }
        }

        .mio-antenna-glow {
          transform-origin: 120px 16px;
          animation: mio-antenna 1.6s ease-in-out infinite;
        }
        @keyframes mio-antenna {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50%      { transform: scale(1.6); opacity: 0.05; }
        }

        .mio-pulse-dots circle {
          animation: mio-flicker 2.4s ease-in-out infinite;
        }
        .mio-pulse-dots circle:nth-child(2) { animation-delay: 0.3s; }
        .mio-pulse-dots circle:nth-child(3) { animation-delay: 0.6s; }
        .mio-pulse-dots circle:nth-child(4) { animation-delay: 0.9s; }
        .mio-pulse-dots circle:nth-child(5) { animation-delay: 1.2s; }
        .mio-pulse-dots circle:nth-child(6) { animation-delay: 1.5s; }
        @keyframes mio-flicker {
          0%, 100% { opacity: 0.2; }
          50%      { opacity: 1; }
        }

        .mio-hand-left  { transform-origin: 55px 195px; }
        .mio-hand-right { transform-origin: 185px 195px; }

        [data-phase="wave"] .mio-hand-right {
          animation: mio-wave 0.6s ease-in-out 3;
        }
        @keyframes mio-wave {
          0%, 100% { transform: translate(0,0) rotate(0deg); }
          25%      { transform: translate(8px,-30px) rotate(20deg); }
          75%      { transform: translate(8px,-30px) rotate(-20deg); }
        }

        [data-phase="turn"] .mio-head-group {
          animation: mio-turn 1.6s ease-in-out 1;
        }
        @keyframes mio-turn {
          0%   { transform: rotate(0deg) translateY(0); }
          25%  { transform: rotate(-10deg) translateY(-3px); }
          50%  { transform: rotate(0deg) translateY(0); }
          75%  { transform: rotate(10deg) translateY(-3px); }
          100% { transform: rotate(0deg) translateY(0); }
        }
      `}</style>
    </div>
  );
}
