/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./uecfipresenter2.html",
    "./presentation.htm",
    "./splash.htm",
    "./content/**/*.{txt,html}",
    "./*.js",
    "./song/**/*.js",
    "./network/**/*.js",
    "./menu/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          900: '#4c1d95',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        malayalam: ['Noto Sans Malayalam', 'sans-serif']
      }
    },
  },
  plugins: [],
};
