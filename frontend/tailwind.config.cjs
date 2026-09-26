// tailwind.config.cjs
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}', '../src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        tealAccent: '#14b8a6', // teal-500
        purpleAccent: '#a855f7', // purple-500
        darkBg: '#0f0f0f',
      },
      boxShadow: {
        glow: '0 0 10px rgba(20,184,166,0.7)',
      },
      animation: {
        'float-up': 'floatUp 1s ease-out',
        'pulse-slow': 'pulse 1.5s infinite',
        'level-up': 'scaleFade 0.8s ease-out',
      },
      keyframes: {
        floatUp: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-20px)' },
        },
        pulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        },
        scaleFade: {
          '0%': { opacity: '0', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '100%': { opacity: '0', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
