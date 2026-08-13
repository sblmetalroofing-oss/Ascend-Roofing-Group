# Ascend Roofing Group — Website Audit (2026-07-10)

Full-site re-audit, six weeks after the 2026-05-30 audit and after PRs #13–#20 landed. Four independent audit passes (SEO/content/structured-data, security/API, frontend/accessibility/performance, build/infra/tests); every finding below was verified against actual file content — contrast ratios computed from the real CSS values, every JSON-LD block parsed with node, `npm test` and `npm audit` executed, and a sandboxed `npm run build` diffed against the committed output.

Previous audit (2026-05-30) is preserved in git history at commit `900df37^`.

## Scoring

| Area | 2026-05-30 | Now | Headline |
|------|-----------|-----|----------|
| Indexing / SEO foundation | B | B− | 6 money pages missing from sitemap; home/roof-replacement cannibalization; duplicate FAQ schema |
| Structured data | B+ | B | JSON-LD all valid, fake review schema stayed out — but 3 pages carry duplicate, contradictory FAQPage blocks |
| Analytics | D | D | GA4 still `YOUR_ID_HERE` on 316+ pages; locations.html has zero analytics at all |
| Performance | B | B− | AVIF/WebP shipped but only used on the homepage; hero LCP still a 469 KB JPG; no cache headers |
| Accessibility | C+ | C+ | focus-visible fixed; but no `<main>`/skip link anywhere, CTA buttons fail contrast, menu lacks ARIA |
| Trust / E-E-A-T | C | C− | QBCC number added (good) — but PR #20 shipped placeholder "5.0 / 150+ reviews" claims as fact |
| Security | C | C | No injection anywhere (verified); but PII still plaintext, Maps key never rotated, rate limiting still absent |
| Code quality | C+ | B− | Enrichment wired in, build deterministic; but test suite is red, build exits 0 on failure, no CI |

## Top 10 actions, in order

1. **Remove or verify the "Rated 5.0 on Google / 150+ verified reviews" claims** on index.html (H-TRUST-1) — legal/policy exposure, added in PR #20.
2. **Fix 404.html asset paths** (C-FE-1) — the 404 page is broken for every nested URL, which is where most 404s happen.
3. **Add the 6 hand-written service pages to the sitemap** in build.js and rebuild (H-SEO-1).
4. **Rotate the Google Maps key** hardcoded in api/roof-quote.js and proxy or restrict it (H-SEC-2).
5. **Encrypt TFN/bank/ID data and mask it in emails** (H-SEC-1) — Privacy Act exposure.
6. **Add one durable rate-limit helper** and apply it to all six API endpoints (H-SEC-3).
7. **Fix the failing test, make build.js exit non-zero on failure, add a CI workflow** (H-BUILD-1/2).
8. **Merge the duplicate contradictory FAQPage schema blocks** on 3 service pages and reconcile price ranges site-wide (H-SEO-2).
9. **Install GA4** (owner to supply ID — still the single biggest measurement gap).
10. **Ship the `<picture>`/AVIF markup beyond the homepage** and fix the hero LCP image (H-PERF-1).

---

## Status of the 2026-05-30 audit items

