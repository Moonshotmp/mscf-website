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

## HYROX Race Simulation (`/hyrox/simulation/`)
Event page + registration + package builder. Built 2026-08-25 for the Oct 3, 2026 event; Singles division added 2026-09-01.
- **Divisions:** the chosen heat decides the division (`heat.division`). Singles heats (`s01–s06`, 7:00–7:50 AM, doors 6:30/briefing 6:45) take ONE athlete — `team.athletes.partner` is `null` and no partner invite/link exists. Doubles heats (`h01–h16`, 8:10–10:40) unchanged. Teams predating divisions have no `division` field → treated as doubles (`teamDivision()`). Capacity everywhere = entries per heat (2), where one entry = a singles athlete or a doubles team.
- **Single source of truth:** `netlify/functions/_shared/hyrox.mjs` — event date, heats + capacity + division schedule (`EVENT.schedule`), prices, member code, clinic booking slugs. Edit there; the page fetches `/.netlify/functions/hyrox-config` and overwrites its static copy. (Static fallbacks: `hyrox/simulation/index.html` `data-price` spans and `app.js` `FALLBACK`.)
- **Flow:** `hyrox-checkout` (team record in Netlify Blobs `hyrox-teams`, 35-min heat hold, one Stripe Checkout with race entries + add-ons) → `stripe-webhook` (`metadata.kind=hyrox_*`) marks paid, issues clinic certificate codes, emails registrant + partner invite + team → `success.html`. Partner link (`partner.html?team=&t=` HMAC) → `hyrox-partner` (confirm + waiver, optional add-on purchase → Blobs `hyrox-orders`). `hyrox-cancel` releases the heat hold on Stripe cancel. `hyrox-roster?key=` = CSV heat sheets. `hyrox-resend?key=&team=<id|demo|demo-singles>&which=registrant|partner|team|all[&to=]` resends/previews emails.
- **Clinic integration:** add-ons are certificates; booking links go to `https://moonshot.moonshotclinic.com/book/hyrox-{dexa,labs,baseline,nutrition}` with the code in `utm_campaign`. Those booking configs must exist on the Moonshot Medical tenant with `requires_prepayment = FALSE` (otherwise the booker charges again). Front desk honors the code at $0 from the certificate ledger in the team email. The `nutrition` add-on (Sarah's one-time Jumpstart consult, $195 event / $225 regular; added 2026-08-31) redeems the `hyrox-nutrition` config with Sarah — an independent certificate, not part of the DEXA+labs `baseline` bundle.
- **Env (Netlify site):** reuses `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SES_*` from the fob flow. Optional: `HYROX_LINK_SECRET` (partner-link HMAC; falls back to `STRIPE_WEBHOOK_SECRET`), `HYROX_ADMIN_KEY` (roster CSV; unset = 404), `HYROX_TEST_TOKEN` ($1 smoke test via `?test_token=` on the page), `HYROX_MEMBER_CODE` (default `MoonRox60`), `HYROX_NOTIFY_TO`, `HYROX_CLINIC_BOOK_BASE`, `HYROX_BOOK_SLUG_*`.
- Tailwind content globs include `./hyrox/**/*.js`; rebuild `shared/tailwind.css` after editing classes (`npx tailwindcss -i src/input.css -o shared/tailwind.css --minify`).
