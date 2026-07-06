import { useEffect, useRef } from 'react';

// Marketing iO Red: HSL 353 / 83% / 60%
const GLOW_COLORS = {
  'brand-red': { base: 353, spread: 0, saturation: 83, lightness: 60 },
  'navy':      { base: 214, spread: 0, saturation: 72, lightness: 15 },
  'white':     { base: 0,   spread: 0, saturation: 0,  lightness: 100 },
};

const SIZE_MAP = {
  sm:   'w-48 h-64',
  md:   'w-64 h-80',
  lg:   'w-80 h-96',
  auto: 'w-full h-full',
};

const GLOW_CSS = `
  [data-glow]::before,
  [data-glow]::after {
    pointer-events: none;
    content: "";
    position: absolute;
    inset: calc(var(--border-size) * -1);
    border: var(--border-size) solid transparent;
    border-radius: calc(var(--radius) * 1px);
    background-attachment: fixed;
    background-size: calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)));
    background-repeat: no-repeat;
    background-position: 50% 50%;
    -webkit-mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
    -webkit-mask-clip: padding-box, border-box;
    -webkit-mask-composite: source-in, xor;
    mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
    mask-clip: padding-box, border-box;
    mask-composite: intersect;
  }
  [data-glow]::before {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.8) calc(var(--spotlight-size) * 0.8) at
      calc(var(--x, 0) * 1px)
      calc(var(--y, 0) * 1px),
      hsl(var(--hue) calc(var(--saturation) * 1%) calc(var(--lightness) * 1%) / 1), transparent 100%
    );
  }
  [data-glow]::after {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.4) calc(var(--spotlight-size) * 0.4) at
      calc(var(--x, 0) * 1px)
      calc(var(--y, 0) * 1px),
      rgba(255, 255, 255, 0.8), transparent 100%
    );
  }
`;

// Inject the pseudo-element CSS + pointer tracker exactly once, no
// matter how many GlowCards render.
let glowCssMounted = false;
let pointerListenerBound = false;
const trackedCards = new Set();

function ensureGlobals() {
  if (typeof document === 'undefined') return;
  if (!glowCssMounted) {
    const style = document.createElement('style');
    style.setAttribute('data-glow-card', '');
    style.textContent = GLOW_CSS;
    document.head.appendChild(style);
    glowCssMounted = true;
  }
  if (!pointerListenerBound) {
    document.addEventListener('pointermove', (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const xp = (x / window.innerWidth).toFixed(2);
      const yp = (y / window.innerHeight).toFixed(2);
      for (const el of trackedCards) {
        el.style.setProperty('--x',  x.toFixed(2));
        el.style.setProperty('--y',  y.toFixed(2));
        el.style.setProperty('--xp', xp);
        el.style.setProperty('--yp', yp);
      }
    });
    pointerListenerBound = true;
  }
}

export default function GlowCard({
  children,
  className = '',
  glowColor = 'brand-red',
  size = 'auto',
  width,
  height,
  customSize = false,
  ...rest
}) {
  const cardRef = useRef(null);

  useEffect(() => {
    ensureGlobals();
    const el = cardRef.current;
    if (!el) return;
    trackedCards.add(el);
    return () => { trackedCards.delete(el); };
  }, []);

  const { base, spread, saturation, lightness } = GLOW_COLORS[glowColor] || GLOW_COLORS['brand-red'];
  const sizeClasses = customSize ? '' : (SIZE_MAP[size] || '');

  const style = {
    '--base': base,
    '--spread': spread,
    '--saturation': saturation,
    '--lightness': lightness,
    '--radius': '16',
    '--border': '2',
    '--backdrop': 'rgba(255, 255, 255, 0.95)',
    '--backup-border': 'rgba(11, 33, 67, 0.1)',
    '--size': '250',
    '--outer': '1',
    '--border-size': 'calc(var(--border, 2) * 1px)',
    '--spotlight-size': 'calc(var(--size, 150) * 1px)',
    '--hue': 'calc(var(--base) + (var(--xp, 0) * var(--spread, 0)))',
    backgroundImage: `radial-gradient(
      var(--spotlight-size) var(--spotlight-size) at
      calc(var(--x, 0) * 1px)
      calc(var(--y, 0) * 1px),
      hsl(var(--hue) calc(var(--saturation) * 1%) calc(var(--lightness) * 1%) / 0.05), transparent
    )`,
    backgroundColor: 'var(--backdrop)',
    backgroundSize: 'calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)))',
    backgroundPosition: '50% 50%',
    backgroundAttachment: 'fixed',
    border: 'var(--border-size) solid var(--backup-border)',
    position: 'relative',
    touchAction: 'none',
  };
  if (width  !== undefined) style.width  = typeof width  === 'number' ? `${width}px`  : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      ref={cardRef}
      data-glow=""
      style={style}
      className={`${sizeClasses} rounded-2xl relative flex flex-col shadow-sm hover:shadow-md transition-shadow duration-300 p-6 backdrop-blur-md text-[#0B2143] ${className}`}
      {...rest}
    >
      <div className="relative z-10 w-full h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}
