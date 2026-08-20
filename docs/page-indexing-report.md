# The Page indexing report, read against this site

Google Search Console's **Page indexing** report lists every URL Google knows
about on `www.ascendroofinggroup.com.au` and why each one is or isn't indexed.
Google's own documentation explains the report generically. This document does
the part Google can't: it maps each reason to *this* repository — which file
produces it, whether it's a problem here, and what to change.

The invariants described below are enforced by `npm run check:indexing`
(`scripts/check-indexing-hygiene.js`), which runs in CI via
`__tests__/indexing-hygiene.test.js`. If you change how pages, canonicals,
`sitemap.xml`, `robots.txt`, or `vercel.json` fit together, that checker is
what tells you before Google does.

---

## 1. What Google should find here

Verified against the tree on 2026-08-15; `npm run check:indexing` prints the
first two counts on every run:

| | Count | Notes |
|---|---|---|
| HTML pages in the repo | 346 | everything Vercel serves from the root |
| URLs in `sitemap.xml` | 340 | the pages meant to rank |
| Deliberately non-indexable | 6 | see the table below |
| Suburb pages (`service-areas/`) | 314 | generated from `template.html` + `suburbs.json` |
| Blog pages (`blog/`) | 14 | 13 posts + the index |
| Root pages | 18 | home, services, locations, legal, forms |

**The steady-state target is roughly 340 indexed pages** — not 346. The six
excluded pages are excluded on purpose:

| Page | How it's excluded | Why |
|---|---|---|
| `quote.html` | `<meta name="robots" content="noindex, nofollow">` | conversion form, no search value |
| `colour-confirmation.html` | `noindex, follow` | post-submission confirmation |
| `new-employee-form.html` | `noindex, follow` | internal onboarding form |
| `subcontractor-pack.html` | `noindex, follow` | internal contractor form |
| `404.html` | `noindex` | error page |
| `template.html` | `X-Robots-Tag: noindex, nofollow` in `vercel.json` | build input with `{{SUBURB}}` placeholders |

`template.html` is the one worth understanding: it is a real file at a real URL,
so without that header Google could index a page full of unreplaced
`{{SUBURB}}` placeholders. It's noindexed by response header rather than markup
because the build copies its markup into all 314 suburb pages — a `<meta>` tag
would be copied too.

### The invariant that keeps this stable

> **A page is in `sitemap.xml` if and only if it is indexable.**

Every one of the 6 excluded pages is noindex *and* absent from the sitemap;
every one of the 340 sitemap URLs is indexable *and* resolves to a file. That
single rule prevents the most common contradictory-signal bugs, and the checker
enforces it in both directions — a new indexable page that nobody added to the
sitemap fails CI, and so does a noindex page that somebody submitted.

---

## 2. Reading the report

**Status** is binary: *Indexed* or *Not indexed*. **Reason** is why. **Source**
tells you whether you can fix it (`Website`) or not (`Google`).

Two things not to chase:

- **100% coverage.** Only canonical pages get indexed. On this site every
  indexable page is self-canonical, so the ceiling really is ~340 — but Google
  choosing not to index some thin suburb pages is a judgement call, not a bug
  (see §4).
- **Immediate indexing.** New pages take days to weeks. `lastmod` in
  `sitemap.xml` is set from the last commit that touched the build inputs, so
  it is honest about what actually changed and Google isn't told that 340
  unchanged pages are all new.

**Use the sitemap filter.** The dropdown above the chart defaults to *All known
pages*, which includes URLs Google found by other means — old links, scraped
copies, guessed URLs. Switch to **All submitted pages** to see only the 340 URLs
this repo actually claims. Most alarming-looking numbers in the default view are
URLs that were never ours to fix.

---

## 3. Reasons you may legitimately see, and what they mean here

### Expected and benign

**Page with redirect.** `vercel.json` defines five permanent redirects, and
these URLs will accumulate here forever. That is the correct outcome — a
redirecting URL is never the indexed one.

| Redirect | Destination |
|---|---|
| `/roofing-logan.html`, `/service-areas/roofing-logan.html` | `/service-areas/roofing-logan-central.html` |
| `/roofing-tweed-heads.html`, `/service-areas/roofing-tweed-heads.html` | `/locations.html` |
| `/roofing-(.*)\.html` (catch-all) | `/service-areas/roofing-$1.html` |

