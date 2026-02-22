import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        'autocorp-bg': '#0f0328',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'chat-bubble': 'bubbleIn 0.3s ease-out',
        'typewriter': 'typewriter 2s steps(40)',
        'panel-appear': 'panelIn 0.5s ease-out',
        'pulse-dot': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'edge-flash': 'flash 1s ease-in-out',
      },
      keyframes: {
        bubbleIn: {
          '0%': { opacity: '0', transform: 'scale(0.8) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        panelIn: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        flash: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      }
    }
  },
  plugins: []
}
export default config