| Item | Status | Evidence |
|---|---|---|
| S1 fake review JSON-LD | **Fixed** — but see H-TRUST-1: PR #20 re-introduced unverified review *claims* in visible copy | 0 `review`/`aggregateRating` in any JSON-LD (full parser sweep) |
| S2 OG/Twitter on 5 service pages | **Fixed** on those 5; not extended site-wide (L-SEO-1) | grep |
| S3 mojibake | **Fixed** (zero `â€`/`Ã` bytes) — new instance found: literal `??` in colour-confirmation.html:798-800 (M-FE-4) | |
| S4 enrichment wired into build | **Fixed** | package.json:7; rebuild reproduces committed pages byte-identically |
| S5 focus-visible | **Fixed** | styles.css:987-997 |
| S6 GA4 | **Not fixed** | `YOUR_ID_HERE` still commented on template.html:37-43, locations.html:21-27, all 316 suburb pages |
| Phase 1 home→suburb links | **Fixed** (35 suburbs, 5 region blocks, index.html:772-826) | |
| Phase 1 BreadcrumbList on service pages | **Fixed** (all 6) | |
| Phase 1 root blog orphan | **Partial** — in sitemap + linked from blog index; still at root, duplicate intent vs the blog cost guide (M-SEO-4) | |
| Phase 1 blog cross-links | **Partial** — 2 of 7 posts have zero sibling links (L-SEO-5) | |
| Phase 1 service→suburb links | **Partial** — 5 of 6 done; skylights page has 0 suburb links (M-SEO-5) | |
| Phase 2 AVIF/WebP | **Partial** — variants generated for all photos but `<picture>` used only on index.html; hero bg still the 469 KB JPG (H-PERF-1, M-PERF-1) | |
| Phase 2 favicon/manifest | **Partial** — complete on index + suburb pages; 11 other pages still use the 58 KB PNG favicon with no manifest (L-PERF-2) | |
| Phase 2 quote.html inline extraction / dead CSS | **Not done** (L-PERF-3) | 16 KB inline style + 13 KB inline script measured |
| Phase 3 QBCC in footer | **Fixed** (PR #16) — ABN still reads "ABN Registered" with no number; QBCC not in schema (L-SEO-6) | |
| Phase 3 real testimonials | **Not fixed** — same invented personas on index + all 316 suburb pages, now joined by the "150+ reviews" claim | |
| Phase 4 Maps key restrict/rotate | **Not fixed** — same key still hardcoded (H-SEC-2); autocomplete was proxied (PR #17) but the key was never rotated | |
| Phase 4 PII encryption | **Not fixed** (H-SEC-1) | |
| Phase 4 rate-limit submit-quote | **Not fixed** (H-SEC-3) | |
| Phase 4 retire PowerShell scripts | **Not fixed** — and generate_sitemap.ps1 uses the wrong domain; running it would clobber the sitemap (M-BUILD-6) | |

---

## CRITICAL

### C-FE-1. 404 page is broken for every nested URL
`404.html:15-16,34-36,53` use relative paths (`styles.css`, `script.js`, `./images/…`, `roof-replacement.html`). Vercel serves the 404 at the requested path, so a miss under `/service-areas/…` or `/blog/…` — the most likely 404 sources given 316 suburb URLs and a live redirect rule — renders with no CSS, no JS, a broken logo, and nav links that 404 again. **Fix:** make every href/src in 404.html root-absolute (`/styles.css`, `/quote.html`, …).

## HIGH — Trust / legal

### H-TRUST-1. PR #20 shipped placeholder review/rating claims as fact
`index.html:227-228` ("5.0 Google Rating / 150+ verified reviews") and `index.html:680-686` ("Rated 5.0 on Google … Based on 150+ verified customer reviews"). The PR #20 commit message itself says these numbers are *placeholders to be confirmed*, and they contradict `quote.html:990` ("Rated by 100+ homeowners"). The four testimonial cards (`index.html:689-736`) still use invented personas ("Mark K.", "Sarah R." — the same names removed from JSON-LD in PR #13), and `{{TESTIMONIALS_GRID}}` stamps three of them onto all 316 suburb pages. A "Rated 5.0 on Google" claim is checkable against the Google Business Profile in seconds; if false it is ACL misleading-conduct exposure and an E-E-A-T/quality-rater red flag. The "Lifetime Workmanship Guarantee" (`index.html:245,525`) is also unconfirmed wording per the same commit. **Fix:** replace with the real GBP rating/count or remove the numbers until confirmed (`TODO(owner)`); align index/quote claims; owner to confirm guarantee terms; replace testimonials with real attributed reviews.

## HIGH — Security

### H-SEC-1. TFN, bank details, DOB and ID documents stored and emailed in plaintext *(carried over)*
`api/submit-new-employee.js:106-153` inserts `tfn`, `bsb`, `account_number`, `date_of_birth` unencrypted (`schema.sql:54,61-62`); the full TFN and bank details go into email HTML (`:223,238-240`) with photo-ID/white-card scans attached (`:172-181`). Same for `api/submit-subby-pack.js:87-111,268-278`. A compromise of the DB, the Resend account, or the business inbox exposes identity-theft-grade data — Privacy Act / APP 11, likely Notifiable Data Breach territory. **Fix:** app-layer encryption (AES-256-GCM key in env, or pgcrypto) for TFN/bank columns; mask to last 3–4 digits in email; set a retention/deletion policy.

### H-SEC-2. Google Maps key still hardcoded and never rotated *(carried over)*
`api/roof-quote.js:74` — `FRONTEND_API_KEY: "AIzaSy…F4Zc"`, the exact key flagged in the last audit. PR #17 removed browser Maps JS and proxied autocomplete, but this key ships to every quote requester inside the Static Maps `image_url` (`:263-270`, returned at `:640-650`, rendered at `quote.html:1173`) and remains in git history. **Fix:** rotate; serve the static map via a server proxy (like places-autocomplete), or env-var it with Static-Maps-only + referrer + quota restrictions verified in Google Cloud Console.

### H-SEC-3. No effective rate limiting → cost abuse on paid APIs *(carried over, broadened)*
The only gate on state-changing endpoints is `verifyOrigin` (`lib/verify-origin.js:29-38`) — a header check any curl loop can spoof. Consequences:
- `/api/submit-subby-pack` triggers up to **3 Claude vision calls per request** (`submit-subby-pack.js:63-80`) plus Resend email plus DB writes, unauthenticated and unlimited.
- `/api/places-autocomplete` has **no rate limit at all** despite existing purely to protect the billable Places API (`places-autocomplete.js:8-11`).
- `/api/submit-quote`, `/api/submit-colour`, `/api/submit-new-employee` — no limiter (each call = Nominatim geocode + Resend email; Nominatim bans abusive callers, which would also break roof-quote's fallback geocoding).
- `roof-quote`'s limiter is an in-memory Map (`roof-quote.js:10-26`) — empty on every cold start/instance, best-effort only. Its Solar API call also fires before the serviceable-area check when the address lacks a `4xxx` postcode (`roof-quote.js:594-634`).

**Fix:** one durable per-IP rate-limit helper (Vercel KV / Upstash) applied to all six endpoints; server-side size caps on uploads; consider a shared-secret link token for the two internal HR forms; reject roof-quote requests whose postcode can't be resolved.

### H-SEC-4. Vulnerable dependencies (npm audit: 3 high)
`form-data` 4.0.0–4.0.5 — CRLF injection via unescaped filenames (GHSA-hmw2-7cc7-3qxx; relevant because user-controlled filenames flow into email attachments). `ws` 8.0.0–8.20.1 via `@vercel/postgres@0.5.1` — DoS + memory-disclosure advisories. **Fix:** `npm audit fix`; upgrade `@vercel/postgres` to ≥0.10.0 (breaking — retest the three DB handlers); bump `@anthropic-ai/sdk` (0.39 is far behind) opportunistically.

## HIGH — SEO

### H-SEO-1. All 6 hand-written service pages missing from sitemap.xml
`build.js:441-533` hardcodes the static URL list and was never updated when the service pages were added — `roof-replacement.html`, `roof-repairs-brisbane.html`, `gutters-downpipes-brisbane.html`, `new-roof-installation-brisbane.html`, `roof-insulation-brisbane.html`, `skylights-whirlybirds-brisbane.html` are the only indexable money pages absent (verified by sitemap↔filesystem diff, 331 URLs). The highest-value commercial pages are excluded while 316 thin suburb pages are included. **Fix:** add them to the static list (priority ~0.8) and rebuild.

### H-SEO-2. Duplicate, contradictory FAQPage schema on 3 service pages
`roof-repairs-brisbane.html:32-37`, `gutters-downpipes-brisbane.html:29-34`, `roof-insulation-brisbane.html:29-34` each carry **two** FAQPage blocks with different answers to the same question (e.g. gutters: "$2,500–$6,000" vs "$1,500–$5,000") and the second block's questions appear nowhere in visible HTML. Google requires FAQ markup to mirror visible content and expects one FAQPage per page — this risks spammy-structured-markup treatment. **Fix:** merge to a single FAQPage per page that exactly mirrors the visible FAQ; reconcile the prices.

### H-SEO-3. GA4 still not installed *(carried over — owner-blocked)*
Commented `YOUR_ID_HERE` gtag on template + all 316 suburb pages + locations.html; **locations.html also lacks even the Vercel insights script** (the only page with zero analytics). Owner to supply GA4 ID; wire via template + build.js + hand-written pages.

### H-SEO-4. Homepage and roof-replacement.html cannibalize the same keyword
`index.html:9` title "Roof Replacement Brisbane & Gold Coast | …" and h1 (`:173`) target exactly what `roof-replacement.html:16` targets. **Fix:** re-position the homepage around the brand + broader "Metal Roofing Brisbane & Gold Coast"; keep roof-replacement.html as the keyword page.

## HIGH — Build & tests

### H-BUILD-1. build.js swallows errors and exits 0 — a broken build can deploy silently
`build.js:554` — `build().catch((err) => console.error(err))` never sets a non-zero exit code. A malformed suburbs.json would print an error, exit 0, let enrichment stamp fresh lastmods onto stale pages, and deploy. **Fix:** `process.exitCode = 1` in the catch.

### H-BUILD-2. Test suite is red (161/162) and there is no CI
`__tests__/roof-quote.test.js:339-349` still expects `available === false`, but PR #19 made `calculateQuote()` always return `available: true` with `estimate_basis: "typical"` (`api/roof-quote.js:290-388`). Stale expectation, not a product bug — but a permanently red suite trains everyone to ignore failures, and `.github/` doesn't exist so nothing runs tests on push. **Fix:** update the test; add a minimal GitHub Actions workflow running `npm test`.

## HIGH — Frontend / accessibility / performance

### H-FE-1. No skip link and no `<main>` landmark anywhere except quote.html
Verified 0 `<main>` on index, template (→316 pages), locations, all service/blog/legal pages and forms; no skip link site-wide. WCAG 2.4.1/1.3.1. **Fix:** skip link + `<main id="main">` in template.html and hand-written pages; rebuild.

### H-FE-2. Mobile menu is not a proper disclosure
`index.html:135` (same on every page): toggle button has no `aria-expanded`/`aria-controls`; `script.js:20-50` toggles classes only — no Escape close, no focus containment. WCAG 4.1.2. **Fix:** set `aria-expanded` in open/close, add `aria-controls="navMenu"`, close on Escape, return focus.

### H-FE-3. Colour-contrast failures on the site's primary CTA and footer (computed)
- White on `#007bff` = **3.98:1** — fails AA for `.btn-primary` (styles.css:181-184), `.nav-cta` (:309-316), `.qf-submit`, `.qr-cta-primary` (quote.html), `.floating-phone-cta` (styles.css:1992-2008) — the main conversion color.
- Footer-bottom `#666` on `#111` = **3.29:1** at 12.8px (styles.css:1239-1246), including the QBCC licence line.
- Accent links on card backgrounds: 4.09:1 / 4.37:1 (styles.css:1946, :1707-1710).

**Fix:** darken the button blue to ~`#0056b3`–`#0067d6`; lighten footer-bottom text to ≥`#8a8a8a`; brighten card links to ≥`#3b96ff`. (`--text-muted` #999 and hero accent #60a5fa pass — verified.)

### H-PERF-1. Hero/LCP is still an unoptimized 469 KB CSS-background JPG
`styles.css:364-366` hardcodes `url("./images/20240307_171821.jpg")` (469 KB) while the 261 KB AVIF sits unused; as a CSS background it gets no preload/fetchpriority and its discovery waits on CSS parse — on a 60 %-mobile audience. No `srcset`/`sizes` anywhere on the site. **Fix:** `image-set()` or a `<picture>`-based `<img fetchpriority="high">` + `<link rel="preload" as="image">` + an ~800 px mobile crop.

---

## MEDIUM

**M-SEO-1. Contradictory replacement-cost figures, including schema↔visible mismatch on the same page.** index.html:83,750 "$15,000–$26,000+"; roof-replacement.html JSON-LD (:57) "$15,000–$35,000+" vs its own visible FAQ (:458) "$12,000–$45,000+" vs its table (:327,331). Pick one canonical 2026 range and propagate (schema + visible + blog).

**M-SEO-2. Duplicate suburbs → duplicate pages/sitemap URLs.** Calamvale twice (suburbs.json:533,543), Elanora twice (:608,1493) → duplicate `<loc>` entries and doubled locations.html links. build.js has no slug de-dup (the enrich script does). Remove the dupes; add a `seenSlugs` guard.

**M-SEO-3. Two stale orphan suburb pages.** `service-areas/roofing-logan.html` and `roofing-tweed-heads.html` — old-format relics not in suburbs.json/sitemap/locations, skipped by enrichment, self-canonical and indexable; Logan competes with roofing-logan-central.html, Tweed Heads is NSW. Delete + 301 (logan → roofing-logan-central.html, tweed-heads → locations.html).

**M-SEO-4. Root blog-colorbond page duplicates the blog cost guide's intent.** Now in sitemap and linked (prior orphan resolved) but still at root and title-overlaps `blog/how-much-roof-replacement-cost-brisbane-2026.html`. 301 into `/blog/` or differentiate its angle.

**M-SEO-5. skylights-whirlybirds-brisbane.html has zero suburb links** (other service pages have 4–5, index has 35). Add the PR #14 "areas we serve" block.

**M-SEO-6. colour-confirmation.html is indexable with no canonical/robots meta and not in sitemap.** It's a customer-workflow page — `noindex` it (new-employee-form.html already is; decide intentionally for subcontractor-pack.html too).

**M-SEO-7. Titles/descriptions over-length.** Titles 91–104 chars on gutters/skylights/new-roof/insulation pages and one blog post; descriptions to 195 chars (roof-replacement.html), 187 (quote.html). Trim to ~60 / 150–165.

**M-SEC-1. Cron endpoint fails open when CRON_SECRET is unset.** `api/cron/check-expiring-insurance.js:12` — `Bearer undefined` passes. Reject when unset; use timingSafeEqual.

**M-SEC-2. Internal error details returned to clients.** `error.message` / raw Resend error objects at submit-new-employee.js:265, submit-subby-pack.js:314, check-expiring-insurance.js:234, submit-quote.js:96, submit-colour.js:106. Log server-side; return generic message.

**M-SEC-3. File uploads validated client-side only.** 5 MB/type checks live in the forms; the server accepts any content-type/filename/size up to Vercel's body limit and forwards client-supplied `fileType` straight to Anthropic as `media_type` (extract-insurance-data.js:29-31) and client filenames into attachments (pairs with the form-data CVE). Server-side allow-list pdf/jpeg/png, cap decoded sizes, regenerate filenames.

**M-FE-1. AVIF/WebP unused beyond the homepage.** template.html:250-271 (×316 pages), roof-replacement.html and the service pages ship ~1.1 MB of JPG each (lazy + width/height already good). Propagate the index.html `<picture>` blocks; rebuild.

**M-FE-2. `prefers-reduced-motion` handled nowhere** (0 matches) despite smooth-scroll, infinite bounce, reveal animations and 2 s counters. Add a reduce-motion media block + `matchMedia` guard.

**M-FE-3. quote.html "Why Choose" icons unstyled** — `.why-icon` has no CSS rule anywhere and the SVGs have no width/height → render ~300 px wide (quote.html:959-984). Add `.why-icon svg { width:48px; height:48px }`.

**M-FE-4. Mojibake:** colour-confirmation.html:798-800 renders literal `??` where contact emoji should be. Use the entities quote.html uses.

**M-FE-5. No Cache-Control for static assets.** vercel.json sets only security headers; ~1.8 MB of immutable photos revalidate on every view. Add `/images/(.*)` → `public, max-age=31536000, immutable` + a shorter TTL for CSS/JS.

**M-FE-6. Colour swatch picker is mouse-only** (colour-confirmation.html:482-594 — divs with click handlers, no tabindex/role/keydown; selects duplicate the function so users aren't blocked). Make them `<button type="button">`. Also `#signatureTypeInput` (:724) is the only unlabeled input site-wide.

**M-FE-7. Form error regions lack `role="alert"`/`aria-live`** (index.html:909, quote.html:853, colour-confirmation.html:730,752, new-employee-form.html:685, subcontractor-pack.html:517). Error *handling* itself is solid — every form shows API failures with a phone fallback.

**M-FE-8. Footer/nav inconsistencies.** `.footer-grid` is 4 columns but index/quote put 5 children in it (orphan row); internal-form footers link Services to `/#services` instead of the service pages; PR #20's nav phone link and floating phone CTA exist **only on index.html** — the deepest-funnel pages (quote, services, suburbs) lack click-to-call. Standardize one footer/nav and propagate the CTA.

**M-BUILD-1. README materially wrong.** README.md:32 claims generated files are git-ignored — false (all 316 pages + sitemap + locations.html are tracked); the documented `dev` branch doesn't exist; build.js isn't mentioned while the PS1 script is headlined. Truth it up.

**M-BUILD-2. Sitemap lastmod churn / dishonest dates.** Rebuilding rewrites every `<lastmod>` to today (build.js:440) regardless of change — a 650-line meaningless diff and a signal Google learns to distrust. Derive lastmod from real content changes (git dates) or stop committing the sitemap.

**M-BUILD-3. locations.html attribute-escaping bug.** build.js:276 emits single-quoted `title='Roofing ${name}'` — `D'Aguilar` breaks the attribute (committed locations.html:99). Use double quotes/escapeAttr. (Suburb-page path verified apostrophe-safe.)

**M-BUILD-4. SUBCONTRACTOR_PACK_SETUP.md documents the wrong AI provider** — instructs `OPENAI_API_KEY`/"OpenAI Vision" throughout, but the code uses Anthropic (`lib/extract-insurance-data.js`). Doc-followers configure a key that's never read.

**M-BUILD-5. .env.example missing `CRON_SECRET` and `ALLOWED_ORIGINS`** — both read by code; without ALLOWED_ORIGINS, form posts from Vercel preview deployments 403.

**M-BUILD-6. PowerShell generators still present** *(carried over)* — and generate_sitemap.ps1 uses the wrong domain (no `www`) and omits blog/static pages; running it would clobber the good sitemap. Delete both; remove the README "Legacy Method".

---

## LOW

- **L-SEO-1.** `og:site_name`/`og:locale=en_AU` only on the 5 Phase-0 pages; twitter tags missing on locations/privacy/terms/roof-replacement/root-blog/404. Extend site-wide via template + hand-written heads.
- **L-SEO-2.** Suburb pages remain ~90 % boilerplate (enrichment ≈170 of ~1,220 words; 89–90 % line-identity between pages). Don't expect the "Discovered – not indexed" pool to clear; prioritize 30–50 high-population suburbs for real content or consolidate micro-suburbs into region hubs.
- **L-SEO-3.** Blog cross-linking: `best-metal-roofing-materials…` and `how-much-roof-replacement-cost…` link zero sibling posts.
- **L-SEO-4.** Footer says "ABN Registered" with no number (index.html:1039 etc.) — reads as placeholder; publish the ABN. Add QBCC/ABN to JSON-LD (`hasCredential`/`identifier`). Verify the `sameAs` Facebook/Instagram URLs actually exist.
- **L-SEC-1.** `sanitize()` duplicated in 5 handlers; cron email rendering relies implicitly on write-path sanitization (business_name etc.) — consolidate into `lib/sanitize.js` and sanitize at render time.
- **L-SEC-2.** CSP `script-src 'unsafe-inline'` is load-bearing (inline scripts everywhere) — negates much XSS protection. Long-term: externalize inline JS, move to nonce-based CSP. innerHTML sinks in quote.html are currently fed only by server-sanitized data (verified) — prefer `textContent` anyway.
- **L-SEC-3.** submit-quote doesn't validate email format before using it as reply-to; `x-forwarded-for` first segment (spoofable) keys the roof-quote limiter; submit-colour accepts unbounded-length base64 signatures (Vercel-limit bounded).
- **L-FE-1.** Undefined CSS vars: `--border-subtle`, `--accent-light`, `--accent-rgb` (styles.css:1743,1763,1789,1796 — the last falls back to an old orange theme). Duplicate conflicting `.faq-item` rule blocks; `.faq-answer` max-height:300px may clip long answers on phones.
- **L-FE-2.** 11 pages (quote, roof-replacement, locations, faq, terms, privacy, 404, the 3 forms, blog/*) still use the 58 KB PNG favicon with no apple-touch-icon/manifest — copy the index.html icon block.
- **L-FE-3.** quote.html still carries 16 KB inline CSS + 13 KB inline JS (same pattern on the 3 form pages); `.hero-overlay`/`.hero-pattern` dead stubs remain (styles.css:372-379, index.html:161-162).
- **L-FE-4.** Signature pad wiped on resize/rotation (colour-confirmation.html:857-872 clears the canvas). Preserve content on resize.
- **L-FE-5.** locations.html logo imgs missing width/height (CLS); nav-toggle tap target ~36×30 px; placeholder text #555 on #141414 = 2.47:1 (exempt but barely legible); un-throttled layout reads in the scroll handler (script.js:56-72 — fine at this scale).
- **L-BUILD-1.** No tests for api/submit-new-employee.js (the most sensitive PII handler) or lib/verify-origin.js / geocode-address.js. Existing 148 tests are substantive; clone the subby-pack test patterns.
- **L-BUILD-2.** Dead "random images" machinery in build.js:18-45,239-245 — a no-op today (placeholders absent from template) and the only reason the build is deterministic; delete it. Sitemap log count wrong (build.js:548: says 327, actual 331). No `engines` field in package.json (add `"node": "22.x"`). `scripts/enrich-report.json` is a committed build by-product — gitignore it.
- **L-SEC-4.** Prompt-injection surface in insurance extraction is low-impact (outputs coerced/validated; worst case a bogus expiry date). api/health.js is public but harmless.

---

## Verified clean (no action)

- **No SQL injection** — every query uses `@vercel/postgres` tagged-template parameterization (verified in all handlers + cron). Method checks (405) correct on all endpoints.
- **No secrets in repo or git history** beyond the Maps key (H-SEC-2); `.env` never committed; `.env.example` placeholders only.
- **JSON-LD 100 % valid** across all page types (node parse); zero fake review/aggregateRating schema; BreadcrumbList on all service pages, blog posts, and the suburb template.
- **Canonicals** correct (https + www, self-referencing) on every indexable page; robots.txt correct; `lang="en-AU"` everywhere; one h1 per page.
- **NAP consistent:** 0419 098 049 (1,800+ occurrences across forms/schema/tel:), single email, QBCC 15600031 consistent across 341 files.
- **vercel.json redirect** is root-anchored — no loop/conflict with service-areas pages. Cron 23:00 UTC = 09:00 AEST as documented, with correct Australia/Brisbane windowing in the handler.
- **Build integrity:** fresh `npm run build` reproduces all 316 suburb pages + locations.html byte-identically (only date stamps drift — M-BUILD-2); enrichment is pure-fs, deterministic, idempotent, and safe on Vercel.
- **schema.sql matches code** column-by-column; apply-schema.sh sound.
- **HTML validity spot-checks clean:** no duplicate IDs, balanced tags, viewport meta everywhere; alt text present and descriptive.
- **PR #20 markup** (beyond the review-claim issue): no broken anchors, no placeholder hrefs, decorative SVGs correctly aria-hidden.
- **Fonts:** single Google Fonts request, display=swap, preconnects everywhere.

## Verification performed

- `npm test`: 161/162 pass — the 1 failure is documented as H-BUILD-2.
- `npm audit`: 3 high (H-SEC-4).
- Sandboxed `node build.js && node scripts/enrich-service-areas.cjs` → diffed vs committed output; tree restored to clean afterwards.
- Every `application/ld+json` block parsed programmatically; contrast ratios computed from actual CSS values; sitemap diffed against the filesystem; grep sweeps for secrets, mojibake, NAP variants across all 340+ HTML files; git history scanned for committed secrets.
