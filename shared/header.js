/*
 * Moonshot CrossFit Header Component
 * ===================================
 * Auto-injects the site header into the page.
 *
 * Usage:
 *   Add this at the start of <body>:
 *   <div id="site-header"></div>
 *   <script src="/shared/header.js"></script>
 *
 *   Or just include the script and it will prepend to body automatically.
 */

(function() {
    const headerHTML = `
    <header class="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-brand-gray/20" id="navbar">
        <div class="container mx-auto px-4 flex justify-between items-center h-20">
            <a href="/" class="flex-shrink-0">
                <img src="/images/MoonshotLogo.png" alt="Moonshot CrossFit Logo" class="h-16 md:h-20 w-auto">
            </a>

            <!-- Desktop Navigation -->
            <nav class="hidden md:flex space-x-6 items-center text-brand-light font-heading">
                <a href="/#memberships" class="nav-link hover:text-brand-gray transition-colors text-base uppercase tracking-wide">Memberships</a>
                <a href="/pt/" class="nav-link hover:text-brand-gray transition-colors text-base uppercase tracking-wide">Personal Training</a>
                <a href="/#schedule" class="nav-link hover:text-brand-gray transition-colors text-base uppercase tracking-wide">Schedule</a>
                <a href="/kids/" class="nav-link hover:text-brand-gray transition-colors text-base uppercase tracking-wide">Kids</a>
                <a href="/#drop-in" class="nav-link hover:text-brand-gray transition-colors text-base uppercase tracking-wide">Drop In</a>
                <a href="/#contact" class="nav-link hover:text-brand-gray transition-colors text-base uppercase tracking-wide">Contact</a>
                <a href="/intro/" class="btn btn-primary text-sm px-4 py-2 rounded-lg font-body font-bold">Book Free Intro</a>
            </nav>

            <!-- Mobile Menu Button -->
            <button id="mobile-menu-btn" class="md:hidden text-brand-light focus:outline-none" aria-label="Open mobile menu">
                <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
            </button>
        </div>

        <!-- Mobile Menu -->
        <div id="mobile-menu" class="hidden md:hidden bg-black/95 backdrop-blur-sm border-t border-brand-gray/20">
            <div class="px-4 py-4 space-y-1 text-center">
                <a href="/#memberships" class="mobile-menu-link block py-3 text-brand-light hover:text-brand-gray transition-colors">Memberships</a>
                <a href="/pt/" class="mobile-menu-link block py-3 text-brand-light hover:text-brand-gray transition-colors">Personal Training</a>
                <a href="/#schedule" class="mobile-menu-link block py-3 text-brand-light hover:text-brand-gray transition-colors">Schedule</a>
                <a href="/kids/" class="mobile-menu-link block py-3 text-brand-light hover:text-brand-gray transition-colors">Kids</a>
                <a href="/#drop-in" class="mobile-menu-link block py-3 text-brand-light hover:text-brand-gray transition-colors">Drop In</a>
                <a href="/#contact" class="mobile-menu-link block py-3 text-brand-light hover:text-brand-gray transition-colors">Contact</a>

                <div class="pt-4 space-y-3">
                    <a href="/intro/" class="block w-full btn btn-primary text-center px-4 py-3 rounded-lg">Book Your Free Intro</a>
                    <a href="https://moonshotcrossfit.wodify.com/OnlineSalesPage/Main?q=Memberships%7CLocationId%3D9972" target="_blank" class="block w-full btn btn-secondary text-center px-4 py-3 rounded-lg">Sign Up Now</a>
                </div>
            </div>
        </div>
    </header>

    <!-- Spacer to prevent content from hiding under fixed header -->
    <div class="h-20"></div>
    `;

    // Inject header
    const headerContainer = document.getElementById('site-header');
    if (headerContainer) {
        headerContainer.innerHTML = headerHTML;
    } else {
        document.body.insertAdjacentHTML('afterbegin', headerHTML);
    }

    // Initialize header interactions after DOM is ready
    function initHeaderInteractions() {
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuLinks = document.querySelectorAll('.mobile-menu-link');

        // Mobile menu toggle
        if (mobileMenuBtn && mobileMenu) {
            mobileMenuBtn.addEventListener('click', () => {
                mobileMenu.classList.toggle('hidden');
                // Close submenus when closing main menu
                if (mobileMenu.classList.contains('hidden')) {
                    document.querySelectorAll('#mobile-menu [id$="-submenu"]').forEach(el => el.classList.add('hidden'));
                    document.querySelectorAll('#mobile-menu [id$="-arrow"]').forEach(el => el.classList.remove('rotate-180'));
                }
            });
        }

        // Close mobile menu on link click
        mobileMenuLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
            });
        });

        // Close menu on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('[id$="-dropdown"]').forEach(el => el.classList.add('hidden'));
                if (mobileMenu) mobileMenu.classList.add('hidden');
            }
        });
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeaderInteractions);
    } else {
        initHeaderInteractions();
    }
})();
