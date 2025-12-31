/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx,html}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'Poppins',
          'ui-sans-serif',
          'system-ui',
        ],
        heading: ['Poppins', 'Inter'],
        calsans: ['"Cal Sans"', 'Poppins', 'Inter', 'ui-sans-serif'],
        geom: ['"Geom"', 'Poppins', 'Inter', 'ui-sans-serif']
      }
    }
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['light'], // enforce DaisyUI light theme (white bg, black text)
    darkTheme: 'dark',
    base: true,
    styled: true,
    utils: true,
    logs: false,
    rtl: false,
    prefix: ''
  }
}
