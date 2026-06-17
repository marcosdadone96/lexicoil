import type { Config } from 'tailwindcss';

/** Tailwind theme reads canonical CSS vars from assets/css/lexicoil-design-system.css */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand)',
          light: 'var(--brand-light)',
          dark: 'var(--brand-dark)',
        },
        teal: {
          DEFAULT: 'var(--teal)',
          light: 'var(--teal-light)',
        },
        navy: 'var(--lc-navy)',
        gray: {
          brand: 'var(--lc-gray)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'var(--lc-font)', 'Poppins', 'system-ui', 'sans-serif'],
        display: ['var(--font-poppins)', 'var(--lc-font)', 'Poppins', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        hero: 'var(--shadow-hero)',
        lg: 'var(--shadow-lg)',
      },
      borderRadius: {
        card: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
    },
  },
  plugins: [],
};

export default config;
