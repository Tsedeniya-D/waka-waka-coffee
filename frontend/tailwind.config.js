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
          600: '#2E7D32',
          700: '#1b5e20',
          800: '#166534',
          900: '#14532d',
          950: '#0d3320',
        },
        coffee: {
          50: '#faf7f3',
          100: '#f3ece2',
          200: '#e6d6c2',
          300: '#d4b896',
          400: '#c09669',
          500: '#b3804f',
          600: '#a67044',
          700: '#8a5838',
          800: '#6f4732',
          900: '#5a3a2a',
          950: '#3d261b',
        },
        cream: {
          50: '#fefdf8',
          100: '#fdf9ed',
          200: '#faf0d2',
          300: '#f5e2ae',
          400: '#efcf82',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'fade-in-up': 'fadeInUp 0.7s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slow-zoom': 'slowZoom 12s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slowZoom: {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.1)' },
        },
      },
    },
  },
  plugins: [],
}
