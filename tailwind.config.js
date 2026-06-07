/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#020711',
        obsidian: '#06111f',
        glass: 'rgba(8, 24, 38, 0.66)',
        cyan: {
          echo: '#25e8ff',
          soft: '#6ee7f8',
          dim: '#0f7490',
        },
        amber: {
          echo: '#ffb547',
        },
        danger: {
          echo: '#ff4d5e',
        },
        success: {
          echo: '#5dffb3',
        },
      },
      boxShadow: {
        cyber: '0 0 32px rgba(37, 232, 255, 0.18)',
        danger: '0 0 26px rgba(255, 77, 94, 0.2)',
        amber: '0 0 26px rgba(255, 181, 71, 0.16)',
      },
      animation: {
        'scan-progress': 'scanProgress 1.8s linear infinite',
      },
      keyframes: {
        scanProgress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
}
