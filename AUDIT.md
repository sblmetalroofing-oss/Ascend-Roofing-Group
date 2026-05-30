# Ascend Roofing Group — Website Audit (2026-05-30)

A "gold-standard" audit of the static site (Vercel + serverless `api/`). Priority per owner: **SEO & traffic growth**, deliver **audit first then phased fixes**, **no business data supplied** (real values flagged `TODO(owner)`), best-practice latitude.

Findings were produced by three audit passes and then **independently re-verified**. Several agent claims turned out to be false positives and are listed as corrected so they don't drive wasted work.

## Scoring

| Area | Grade | Headline |
|------|-------|----------|
| Indexing / SEO foundation | B | Strong basics; fabricated reviews + thin top-down internal links hold it back |
| Structured data | B+ | Valid JSON-LD everywhere; suburb pages have breadcrumbs+FAQ; homepage carries fake reviews |
| Analytics | D | GA never installed (placeholder on 316+ pages); only Vercel analytics live |
| Performance | B | Good vanilla JS/CSS; images unoptimised (3 MB, no AVIF/WebP) |
| Accessibility | C+ | Labels/semantics good; focus outline removed; footer contrast low |
| Trust / E-E-A-T | C | No QBCC#/ABN shown; placeholder team avatars; unverifiable testimonials |
| Security | C | Exposed Maps key (verify restriction); plaintext PII in Postgres; no rate-limit on submit-quote |
| Code quality | C+ | Redundant PowerShell build; inline styles; enrichment not wired into build |

---

## Corrected false positives (do NOT action)
- **"Trailing comma → invalid JSON-LD on every page"** — FALSE. All `application/ld+json` blocks parse valid (0 invalid across every hand-written, blog, suburb, and template page).
- **"faq.html has no `<h1>`"** — FALSE. It has a proper `<h1>` (faq.html:106); grep missed it due to an inline `style=` attribute.
- **"`initAddressAutocomplete` undefined on generated pages"** — FALSE. It's defined inline in `template.html:706` and the Maps callback references it correctly.

---

## CONFIRMED — Phase 0 (safe, high-impact, no business data needed)

### S1. Fabricated review schema on homepage — POLICY RISK *(fixed in this PR)*
`index.html:69-82` ships a `review` array with invented authors (Mark K., Sarah R.). Google's review-snippet policy forbids self-serving/fake reviews; this risks a manual action and is the single most dangerous item found. → **Remove the fake `review` array** from JSON-LD. Re-add a real `aggregateRating`+`review` later from genuine Google reviews (`TODO(owner)`). The visible testimonial cards in the page body are marketing copy and can stay for now, but should also be replaced with real, attributed reviews (Phase 3).

### S2. Five service pages missing social/OG metadata *(fixed in this PR)*
`roof-repairs-brisbane.html`, `gutters-downpipes-brisbane.html`, `new-roof-installation-brisbane.html`, `roof-insulation-brisbane.html`, `skylights-whirlybirds-brisbane.html` each have only `og:title/type/url` — no `og:description`, `og:image`, `og:image:width/height`, or any `twitter:*`. → Add full OG + Twitter card + `og:site_name`/`og:locale=en_AU`, reusing the existing hero image.

### S3. Encoding mojibake *(fixed in this PR)*
`faq.html:111` (and similar) contain a double-encoded apostrophe (`Australia\xe2\x80&trade;s`). → Replace with a clean `'`. Sweep other hand-written pages.

### S4. Enrichment lost on rebuild — wire into build *(fixed in this PR)*
`node build.js` regenerates suburb pages from `template.html`, **wiping** the local-context content added in PR #11 (`scripts/enrich-service-areas.cjs`). Confirmed: `build.js`/`package.json` have no knowledge of enrichment. → Chain enrichment as a post-build step in `package.json` (`"build": "node build.js && node scripts/enrich-service-areas.cjs"`) so regeneration is safe.

### S5. Focus-visible accessibility *(fixed in this PR)*
`styles.css:975` sets `outline: none` on focus with only a box-shadow fallback → fails WCAG 2.4.7 for keyboard users. → Add a visible `:focus-visible` outline.

### S6. Google Analytics disabled *(documented; needs owner)*
316 suburb pages + `template.html` + `locations.html` carry a commented-out GA snippet with literal `YOUR_ID_HERE`. No analytics on the core funnel. → Owner to supply a GA4 ID; then wire a single include via the template. Left as `TODO(owner)` — no fake ID shipped.

---

## CONFIRMED — Phase 1 (internal linking & crawl architecture)
- Homepage links to only ~4 suburb pages + `locations.html`; add curated region links from home + each service page, and blog→service/suburb links, to feed the 278 "Discovered – not indexed" URLs.
- Add `BreadcrumbList` to the hand-written service pages (suburb pages already have it).
- Resolve the root orphan `blog-colorbond-roof-replacement-brisbane-gold-coast.html` (not in sitemap): 301 → `blog/` equivalent or canonicalise.
- Cross-link the 5 blog posts.

## CONFIRMED — Phase 2 (Core Web Vitals; 60% mobile)
- 7 images, ~3 MB, JPG/PNG only (400–600 KB each). Convert hero/gallery/OG to AVIF/WebP with `<picture>` fallback + `srcset`.
- Add `apple-touch-icon` + `site.webmanifest` + `theme-color`; favicon is a 57 KB PNG.
- Reduce `quote.html` (55 KB) by extracting inline CSS/JS; trim dead CSS rules (`.hero-overlay`, `.hero-pattern`, etc.).

## CONFIRMED — Phase 3 (E-E-A-T / trust — needs owner data)
- Add real QBCC licence # + ABN to footer + schema; add `sameAs` socials.
- Replace templated testimonials with genuine attributed reviews + valid review schema.
- Real team photos/bios; warranty terms, process timeline, financing pages.

## CONFIRMED — Phase 4 (hardening — reported)
- Verify the exposed Maps browser key (`AIzaSy…F4Zc`) is HTTP-referrer + API restricted in Google Cloud, or rotate + proxy via existing `api/places-autocomplete.js`.
- Encrypt PII at rest (TFN, bank, ID) in `api/submit-new-employee.js` / `api/submit-subby-pack.js`.
- Add rate limiting to `api/submit-quote.js` (parity with `api/roof-quote.js`).
- Retire `generate_pages.ps1` / `generate_sitemap.ps1` (superseded by `build.js`).

---

## Verification performed
- JSON-LD: node parser over every `application/ld+json` block on all page types → 0 invalid.
- Headings, OG tags, autocomplete defs, focus CSS, encoding bytes → confirmed by direct file reads (see PR).
- Post-fix: re-parse JSON-LD (0 invalid), `node build.js && enrich` keeps suburb local-content, `npm test` green.