The catch-all is anchored at the root, so it rewrites the legacy flat URLs into
`service-areas/` without matching the pages it redirects *to* — no loop. The
checker asserts this, and also asserts that no sitemap URL is shadowed by any of
these rules.

**URL marked 'noindex'.** Expect the six pages in §1 here. Nothing to fix; this
is the report confirming the exclusion worked.

**Alternate page with proper canonical tag.** Should be empty or near-empty.
There are no AMP or m-dot variants, and `vercel.json` sets neither `cleanUrls`
nor `trailingSlash`, so each page has exactly one URL form.

### Investigate if they appear

**Not found (404).** Only `404.html` should ever produce this, for URLs that
were never real. If a *sitemap* URL 404s, that's a build bug — `npm run
check:indexing` fails on any `<loc>` without a file behind it, so it should
never reach Google. A 404 for a suburb page that used to exist means a suburb
was removed from `suburbs.json`; add a redirect to `vercel.json` rather than
leaving it dead.

**Server error (5xx).** The static pages are files on a CDN and shouldn't 5xx.
If this appears, it's the serverless functions in `api/` — but those are
`Disallow`ed in `robots.txt` and not linked, so investigate how Googlebot
reached one at all.

**Blocked by robots.txt / Indexed, though blocked by robots.txt.** `robots.txt`
blocks only `/api/`. The second reason is the one to act on: it means Google
indexed an `/api/` URL from an external link without being able to read it.
Robots.txt does not prevent indexing — if it ever appears, unblock the path and
return a `noindex` header instead so Google can read the page and honour it.

**Soft 404.** No known source. Worth a look if it appears on a suburb page, as
it would suggest the enrichment step (`scripts/enrich-service-areas.cjs`) left a
page too thin to look like real content.

**Duplicate, Google chose different canonical than user.** The one to take
seriously — see §4. Note that *"Duplicate without user-selected canonical"*
should stay empty, because every indexable page here declares a canonical.
Pages landing in the *"Google chose different"* bucket instead means Google
read our canonical and overrode it.

**Blocked due to unauthorized request (401) / access forbidden (403).**
Not expected — nothing here is behind auth.

---

## 4. The real risk: 314 near-identical suburb pages

This is the section that matters. Everything above is hygiene; this is judgement.

The 314 pages in `service-areas/` are generated from one template. Measured
between `roofing-ascot.html` and `roofing-annerley.html`, after normalising away
the suburb name and postcode:

- **97.8% of the page text is identical** (36 of 1,648 lines differ)
- **~8% of each page is genuinely unique** (167 of 2,063 words, the
  `ENRICH:START`/`ENRICH:END` block)
- the unique part is one intro paragraph plus a list of ~10 neighbouring suburbs

The rest — services, FAQs, credentials, storm-season copy — is the same
sentences with a different place name substituted in.

**Measured across all 314, not just a pair.** `npm run check:uniqueness` groups
every suburb page by its body text with the name and postcode normalised away:

- **314 pages collapse to 103 distinct bodies**
- **211 pages (67%) say exactly what another page already says**
- the largest single group is **12 pages sharing one body**

The template rotates a handful of hand-written variants (3 "about us" openers,
4 hero lines, 8 meta descriptions) selected by a hash of the suburb name, so
the page count outruns the copy by roughly three to one. That ratio, not the
number of suburbs, is what sets the ceiling.

**What Google does with that.** Expect a meaningful share of the 314 to sit in
**"Crawled – currently not indexed"**: Google fetched the page, decided it added
nothing over the 313 siblings, and declined to index it. Some may instead appear
as **"Duplicate, Google chose different canonical than user"**, with a sibling
suburb page named as the chosen canonical. Newly added suburbs may sit in
**"Discovered – currently not indexed"** for a long time.

**This is not a bug to fix in code, and the checker deliberately does not flag
it.** Every one of those pages is technically perfect — self-canonical, unique
title, unique meta description, valid `RoofingContractor` and `FAQPage`
structured data, linked from `locations.html`, and cross-linked with siblings
(each page links out to ~21 others; inbound counts run from about 13 to 38).
There is no configuration change that makes Google index thin pages.

**What actually moves it,** in order of effect:

1. **Genuinely local content.** Real jobs done in that suburb, local roof stock
   and its typical problems (post-war timber vs. 1980s brick veneer), council
   or heritage-overlay specifics, actual project photos. The enrichment step
   already has the right anchor — it needs better material, not more of it.
2. **Prune.** 314 suburb pages for one roofing business is a lot. Fewer, richer
   pages for the suburbs that actually convert will out-perform 314 thin ones,
   and the pages you drop were mostly not indexed anyway. `npm run
   prune:service-areas` carries this out from a keep-list in
   `service-areas/keep.json`: it drops the pages, removes them from
   `suburbs.json` so the build cannot recreate them, and writes a 301 for each
   one to the closest page still standing (same postcode, then same region,
   then `locations.html`). It is a dry run until you pass `--apply`.

   Set the target below the distinct-body count, not above it — pruning to more
   pages than you have copy for just redistributes the duplicates. At 314 pages
   against 103 bodies, a keep-list of 60–80 would put uniqueness near 100%
   without writing a word of new copy.
3. **Earn links.** A suburb page with a real inbound link gets indexed.

**How to measure it rather than guess:** run `npm run check:uniqueness` for the
repo-side number (distinct bodies), and filter the report to *All submitted
pages* → **Crawled – currently not indexed** for Google's side. If duplicates
are under ~10%, the current approach is working. If they're over half, options
1 and 2 are overdue. Track both over time — together they are the single most
informative figure in the report for this site.

**Reading as at 2026-08-17:** 117 indexed, 521 not indexed. Against 103 distinct
bodies and 340 sitemap URLs, the two sides agree: indexed pages track distinct
bodies, not page count. Duplicates are at 67%, so options 1 and 2 are overdue.

Exported from the Page indexing report, the 521 breaks down as:

| Reason | Pages | Source |
| --- | --- | --- |
| Discovered – currently not indexed | 283 | Google systems |
| Crawled – currently not indexed | 222 | Google systems |
| Alternate page with proper canonical tag | 12 | Website |
| Page with redirect | 3 | Website |
| Not found (404) | 1 | Website |

Two separate problems sit inside those top two rows, and the larger one is not
the duplicate copy.

**The host split.** 193 of the 222 "Crawled – currently not indexed" URLs are on
the apex host, `ascendroofinggroup.com.au`, not `www`. The apex served the site
directly instead of redirecting, so Google crawled it, read a canonical
pointing at `www`, and declined to index what it had just fetched. Meanwhile
all 283 "Discovered – currently not indexed" URLs are on `www` with a last-
crawled date of `1970-01-01` — Google's null sentinel, meaning never crawled.
The two halves deadlocked: the copy Google had was disowned by its own
canonical, and the copy the canonical named had never been fetched. Every core
service page, `locations.html`, and five blog posts sat in that second bucket.

The Performance report showed how lopsided it had become — 61% of impressions
(19,993 of 32,807) were earned by apex URLs that the site was telling Google to
ignore.

`vercel.json` now 301s apex to `www` ahead of every other rule. That rule is
scoped with `has: [{type: "host"}]`, and `appliesToCanonicalHost()` in the
checker exists so a host-scoped catch-all is not mistaken for a redirect
shadowing all 340 sitemap URLs.

**The duplicate copy.** The remaining 29 crawled-and-declined URLs are on `www`,
and that is the thin-content ceiling: 314 suburb pages carry 103 distinct
bodies, and 92 of them are indexed. That is what options 1–3 above address.

Fix the host split first and let Google recrawl before pruning. Until the two
hosts are consolidated, per-page impression data is split across both and is
not a sound basis for deciding which suburbs to keep.

Do not respond by noindexing the affected pages or by pointing their canonicals
at `locations.html`. "Crawled – currently not indexed" costs nothing; a page
Google might index later is worth more than one you've told it to forget.

### Reading as at 2026-08-20 — the failed validation is a false alarm

The **Crawled – currently not indexed** drilldown exported on 2026-08-20 lists
**228 URLs**, up from 222 on 2026-08-17. Search Console also shows a validation
attempt for this issue **started 2026-08-13 and failed 2026-08-15**.

That failure says nothing about the fix, because the fix had not shipped yet.
The apex→www redirect landed in `982e86d1` on **2026-08-17**, two days *after*
the validation was marked failed. Google re-tested a site that still served the
apex host directly, so the re-test could only fail.

The export confirms the fix has not yet been re-crawled either:

| | 2026-08-17 | 2026-08-20 |
|---|---|---|
| Apex host (`ascendroofinggroup.com.au`) | 193 | 194 |
| `www` host | 29 | 34 |
| **Total** | **222** | **228** |

- **Zero** of the 194 apex URLs have been crawled on or after 2026-08-17. The
  most recent apex crawl in the export is **2026-07-07**, six weeks before the
  redirect shipped. Every one of those rows is a verdict Google reached against
  the pre-fix site and has not revisited.
- Only **two** `www` suburb pages have been crawled since the redirect shipped
  (`roofing-munruben`, `roofing-clontarf`, both 2026-08-18). Two pages is not a
  sample worth acting on.

So 85% of the 228 is stale by construction. As Google re-crawls the apex host it
should reclassify those URLs to **Page with redirect**, which §3 already lists as
expected and benign — they will accumulate there permanently and that is correct.

**What to do with it:** re-run **Validate fix** on this issue now that
`982e86d1` is deployed, and leave the 228 alone in the meantime. Confirm the
redirect is live first — `curl -sSI https://ascendroofinggroup.com.au/ | head -1`
should report `301`, with `Location:` on the `www` host.

