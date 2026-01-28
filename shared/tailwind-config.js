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
                    blue: '#8cb2f5',      // moonlight blue - primary
                    'blue-light': '#a8c5f7', // hover state
                    dark: '#000000',      // background black
                    card: '#111827',      // card/component backgrounds
                    border: '#374151',    // borders
                    light: '#FFFFFF',     // primary text
                    gray: '#9CA3AF',      // secondary text (gray-400)
                    'gray-light': '#D1D5DB' // lighter gray (gray-300)
                }
            },
            fontFamily: {
                heading: ['Oswald', 'sans-serif'],
                body: ['Poppins', 'sans-serif']
            }
        }
    }
};
