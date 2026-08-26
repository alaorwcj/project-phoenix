/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#baddff',
          300: '#7dc2ff',
          400: '#38a3ff',
          500: '#0d87f2',
          600: '#0068d0',
          700: '#0053a8',
          800: '#00478a',
          900: '#063d72',
          950: '#04274b',
        },
      },
    },
  },
  plugins: [],
}
