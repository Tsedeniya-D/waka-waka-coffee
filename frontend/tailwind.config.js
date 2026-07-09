/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#388e3c',
          600: '#2E7D32', // Waka Coffee Green
          700: '#1b5e20',
          800: '#166534',
          900: '#14532d',
        },
      },
    },
  },
  plugins: [],
}
