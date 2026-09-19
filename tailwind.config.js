/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: '#0B1220',   // fons general
          surface: '#121B2E',   // targetes
          raised: '#1A2540',    // targetes elevades / hover
          border: '#243252',
        },
        pitch: {
          light: '#0F6B4C',
          dark: '#0A4F38',
          line: 'rgba(255,255,255,0.55)',
        },
        accent: {
          DEFAULT: '#F2B84B',   // ambre — identitat del club
          dim: '#B98A2E',
        },
        ok: '#3DDC91',
        danger: '#E5484D',
        ink: {
          DEFAULT: '#E7ECF5',
          dim: '#93A1BF',
          faint: '#5A6788',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
}
