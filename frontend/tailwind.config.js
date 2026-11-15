/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hyrox: {
          // Fondos: se evita el negro puro (#000) porque en OLED produce
          // manchas al hacer scroll y elimina la sensacion de profundidad.
          void: '#07080B',
          secondary: '#0A0B10',
          carbon: '#101219',
          steel: '#191C26',
          slate: '#232733',

          // Texto
          paper: '#F2F4F8',
          mist: '#8A90A3',
          ghost: '#5A6072',

          // Marca y estados
          primary: '#FF6B00',
          ember: '#FF8B33',
          accent: '#00E5A0',
          volt: '#00E5A0',
          danger: '#FF4438',
          signal: '#FF4438',
          warning: '#FFB020',
          success: '#00E5A0',
          info: '#3B9EFF',

          // Podio
          gold: '#FFD24A',
          silver: '#CBD3E1',
          bronze: '#E08A4B',
        },
      },
      fontFamily: {
        // Barlow Condensed da la verticalidad de la cartelería deportiva;
        // Barlow mantiene legible el texto corrido.
        display: ['"Barlow Condensed"', 'Oswald', 'Impact', 'system-ui', 'sans-serif'],
        sans: ['Barlow', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        4.5: '1.125rem',
      },
      letterSpacing: {
        display: '-0.02em',
        eyebrow: '0.18em',
      },
      boxShadow: {
        'glow-primary': '0 0 0 1px rgba(255,107,0,0.25), 0 8px 32px -8px rgba(255,107,0,0.45)',
        'glow-accent': '0 0 0 1px rgba(0,229,160,0.25), 0 8px 32px -8px rgba(0,229,160,0.35)',
        elevated: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.8)',
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 2px 16px -6px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)',
        'sheen': 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.07) 50%, transparent 70%)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'flash-row': {
          '0%': { backgroundColor: 'rgba(255,107,0,0.22)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.82)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.25s ease-out both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        'flash-row': 'flash-row 1.4s ease-out',
        'pulse-dot': 'pulse-dot 1.8s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
