/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        masters: {
          green: '#1a4d2e',
          'green-mid': '#2d6a45',
          'green-light': '#e8f0eb',
          'green-pale': '#f2f7f3',
          gold: '#c9a84c',
          'gold-light': '#f5eed8',
          'gold-pale': '#fdfaf0',
        },
        score: {
          under: '#2d6a45',
          over: '#c0392b',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        masters: '0 2px 14px rgba(26,77,46,0.10)',
      },
    },
  },
  plugins: [],
};
