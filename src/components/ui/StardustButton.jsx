import { Sparkles, Zap } from 'lucide-react';

const SIZE_PRESETS = {
  default: {
    padding: '24px 40px',
    fontSize: '20px',
    gap: '12px',
    iconSize: 24,
    shadow: `
      inset 0 0.3rem 0.9rem rgba(255, 255, 255, 0.2),
      inset 0 -0.1rem 0.3rem rgba(0, 0, 0, 0.8),
      inset 0 -0.4rem 0.9rem rgba(255, 255, 255, 0.3),
      0 3rem 3rem rgba(0, 0, 0, 0.3),
      0 1rem 1rem -0.6rem rgba(0, 0, 0, 0.8)
    `,
  },
  sm: {
    padding: '12px 22px',
    fontSize: '13px',
    gap: '8px',
    iconSize: 14,
    shadow: `
      inset 0 0.2rem 0.5rem rgba(255, 255, 255, 0.2),
      inset 0 -0.1rem 0.2rem rgba(0, 0, 0, 0.8),
      inset 0 -0.3rem 0.5rem rgba(255, 255, 255, 0.3),
      0 1.2rem 1.2rem rgba(0, 0, 0, 0.28),
      0 0.4rem 0.5rem -0.25rem rgba(0, 0, 0, 0.75)
    `,
  },
};

const P_STYLE_BASE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: 0,
  transition: 'all 0.2s ease',
  transform: 'translateY(2%)',
  maskImage: 'linear-gradient(to bottom, rgba(255, 255, 255, 1) 50%, rgba(255,255,255,0.7))',
};

const PEARL_CSS = `
  .stardust-button .wrap::before,
  .stardust-button .wrap::after {
    content: "";
    position: absolute;
    transition: all 0.3s ease;
  }
  .stardust-button .wrap::before {
    left: -15%;
    right: -15%;
    bottom: 25%;
    top: -100%;
    border-radius: 50%;
    background-color: rgba(239, 68, 68, 0.15);
  }
  .stardust-button .wrap::after {
    left: 6%;
    right: 6%;
    top: 12%;
    bottom: 40%;
    border-radius: 22px 22px 0 0;
    box-shadow: inset 0 10px 8px -10px rgba(239, 68, 68, 0.6);
    background: linear-gradient(
      180deg,
      rgba(239, 68, 68, 0.3) 0%,
      rgba(0, 0, 0, 0) 50%,
      rgba(0, 0, 0, 0) 100%
    );
  }
  .stardust-button .wrap p .icon-zap { display: none; }
  .stardust-button:hover .wrap p .icon-sparkle { display: none; }
  .stardust-button:hover .wrap p .icon-zap {
    display: inline-block;
    color: #EF4444;
  }
  .stardust-button:hover {
    box-shadow:
      inset 0 0.3rem 0.5rem rgba(255, 255, 255, 0.4),
      inset 0 -0.1rem 0.3rem rgba(0, 0, 0, 0.7),
      inset 0 -0.4rem 1.2rem rgba(239, 68, 68, 0.8),
      0 3rem 3rem rgba(0, 0, 0, 0.3),
      0 1rem 1rem -0.6rem rgba(0, 0, 0, 0.8);
  }
  .stardust-button:hover .wrap::before { transform: translateY(-5%); }
  .stardust-button:hover .wrap::after {
    opacity: 0.6;
    transform: translateY(5%);
  }
  .stardust-button:hover .wrap p { transform: translateY(-4%); }
  .stardust-button:active {
    transform: translateY(4px);
    box-shadow:
      inset 0 0.3rem 0.5rem rgba(255, 255, 255, 0.5),
      inset 0 -0.1rem 0.3rem rgba(0, 0, 0, 0.8),
      inset 0 -0.4rem 0.9rem rgba(239, 68, 68, 0.5),
      0 3rem 3rem rgba(0, 0, 0, 0.3),
      0 1rem 1rem -0.6rem rgba(0, 0, 0, 0.8);
  }
  .stardust-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* SM variant — tone the hover/active shadows down so it doesn't
     look like a giant button pretending to be small */
  .stardust-button.stardust-sm:hover {
    box-shadow:
      inset 0 0.2rem 0.3rem rgba(255, 255, 255, 0.4),
      inset 0 -0.1rem 0.2rem rgba(0, 0, 0, 0.7),
      inset 0 -0.3rem 0.8rem rgba(239, 68, 68, 0.8),
      0 1.4rem 1.4rem rgba(0, 0, 0, 0.28),
      0 0.5rem 0.6rem -0.3rem rgba(0, 0, 0, 0.75);
  }
  .stardust-button.stardust-sm:active {
    transform: translateY(2px);
    box-shadow:
      inset 0 0.2rem 0.3rem rgba(255, 255, 255, 0.5),
      inset 0 -0.1rem 0.2rem rgba(0, 0, 0, 0.8),
      inset 0 -0.3rem 0.5rem rgba(239, 68, 68, 0.5),
      0 1.2rem 1.2rem rgba(0, 0, 0, 0.28),
      0 0.4rem 0.5rem -0.25rem rgba(0, 0, 0, 0.75);
  }
`;

export default function StardustButton({
  children = 'Upgrade Package',
  onClick,
  className = '',
  size = 'default',
  ...props
}) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.default;
  const buttonStyle = {
    '--white': '#ffffff',
    '--bg': '#0B2143',
    '--radius': '100px',
    outline: 'none',
    cursor: 'pointer',
    border: 0,
    position: 'relative',
    borderRadius: 'var(--radius)',
    backgroundColor: 'var(--bg)',
    transition: 'all 0.2s ease',
    boxShadow: preset.shadow,
  };
  const wrapStyle = {
    fontSize: preset.fontSize,
    fontWeight: 700,
    color: '#ffffff',
    padding: preset.padding,
    borderRadius: 'inherit',
    position: 'relative',
    overflow: 'hidden',
  };
  const pStyle = { ...P_STYLE_BASE, gap: preset.gap };

  return (
    <>
      <style>{PEARL_CSS}</style>
      <button
        className={`stardust-button ${size === 'sm' ? 'stardust-sm' : ''} ${className}`}
        style={buttonStyle}
        onClick={onClick}
        {...props}
      >
        <div className="wrap" style={wrapStyle}>
          <p style={pStyle}>
            <Sparkles className="icon-sparkle text-slate-300" size={preset.iconSize} />
            <Zap className="icon-zap" size={preset.iconSize} />
            {children}
          </p>
        </div>
      </button>
    </>
  );
}
