import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ── Notion-Inspired Semantic Tokens ── */
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        /* Surface (warm neutrals) */
        surface: 'hsl(var(--surface))',
        'surface-alt': 'hsl(var(--surface-alt))',
        'warm-white': 'hsl(var(--warm-white))',
        'warm-dark': 'hsl(var(--warm-dark))',
        'warm-gray': {
          300: 'hsl(var(--warm-gray-300))',
          500: 'hsl(var(--warm-gray-500))',
        },

        /* Legacy compat — prevent build errors */
        'border-light': 'rgba(0,0,0,0.06)',
        '1d1m-yellow': 'hsl(var(--warm-white))',
        '1d1m-black': 'hsl(var(--foreground))',

        /* havehad legacy colors → Notion-mapped */
        'hh-red': '#e5484d',
        'hh-green': '#2a9d99',
        'hh-blue': '#0075de',
        'hh-yellow': '#cb912f',
        'hh-orange': '#dd5b00',
        'hh-pink': '#b84f7a',
        'hh-purple': '#8854b8',
        'blue-bg': '#f2f9ff',
        'red-bg': '#fde8e8',
        'green-bg': '#e6f7f5',

        /* shadcn/ui semantic tokens */
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      boxShadow: {
        /* Notion-style multi-layer shadows */
        card: 'rgba(0,0,0,0.04) 0 4px 18px, rgba(0,0,0,0.027) 0 2px 7.85px, rgba(0,0,0,0.02) 0 0.8px 2.93px, rgba(0,0,0,0.01) 0 0.175px 1.04px',
        'card-hover': 'rgba(0,0,0,0.06) 0 6px 24px, rgba(0,0,0,0.04) 0 3px 10px, rgba(0,0,0,0.03) 0 1px 4px',
        panel: 'rgba(0,0,0,0.03) 0 2px 8px, rgba(0,0,0,0.02) 0 1px 3px',
        dropdown: 'rgba(0,0,0,0.01) 0 1px 3px, rgba(0,0,0,0.02) 0 3px 7px, rgba(0,0,0,0.02) 0 7px 15px, rgba(0,0,0,0.04) 0 14px 28px, rgba(0,0,0,0.05) 0 23px 52px',
        modal: 'rgba(0,0,0,0.01) 0 1px 3px, rgba(0,0,0,0.02) 0 3px 7px, rgba(0,0,0,0.02) 0 7px 15px, rgba(0,0,0,0.04) 0 14px 28px, rgba(0,0,0,0.05) 0 23px 52px',
        toast: 'rgba(0,0,0,0.04) 0 8px 30px, rgba(0,0,0,0.03) 0 4px 12px',
        subtle: 'rgba(0,0,0,0.03) 0 1px 2px',
      },
      fontFamily: {
        sans: ['Inter', '"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'page-title': ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.5px', fontWeight: '700' }],
        'section-heading': ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.25px', fontWeight: '700' }],
        'sub-heading': ['1.125rem', { lineHeight: '1.35', letterSpacing: '-0.125px', fontWeight: '600' }],
        'body-large': ['1rem', { lineHeight: '1.5', fontWeight: '500' }],
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['0.8125rem', { lineHeight: '1.4', fontWeight: '500' }],
        'badge': ['0.75rem', { lineHeight: '1.33', letterSpacing: '0.125px', fontWeight: '600' }],
        'micro': ['0.6875rem', { lineHeight: '1.33', letterSpacing: '0.125px', fontWeight: '400' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(-50%) translateY(8px)' },
          to: { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
        shimmer: {
          '0%': { opacity: '0.6' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0.6' },
        },
        'collapsible-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        'collapsible-up': {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'toast-in': 'toast-in 0.25s cubic-bezier(0.16,1,0.3,1)',
        shimmer: 'shimmer 1.5s infinite',
        'collapsible-down': 'collapsible-down 0.2s ease-out',
        'collapsible-up': 'collapsible-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