**What not to do:** do not prune, noindex, or re-canonical anything on the
strength of this export. The prune-sizing rule in option 2 above needs per-page
data from a single consolidated host, and that data does not exist yet. The
repo-side number is unchanged — `npm run check:uniqueness` still reports 314
pages over 103 distinct bodies, and `npm run check:indexing` is clean, so there
is no configuration defect underneath any of these 228 rows.

The reading that will actually settle it is the next export in which apex URLs
carry a post-2026-08-17 crawl date. Take the `www` count from that one; that is
the real thin-content number, and the only one the prune decision should use.

---

## 5. Validating a fix

After fixing all instances of an issue, open its details page and click
**Validate fix**. Validation typically takes up to two weeks; don't click it
again while it's running. A single remaining instance stops the whole run, so
fix every instance first — for issues that map to a repo invariant, `npm run
check:indexing` tells you whether you did.

Google's sitemap trick applies well here: a validation request scoped to a
smaller sitemap finishes faster than one covering all 340 URLs. If you're
validating a fix that only affects root pages, a temporary sitemap of just those
18 URLs will confirm it much sooner than the full set.

Note that an issue also counts as "fixed" when the page becomes unavailable —
removed, noindexed, or auth-walled. Validation passing is not by itself proof
the page is indexable; check the URL Inspection tool for the pages you care about.

