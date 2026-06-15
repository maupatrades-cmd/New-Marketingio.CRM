/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        synth: {
          bg:      '#0a0118',
          surface: '#13062a',
          line:    '#2a1450',
          primary: '#00ffff',
          accent:  '#ff00aa',
          text:    '#e8e3ff',
          muted:   '#8676ad',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        wave: {
          '0%,100%': { transform: 'rotate(-8deg)' },
          '50%':     { transform: 'rotate(18deg)' },
        },
      },
      animation: { wave: 'wave 1.8s ease-in-out infinite' },
    },
  },
  plugins: [],
};
