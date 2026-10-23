/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#3B4FD8',
          dark: '#2A3BB0',
          light: '#EEF2FF',
        },
        surface: {
          bg: '#F2F4F8',
          card: '#FFFFFF',
          border: '#D5D9E2',
        },
        text: {
          main: '#1B1F2A',
          blue: '#2A3BB0',
          muted: '#64748B',
        },
      },
      fontFamily: {
        bengali: ['"Hind Siliguri"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
