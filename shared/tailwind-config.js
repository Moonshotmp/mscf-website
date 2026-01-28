/*
 * Moonshot CrossFit Tailwind Configuration
 * =========================================
 * Include this AFTER the Tailwind CDN script and BEFORE using Tailwind classes.
 *
 * Usage in <head>:
 *   <script src="https://cdn.tailwindcss.com"></script>
 *   <script src="/shared/tailwind-config.js"></script>
 */

tailwind.config = {
    theme: {
        extend: {
            colors: {
                brand: {
                    dark: '#101921',      // dark blue-black background
                    light: '#F0EEE9',     // warm cream text
                    gray: '#B2BFBE',      // muted sage gray
                    slate: '#2C353E',     // dark slate for cards
                    // Keep moonlight blue as accent option
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
