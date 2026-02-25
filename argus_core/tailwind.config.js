// @ts-check
const { fontFamily } = require('tailwindcss/defaultTheme');
const { colors: customColors } = require('./data/config/colors');

/** @type {import("tailwindcss").Config } */
module.exports = {
  content: [
    './node_modules/@shipixen/pliny/**/*.js',
    './app/**/*.{js,ts,jsx,tsx,css,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,css,mdx}',
    './components/**/*.{js,ts,jsx,tsx,css,mdx}',
    './layouts/**/*.{js,ts,jsx,tsx,css,mdx}',
    './demo/**/*.{js,ts,jsx,tsx,css,mdx}',
    './data/**/*.mdx',
  ],
  darkMode: ['class'],
  theme: {
    extend: {
      lineHeight: {
        11: '2.75rem',
        12: '3rem',
        13: '3.25rem',
        14: '3.5rem',
      },
      fontFamily: {
        sans: ['var(--font-urbanist)', ...fontFamily.sans],
        mono: ['var(--font-mono)', ...fontFamily.mono],
        display: ['var(--font-urbanist)', ...fontFamily.sans],
      },
      colors: {
        // Map strict palette
        primary: {
          ...customColors.primary,
          DEFAULT: customColors.primary[500],
          foreground: '#ffffff',
        },
        secondary: {
          ...customColors.secondary,
          DEFAULT: customColors.secondary[500],
          foreground: '#ffffff',
        },
        tertiary: {
          ...customColors.tertiary,
          DEFAULT: customColors.tertiary[500],
        },
        gray: customColors.gray,

        // Semantic mappings
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',

        // Shadcn/Theme compatibility
        foreground: 'var(--foreground)',
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
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            a: {
              color: theme('colors.primary.500'),
              '&:hover': {
                color: `${theme('colors.primary.600')}`,
              },
              code: { color: theme('colors.primary.400') },
            },
            'h1,h2': {
              fontWeight: '700',
              letterSpacing: theme('letterSpacing.tight'),
            },
            h3: {
              fontWeight: '600',
            },
            code: {
              color: theme('colors.indigo.500'),
            },
          },
        },
        invert: {
          css: {
            a: {
              color: theme('colors.primary.500'),
              '&:hover': {
                color: `${theme('colors.primary.400')}`,
              },
              code: { color: theme('colors.primary.400') },
            },
            'h1,h2,h3,h4,h5,h6': {
              color: theme('colors.gray.100'),
            },
          },
        },
      }),
      screens: {
        '2xl': '1400px',
      },
      // Keep existing animations
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in-down': 'fade-in-down 0.6s ease-in-out forwards',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
