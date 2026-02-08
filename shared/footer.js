/*
 * Moonshot CrossFit Footer Component
 * ===================================
 * Auto-injects the site footer into the page.
 *
 * Usage:
 *   Add this at the end of <body>, before closing </body>:
 *   <div id="site-footer"></div>
 *   <script src="/shared/footer.js"></script>
 *
 *   Or just include the script and it will append to body automatically.
 */

(function() {
    const currentYear = new Date().getFullYear();

    const footerHTML = `
    <footer class="bg-brand-dark py-12 border-t border-brand-gray/20">
        <div class="container mx-auto px-4">
            <!-- Logo and CTAs -->
            <div class="text-center mb-8">
                <picture>
                    <source srcset="/images/logo.webp" type="image/webp">
                    <img src="/images/logo-opt.png" alt="Moonshot CrossFit Logo" class="h-16 w-auto mx-auto mb-6" width="400" height="111">
                </picture>
                <div class="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6">
                    <a href="/intro/" class="btn btn-primary font-bold px-8 py-4 rounded-lg text-lg">Book Your Free Intro</a>
                    <a href="https://moonshotcrossfit.wodify.com/OnlineSalesPage/Main?q=Memberships%7CLocationId%3D9972" target="_blank" class="btn btn-secondary font-bold px-6 py-3 rounded-lg">View Memberships</a>
                </div>
            </div>

            <!-- Navigation Links -->
            <nav class="py-8 border-t border-brand-gray/20 flex flex-wrap justify-center gap-x-6 sm:gap-x-8 gap-y-4 text-brand-gray">
                <a href="/pt/" class="hover:text-brand-light transition-colors">Personal Training</a>
                <a href="/kids/" class="hover:text-brand-light transition-colors">Kids Program</a>
                <a href="/sarah/youthpt/" class="hover:text-brand-light transition-colors">Youth PT</a>
                <a href="/ecosystem/" class="hover:text-brand-light transition-colors">The Moonshot Ecosystem</a>
                <a href="/blog/" class="hover:text-brand-light transition-colors">Blog</a>
                <a href="/faq/" class="hover:text-brand-light transition-colors">FAQ</a>
                <a href="https://moonshotmp.com" target="_blank" rel="noopener noreferrer" class="hover:text-brand-light transition-colors">Moonshot Medical</a>
                <a href="https://moonshotmp.com/rehab" target="_blank" rel="noopener noreferrer" class="hover:text-brand-light transition-colors">Physical Therapy</a>
            </nav>

            <!-- Contact Info -->
            <div class="py-8 border-t border-brand-gray/20 grid md:grid-cols-3 gap-8 text-center md:text-left">
                <!-- Location -->
                <div>
                    <h3 class="text-brand-light font-bold text-sm uppercase tracking-wider mb-3">Location</h3>
                    <p class="text-brand-gray text-sm">542 Busse Hwy<br>Park Ridge, IL 60068</p>
                    <p class="text-brand-gray/70 text-xs mt-2">Less than 10 min from O'Hare</p>
                </div>

                <!-- Contact -->
                <div>
                    <h3 class="text-brand-light font-bold text-sm uppercase tracking-wider mb-3">Contact</h3>
                    <a href="tel:+18478507360" class="text-brand-gray hover:text-brand-light transition-colors text-sm block mb-1">(847) 850-7360</a>
                    <a href="mailto:info@moonshotcrossfit.com" class="text-brand-gray hover:text-brand-light transition-colors text-sm block">info@moonshotcrossfit.com</a>
                </div>

                <!-- Social -->
                <div>
                    <h3 class="text-brand-light font-bold text-sm uppercase tracking-wider mb-3">Follow</h3>
                    <div class="flex justify-center md:justify-start space-x-4">
                        <a href="https://www.instagram.com/moonshotcrossfit/" target="_blank" class="text-brand-gray hover:text-brand-light transition-colors" aria-label="Instagram">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                            </svg>
                        </a>
                        <a href="https://www.facebook.com/profile.php?id=100083694773367" target="_blank" class="text-brand-gray hover:text-brand-light transition-colors" aria-label="Facebook">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                            </svg>
                        </a>
                    </div>
                </div>
            </div>

            <!-- Copyright -->
            <div class="pt-8 border-t border-brand-gray/20 text-center text-brand-gray/70 text-sm">
                <p>&copy; ${currentYear} Moonshot CrossFit. All Rights Reserved.</p>
            </div>
        </div>
    </footer>
    `;

    // Inject footer
    const footerContainer = document.getElementById('site-footer');
    if (footerContainer) {
        footerContainer.innerHTML = footerHTML;
    } else {
        document.body.insertAdjacentHTML('beforeend', footerHTML);
    }
})();
