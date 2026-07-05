/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Auth/light palette (matches Mascot.jsx + reference screenshot)
        navy:      { 900: '#0a1f4d', 800: '#13327a', deep: '#061638', ink: '#0b0f1a' },
        brandred:  { DEFAULT: '#e63946', soft: '#ff5a6a' },
        cream:     '#fff5f4',
        screen:    '#f4f6fb',
        // Dashboard dark palette (owner console — refined slate glass)
        darkbg:    { 900: '#020617', 800: '#0f172a', 700: '#1e293b', border: '#243147' },
        soft:      '#94a3b8',
      },
      backgroundImage: {
        'grad-brand':  'linear-gradient(135deg, #FFC83D, #e63946, #FF2E97)',
        'grad-action': 'linear-gradient(135deg, #FF6A2C, #e63946, #FF2E97)',
        'auth-bg':     'radial-gradient(60% 50% at 50% 0%, rgba(230,57,70,0.10), transparent 70%), radial-gradient(40% 40% at 100% 100%, rgba(255,200,61,0.08), transparent 60%), #fff5f4',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