---

## 6. Troubleshooting playbook

**Indexed count drops with no new errors.** Check in this order: (1) did a
deploy add `noindex` somewhere — `npm run check:indexing` catches a noindex page
still sitting in the sitemap; (2) did `sitemap.xml` shrink — `git log -p
sitemap.xml`; (3) is the drop concentrated in `service-areas/`, which points at
§4 rather than at a bug.

**Indexed count is well below 340 but stable.** Almost certainly §4. Confirm by
filtering to *All submitted pages* and reading the non-indexed reasons.

**A specific page won't index.** Run URL Inspection on it, then *Test live URL*.
Confirm the canonical Google reports matches the page's own URL, and that it's
in `sitemap.xml`. If both are right and it still won't index, it's a content
judgement, not a configuration one.

**Errors spike right after a deploy.** Compare against `vercel.json` — a new
redirect or header rule with a broader pattern than intended is the usual cause.
`sourceToRegExp` in the checker interprets those patterns the same way this
document describes, so adding the new rule and re-running the checker will show
you which sitemap URLs it swallows.

---

## 7. When you change the site

Run `npm run check:indexing` (or just `npm test`) after touching any of:

- **a new page** — add it to `sitemap.xml`, or mark it `noindex`; the checker
  requires exactly one of the two
- **`build.js`, `template.html`, `suburbs.json`** — run `npm run build` and
  commit the regenerated output, as CI enforces a clean tree afterwards
- **`vercel.json` redirects or headers** — the checker re-derives which sitemap
  URLs are shadowed
- **`robots.txt`** — the checker re-derives which sitemap URLs are blocked
- **the canonical host** — it is set in more than one place (`CONFIG.baseUrl`
  in `build.js`, the markup `build.js` emits, and `BASE_URL` in
  `scripts/check-indexing-hygiene.js`); changing some but not all fails CI

- **the copy variants in `build.js` or the `ENRICH` block** — run
  `npm run check:uniqueness`; adding a suburb without adding copy lowers the
  share of pages that are one of a kind

What the checker cannot tell you is whether a page deserves to be indexed.
`npm run check:uniqueness` gets you the closest thing available offline — how
many pages say something no other page says. Whether Google agrees is §4, and
that part is answered in Search Console, not in this repo.
