# Ascend Roofing Group Website

Source code for the Ascend Roofing Group website, a static site for a Brisbane & Gold Coast metal roofing company, deployed on Vercel with serverless functions in `api/`.

## Project Structure

- **`index.html`**: The main landing page.
- **`styles.css`**: Global styles and variables (Dark Architectural Theme).
- **`script.js`**: Frontend interactivity (mobile menu, scroll effects).
- **`build.js`**: Node build script — generates the ~314 suburb landing pages in `service-areas/`, plus `locations.html` and `sitemap.xml`, from `template.html` + `suburbs.json`.
- **`scripts/enrich-service-areas.cjs`**: Post-build step that inserts unique local-context content into each suburb page (idempotent, marker-based).
- **`template.html`**: Master template for the suburb pages. ⚠ The comment `<!-- ===================== SERVICES ===================== -->` is the enrichment anchor and the `<title>Roof Replacement {{SUBURB}} | …` format is parsed by the enrich script — keep both intact when editing.
- **`suburbs.json`**: Data source for the suburb pages.
- **`service-areas/`, `locations.html`, `sitemap.xml`**: Generated output. These files **are committed** — regenerate with `npm run build` and commit the result whenever `template.html`, `suburbs.json`, or `build.js` changes.
- **`api/`**: Vercel serverless functions (quote, forms, cron). See `.env.example` for required environment variables.
- **`images/`**: Project assets (each photo has `.avif`/`.webp`/`.jpg` variants).

## How to Build

```bash
npm install
npm run build   # node build.js && node scripts/enrich-service-areas.cjs
npm test        # jest suite for the api/ functions and build helpers
```

The build is deterministic: running it twice produces no diff. CI enforces this.

### Vercel Configuration
- **Build Command**: `npm run build`
- **Output Directory**: `.` (the root directory)

## Branding

- **Company**: Ascend Roofing Group
- **Primary Color**: White (`#ffffff`)
- **Accent Color**: Blue (`#2563EB`)
- **Font**: Inter & Space Grotesk

## Development Workflow

Work on a feature branch and open a pull request into `main`. Vercel deploys a preview for every branch push and deploys `main` to production.

```bash
git checkout -b my-change
# Make your changes; if you touched template.html/suburbs.json/build.js, run: npm run build
git add .
git commit -m "Description of changes"
git push -u origin my-change
```

## Address autocomplete

Address fields across the site are backed by the **legacy** Google Places API
through two origin-checked proxies, so the browser never sees the API key:

- `api/places-autocomplete.js` → `/maps/api/place/autocomplete/json` (the dropdown)
- `api/place-details.js` → `/maps/api/place/details/json` (the address components)

Picking a suggestion splits it into street / suburb / state / postcode wherever
a form has those fields (see `ADDRESS_PART_SELECTORS` in `script.js`); forms
with a single address box keep the full address string and skip the second
call. Both requests share a session token so Google bills the lookup once.

⚠ This needs the legacy **"Places API"** enabled in Google Cloud — a different
product from **"Places API (New)"**. Only the legacy Place Details response
returns `address_components`, which is what makes the split fields work. A
`REQUEST_DENIED` in the Vercel function logs means it is not enabled.

## PII encryption (owner setup)

`api/submit-new-employee.js` and `api/submit-subby-pack.js` can encrypt TFN and bank fields at rest (AES-256-GCM). To activate:

1. Widen the DB columns first — see the commented `ALTER TABLE` block at the bottom of `schema.sql` (ciphertext does not fit the original VARCHAR widths).
2. Generate a key: `openssl rand -hex 32`.
3. Set it as `ENCRYPTION_KEY` in Vercel env vars.

Until then, data is stored as before, but emails always mask TFN/bank numbers to the last 3 digits. Ensure `POSTGRES_URL` is configured — with masking active, the database record is the authoritative copy of payroll details.

## Rate limiting (owner setup)

All form/quote endpoints use `lib/rate-limit.js`. Without configuration it falls back to per-instance in-memory limits (best effort). For durable limits, create an Upstash Redis database (Vercel Marketplace → Upstash, free tier) and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
