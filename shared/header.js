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
    <header class="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10" id="navbar">
        <div class="container mx-auto px-4 flex justify-between items-center h-20">
            <a href="/" class="flex-shrink-0">
                <img src="/images/MoonshotLogo.png" alt="Moonshot CrossFit Logo" class="h-16 md:h-20 w-auto">
            </a>

            <!-- Desktop Navigation -->
            <nav class="hidden md:flex space-x-6 items-center text-white">
                <a href="/#what-makes-us-different" class="nav-link hover:text-brand-blue transition-colors text-sm uppercase tracking-wider">What We Offer</a>
                <a href="/pt/" class="nav-link hover:text-brand-blue transition-colors text-sm uppercase tracking-wider">Personal Training</a>
                <a href="/#memberships" class="nav-link hover:text-brand-blue transition-colors text-sm uppercase tracking-wider">Memberships</a>
                <a href="/#schedule" class="nav-link hover:text-brand-blue transition-colors text-sm uppercase tracking-wider">Schedule</a>

                <!-- Programs Dropdown -->
                <div class="relative inline-block" id="programs-menu-wrapper">
                    <button class="nav-link hover:text-brand-blue transition-colors text-sm uppercase tracking-wider flex items-center focus:outline-none"
                            id="programs-menu-button" aria-expanded="false" aria-haspopup="true">
                        Programs
                        <svg class="ml-1 h-4 w-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <div class="absolute left-0 mt-2 w-48 bg-black border border-white/10 shadow-xl rounded-lg hidden" id="programs-dropdown">
                        <div class="py-2">
                            <a href="/kids/" class="block px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5">Kids (5-10)</a>
                            <a href="/teen/" class="block px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 border-t border-white/5">Teen Athlete Prep (11-18)</a>
                            <a href="/challenge/" class="block px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 border-t border-white/5">6-Week Challenge</a>
                        </div>
                    </div>
                </div>

                <a href="/faq/" class="nav-link hover:text-brand-blue transition-colors text-sm uppercase tracking-wider">FAQ</a>
                <a href="/#contact" class="nav-link hover:text-brand-blue transition-colors text-sm uppercase tracking-wider">Contact</a>
                <a href="/intro/" class="btn btn-primary text-sm px-4 py-2 rounded-lg">Book Free Intro</a>
            </nav>

            <!-- Mobile Menu Button -->
            <button id="mobile-menu-btn" class="md:hidden text-white focus:outline-none" aria-label="Open mobile menu">
                <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
            </button>
        </div>

        <!-- Mobile Menu -->
        <div id="mobile-menu" class="hidden md:hidden bg-black/95 backdrop-blur-sm border-t border-white/10">
            <div class="px-4 py-4 space-y-1 text-center">
                <a href="/#what-makes-us-different" class="mobile-menu-link block py-3 text-white hover:text-brand-blue transition-colors">What We Offer</a>
                <a href="/pt/" class="mobile-menu-link block py-3 text-white hover:text-brand-blue transition-colors">Personal Training</a>
                <a href="/#memberships" class="mobile-menu-link block py-3 text-white hover:text-brand-blue transition-colors">Memberships</a>
                <a href="/#drop-in" class="mobile-menu-link block py-3 text-white hover:text-brand-blue transition-colors">Drop-Ins</a>
                <a href="/#schedule" class="mobile-menu-link block py-3 text-white hover:text-brand-blue transition-colors">Schedule</a>

                <!-- Programs Mobile Submenu -->
                <div>
                    <button id="mobile-programs-btn" class="w-full flex items-center justify-center py-3 text-white hover:text-brand-blue focus:outline-none">
                        <span>Programs</span>
                        <svg class="ml-2 h-4 w-4 transition-transform duration-200" id="mobile-programs-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <div id="mobile-programs-submenu" class="hidden bg-white/5 rounded-lg py-2 mt-1">
                        <a href="/kids/" class="block py-2 text-gray-300 hover:text-white text-sm">Kids Program (5-10)</a>
                        <a href="/teen/" class="block py-2 text-gray-300 hover:text-white text-sm">Teen Athlete Prep (11-18)</a>
                        <a href="/challenge/" class="block py-2 text-gray-300 hover:text-white text-sm">6-Week Challenge</a>
                    </div>
                </div>

                <a href="/faq/" class="mobile-menu-link block py-3 text-white hover:text-brand-blue transition-colors">FAQ</a>
                <a href="/#contact" class="mobile-menu-link block py-3 text-white hover:text-brand-blue transition-colors">Contact</a>

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

        // Mobile submenu toggle
        const mobileProgramsBtn = document.getElementById('mobile-programs-btn');
        const mobileProgramsSubmenu = document.getElementById('mobile-programs-submenu');
        const mobileProgramsArrow = document.getElementById('mobile-programs-arrow');

        if (mobileProgramsBtn && mobileProgramsSubmenu && mobileProgramsArrow) {
            mobileProgramsBtn.addEventListener('click', () => {
                mobileProgramsSubmenu.classList.toggle('hidden');
                mobileProgramsArrow.classList.toggle('rotate-180');
            });
        }

        // Desktop dropdown menu
        const programsWrapper = document.getElementById('programs-menu-wrapper');
        const programsBtn = document.getElementById('programs-menu-button');
        const programsDropdown = document.getElementById('programs-dropdown');

        if (programsWrapper && programsBtn && programsDropdown) {
            let closeTimer = null;

            const openMenu = () => {
                clearTimeout(closeTimer);
                programsDropdown.classList.remove('hidden');
                programsBtn.setAttribute('aria-expanded', 'true');
                const icon = programsBtn.querySelector('svg');
                if (icon) icon.classList.add('rotate-180');
            };

            const closeMenu = () => {
                closeTimer = setTimeout(() => {
                    programsDropdown.classList.add('hidden');
                    programsBtn.setAttribute('aria-expanded', 'false');
                    const icon = programsBtn.querySelector('svg');
                    if (icon) icon.classList.remove('rotate-180');
                }, 150);
            };

            programsWrapper.addEventListener('mouseenter', openMenu);
            programsWrapper.addEventListener('mouseleave', closeMenu);
            programsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (programsDropdown.classList.contains('hidden')) {
                    openMenu();
                } else {
                    closeMenu();
                }
            });

            // Close on click outside
            document.addEventListener('click', (e) => {
                if (!programsWrapper.contains(e.target)) {
                    programsDropdown.classList.add('hidden');
                }
            });
        }

        // Close dropdowns on escape
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
