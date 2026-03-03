/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './**/*.html',
    './shared/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#101921',
          light: '#F0EEE9',
          gray: '#B2BFBE',
          slate: '#2C353E',
          gold: '#B8986E',
          blue: '#8cb2f5',
          'blue-light': '#a8c5f7'
        }
      },
      fontFamily: {
        heading: ['Oswald', 'sans-serif'],
        body: ['Poppins', 'sans-serif']
      }
    }
  }
};
