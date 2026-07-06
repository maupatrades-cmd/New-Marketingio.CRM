import { useMemo } from 'react';
import {
  MessageCircle, Video, Instagram, Facebook, Twitter, Youtube, Globe, Smartphone,
} from 'lucide-react';

// Kept the filename/component name ShaderBackground so existing
// imports don't break, but this is now an SVG-based PCB pattern:
// static red circuit traces, pulsing white nodes, glass-panel
// social icons floating up. No WebGL / no rAF loop.

const FLOATING_ICONS = [
  { Icon: MessageCircle, delay: '0s',   left: '15%', size: 30, glow: '37, 211, 102'  }, // WhatsApp
  { Icon: Video,         delay: '2.5s', left: '80%', size: 28, glow: '255, 0, 80'    }, // TikTok
  { Icon: Instagram,     delay: '4s',   left: '35%', size: 32, glow: '225, 48, 108'  },
  { Icon: Facebook,      delay: '1s',   left: '65%', size: 28, glow: '24, 119, 242'  },
  { Icon: Twitter,       delay: '5s',   left: '50%', size: 28, glow: '29, 161, 242'  },
  { Icon: Youtube,       delay: '3.5s', left: '22%', size: 30, glow: '255, 0, 0'     },
  { Icon: Smartphone,    delay: '6s',   left: '88%', size: 26, glow: '245, 181, 0'   },
  { Icon: Globe,         delay: '0.5s', left: '5%',  size: 34, glow: '148, 163, 184' },
];

// Deterministic glow-node positions (no Date/Math.random on mount)
const NODE_SEEDS = [
  { x: 12, y: 18, d: 0.2, s: 2.4 }, { x: 88, y: 22, d: 1.1, s: 3.2 },
  { x: 34, y: 46, d: 0.6, s: 2.8 }, { x: 61, y: 12, d: 2.0, s: 3.6 },
  { x: 76, y: 68, d: 0.9, s: 2.6 }, { x: 22, y: 82, d: 1.7, s: 3.1 },
  { x: 48, y: 74, d: 2.4, s: 2.9 }, { x: 92, y: 55, d: 0.3, s: 3.4 },
  { x: 8,  y: 60, d: 1.5, s: 2.7 }, { x: 55, y: 34, d: 2.1, s: 3.0 },
  { x: 40, y: 8,  d: 0.7, s: 3.3 }, { x: 68, y: 88, d: 1.9, s: 2.5 },
  { x: 18, y: 38, d: 2.6, s: 3.2 }, { x: 82, y: 40, d: 1.2, s: 2.9 },
  { x: 30, y: 66, d: 0.4, s: 3.5 }, { x: 72, y: 26, d: 2.3, s: 2.6 },
  { x: 96, y: 78, d: 1.4, s: 3.1 }, { x: 4,  y: 44, d: 0.8, s: 2.8 },
  { x: 44, y: 90, d: 1.8, s: 3.4 }, { x: 58, y: 52, d: 2.5, s: 2.7 },
];

const PCB_CSS = `
  @keyframes floatUp {
    0%   { transform: translateY(110vh) scale(0.8) rotate(-6deg); opacity: 0; }
    12%  { opacity: 1; }
    88%  { opacity: 1; }
    100% { transform: translateY(-20vh) scale(1.15) rotate(6deg); opacity: 0; }
  }
  @keyframes pcbNodePulse {
    0%, 100% { opacity: 0.15; }
    50%      { opacity: 1;    }
  }

  .pcb-icon-float {
    position: absolute;
    bottom: -80px;
    animation: floatUp 18s linear infinite;
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
  }
  .pcb-icon-float:hover { transform: scale(1.35) translateY(-8px) !important; z-index: 50; }

  .pcb-icon-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(11, 33, 67, 0.15);
    transition: box-shadow 0.35s ease, border-color 0.35s ease;
  }
  .pcb-icon-float:hover .pcb-icon-panel {
    border-color: rgba(11, 33, 67, 0.35);
  }

  .pcb-node {
    animation: pcbNodePulse ease-in-out infinite;
    transform-origin: center;
  }
`;

