/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#fff0f6',
          100: '#ffe0ee',
          200: '#ffc2de',
          300: '#ff94c8',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        cream: {
          50:  '#fdf8f3',
          100: '#f9ede0',
          200: '#f3d9c2',
          300: '#e8c09e',
          400: '#d9a07a',
          500: '#c9825a',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        dark: {
          900: '#140c0a',
          800: '#1e1210',
          700: '#2a1915',
          600: '#36221d',
          500: '#4a2e28',
        },
      },
    },
  },
  plugins: [],
};
