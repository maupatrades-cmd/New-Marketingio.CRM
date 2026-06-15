/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy:      { 900: '#081530', 800: '#0B1C3F', 700: '#122351', border: '#22356B' },
        brandred:  '#FF3142',
        soft:      '#A9B6D6',
      },
      backgroundImage: {
        'grad-brand':  'linear-gradient(135deg, #FFC83D, #FF3142, #FF2E97)',
        'grad-action': 'linear-gradient(135deg, #FF6A2C, #FF2E3F, #FF2E97)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        wave: {
          '0%,100%': { transform: 'rotate(-12deg)' },
          '50%':     { transform: 'rotate(22deg)' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        wave:   'wave 1.6s ease-in-out infinite',
        floaty: 'floaty 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