export default function ShaderBackground({
  className = 'fixed top-0 left-0 w-full h-full -z-10',
}) {
  const nodes = useMemo(() => NODE_SEEDS, []);

  return (
    <div className={`${className} overflow-hidden`} style={{ background: '#FFFFFF' }}>
      <style>{PCB_CSS}</style>

      {/* Base PCB layer — tiled circuit traces on white */}
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern id="pcb-pattern" x="0" y="0" width="260" height="260" patternUnits="userSpaceOnUse">
            {/* Horizontal + diagonal traces */}
            <g stroke="#E2293B" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.68">
              <path d="M -20 32  L 62 32   L 82 52   L 178 52  L 198 32  L 280 32" />
              <path d="M -20 92  L 42 92   L 62 112  L 122 112 L 142 92  L 200 92  L 220 112 L 280 112" />
              <path d="M -20 150 L 78 150  L 98 170  L 200 170 L 220 150 L 280 150" />
              <path d="M -20 208 L 100 208 L 120 228 L 200 228 L 220 208 L 280 208" />
              {/* Verticals */}
              <path d="M 42 -20  L 42 92   L 62 112  L 62 280"  />
              <path d="M 100 -20 L 100 170 L 120 190 L 120 280" />
              <path d="M 180 -20 L 180 52  L 200 32  L 200 280" />
              <path d="M 218 -20 L 218 150 L 238 170 L 238 280" />
              {/* Short branches */}
              <path d="M 142 92  L 162 72  L 220 72" />
              <path d="M 62 92   L 62 60   L 82 40" />
              <path d="M 138 150 L 138 130 L 158 110" />
            </g>

            {/* Junction pads */}
            <g fill="#E2293B">
              {[
                [62,32],[82,52],[178,52],[198,32],
                [42,92],[62,112],[122,112],[142,92],[200,92],[220,112],
                [78,150],[98,170],[200,170],[220,150],
                [100,208],[120,228],[200,228],[220,208],
                [162,72],[220,72],[82,40],[138,130],[158,110],
                [120,190],[238,170],
              ].map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="2.6" opacity="0.9" />
              ))}
            </g>

            {/* Small inline highlights — dark on white so they read */}
            <g fill="#0B2143" opacity="0.35">
              <circle cx="62"  cy="32"  r="0.9" />
              <circle cx="200" cy="92"  r="0.9" />
              <circle cx="120" cy="228" r="0.9" />
              <circle cx="220" cy="150" r="0.9" />
            </g>
          </pattern>

          <filter id="red-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
            <stop offset="55%" stopColor="rgba(255, 255, 255, 0)" />
            <stop offset="100%" stopColor="rgba(226, 232, 240, 0.55)" />
          </radialGradient>
        </defs>

        <rect width="100%" height="100%" fill="#FFFFFF" />
        <rect width="100%" height="100%" fill="url(#pcb-pattern)" filter="url(#red-glow)" />
        <rect width="100%" height="100%" fill="url(#vignette)" />
      </svg>

      {/* Animated pulsing nodes — red on the white pcb */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {nodes.map((n, i) => (
          <circle
            key={i}
            className="pcb-node"
            cx={n.x}
            cy={n.y}
            r="0.35"
            fill="#E2293B"
            style={{
              animationDelay: `${n.d}s`,
              animationDuration: `${n.s}s`,
              filter: 'drop-shadow(0 0 3px rgba(226, 41, 59, 0.9)) drop-shadow(0 0 6px rgba(226, 41, 59, 0.5))',
            }}
          />
        ))}
      </svg>

      {/* Floating brand-colored glass icons */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {FLOATING_ICONS.map((item, idx) => {
          const panelSize = item.size + 18;
          return (
            <div
              key={idx}
              className="pcb-icon-float pointer-events-auto"
              style={{
                left: item.left,
                animationDelay: item.delay,
                animationDuration: `${18 + (idx % 4) * 2}s`,
              }}
            >
              <div
                className="pcb-icon-panel"
                style={{
                  width: `${panelSize}px`,
                  height: `${panelSize}px`,
                  background: `linear-gradient(160deg, rgba(${item.glow}, 0.25), rgba(${item.glow}, 0.08))`,
                  boxShadow: `
                    0 0 22px rgba(${item.glow}, 0.55),
                    0 0 44px rgba(${item.glow}, 0.28),
                    inset 0 1px 0 rgba(255, 255, 255, 0.35),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.25)
                  `,
                }}
              >
                <item.Icon
                  size={item.size}
                  strokeWidth={2}
                  color="#ffffff"
                  style={{ filter: `drop-shadow(0 0 4px rgba(${item.glow}, 1))` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
