/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: 'var(--brand)',
        'brand-to': 'var(--brand-to)', // Cor secundária para degradês
        bg: 'var(--bg-main)',
        surface: 'var(--bg-surface)',
        sidebar: 'var(--bg-sidebar)',
        text: 'var(--text-main)',
        'text-sec': 'var(--text-sec)',
        border: 'var(--border-color)',
      },
      fontFamily: {
        sans: ['"Google Sans"', 'Inter', 'sans-serif'],
      },
      transitionProperty: {
        'colors': 'background-color, border-color, color, fill, stroke',
      }
    },
  },
  plugins: [],
}