# MSCF Website

## Deployment
- **Repo:** https://github.com/Moonshotmp/mscf-website.git
- **Branch:** main
- **Deploy:** Push to main. Site is live at https://moonshotcrossfit.com/

## Stack
- Static HTML, no build step
- Tailwind CSS via `/shared/tailwind.css`
- Custom styles in `/shared/styles.css`
- Vanilla JS, no framework
- Google Fonts: Oswald + Poppins (preloaded)
- Google Analytics: G-Y74MV32LC2

## Structure
- `/shared/header.js` and `/shared/footer.js` — injected via script tags
- `/blog/` — blog posts, each in its own directory with `index.html`
- `/images/` — all images in webp format for fast loading
- `/sitemap.xml` — must be updated when adding new pages
- Geo landing pages at root: `/crossfit-des-plaines/`, `/crossfit-niles/`, etc.

## Blog Post Template
- JSON-LD: BreadcrumbList + Article schema
- Breadcrumb nav bar (bg-brand-slate, border-b border-gray-700)
- Article header: centered, category tag in brand-gold, H1 with section-title class
- Article body: `prose prose-invert max-w-none`, font-size 1.05rem
- H2s: inline `style="font-family: 'Oswald', sans-serif;"` with `text-2xl font-bold text-white mt-12 mb-4`
- Bold: `<strong class="text-brand-light">`
- Links: `class="text-brand-gold hover:underline"`
- Images: lazy loaded, `class="w-full rounded-lg shadow-lg"`, use webp format
- Every blog image should be unique across all posts — no duplicates
- Google Reviews bar (5.0 stars, 68 reviews)
- CTA box linking to `/intro/`
- Related articles grid (2 cards)

## When Adding Blog Posts
1. Create directory under `/blog/<slug>/index.html`
2. Add card to `/blog/index.html`
3. Add URL to `/sitemap.xml`
4. Use unique images — check existing usage before assigning
5. Convert any new images to webp with `cwebp -q 80`
6. Commit and push to main to deploy
