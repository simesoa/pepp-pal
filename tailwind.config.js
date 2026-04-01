/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Penn Pal calm, minimal palette
        penn: {
          bg: '#0e0e12',
          surface: '#1a1a22',
          card: '#22222e',
          border: '#2e2e3e',
          accent: '#7c6af7',
          'accent-muted': '#4e4a8a',
          text: '#e8e6f0',
          muted: '#6b6880',
          bubble: {
            self: '#4e4a8a',
            partner: '#22222e',
          },
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
