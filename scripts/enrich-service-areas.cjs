#!/usr/bin/env node
/*
 * enrich-service-areas.cjs
 *
 * Injects genuinely unique, factual local content into every
 * service-areas/roofing-*.html page to address Google Search Console
 * "Crawled / Discovered - currently not indexed" caused by near-duplicate
 * programmatic pages.
 *
 * Per page (all derived from real data in suburbs.json - no fabrication):
 *   1. A local-context intro: suburb + postcode + region + nearest neighbours
 *   2. Region/climate-specific roofing guidance (coastal salt-air vs
 *      hinterland wind/rain vs storm-belt hail/heat)
 *   3. Contextual internal links to the core service pages + locations hub
 *      (strengthens the crawl mesh that drives discovery/indexing)
 *
 * Safety:
 *   - Idempotent: wrapped in <!-- ENRICH:START/END --> markers, replaced
 *     (never duplicated) on re-runs.
 *   - Non-destructive: pages missing the expected anchor are SKIPPED and
 *     reported, never corrupted.
 *   - Neighbour links only emitted for suburb pages that actually exist.
 *   - Writes scripts/enrich-report.json for verification.
 *
 * Run:  node scripts/enrich-service-areas.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SA_DIR = path.join(ROOT, 'service-areas');
const SUBURBS_JSON = path.join(ROOT, 'suburbs.json');
const REPORT = path.join(__dirname, 'enrich-report.json');
const TODAY = new Date().toISOString().split('T')[0];

const START = '<!-- ENRICH:START -->';
const END = '<!-- ENRICH:END -->';

// Insert immediately before the Services section (present on every page).
const ANCHOR = '<!-- ===================== SERVICES ===================== -->';

// Human-readable region descriptors (geographic, factual).
const REGION_DESCRIPTOR = {
  'Brisbane': 'the greater Brisbane area',
  'Gold Coast': 'the Gold Coast',
  'Logan': 'the Logan region south of Brisbane',
  'Ipswich': 'the Ipswich region west of Brisbane',
  'Moreton Bay': 'the Moreton Bay region north of Brisbane',
};

// Climate exposure profiles (factual SEQ classifications).
// Coastal/bayside: salt-laden air accelerates corrosion.
const COASTAL = new Set([
  // Moreton Bay foreshore
  'Redcliffe', 'Scarborough', 'Newport', 'Margate', 'Woody Point', 'Clontarf',
  'Kippa-Ring', 'Rothwell', 'Deception Bay', 'Beachmere', 'Godwin Beach',
  'Bribie Island', 'Bongaree', 'Woorim', 'Banksia Beach', 'Sandstone Point',
  'Ningi', 'Toorbul',
  // Brisbane bayside
  'Wynnum', 'Wynnum West', 'Manly', 'Manly West', 'Lota', 'Nudgee Beach',
  // Gold Coast coastal strip
  'Southport', 'Main Beach', 'Surfers Paradise', 'Broadbeach', 'Broadbeach Waters',
  'Mermaid Beach', 'Mermaid Waters', 'Miami', 'Burleigh Heads', 'Burleigh Waters',
  'Palm Beach', 'Currumbin', 'Currumbin Waters', 'Tugun', 'Bilinga', 'Coolangatta',
  'Kirra', 'Labrador', 'Chirn Park', 'Biggera Waters', 'Runaway Bay',
  'Paradise Point', 'Hollywell', 'Coombabah', 'Sorrento', 'Isle of Capri',
]);
// Hinterland/elevated: higher rainfall, wind uplift, surrounding bushland.
const HINTERLAND = new Set([
  // Gold Coast hinterland
  'Mudgeeraba', 'Tallai', 'Worongary', 'Nerang', 'Highland Park', 'Gilston',
  'Maudsland', 'Guanaba', 'Currumbin Valley',
  // leafy / elevated greater Brisbane & Moreton Bay
  'Kenmore Hills', 'Fig Tree Pocket', 'Chapel Hill', 'Samford Valley',
  'Samford Village', 'Dayboro', 'Wamuran', 'Woodford', "D'Aguilar", 'Elimbah',
  'Mount Warren Park',
  // Ipswich elevated / bushland fringe
  'Karana Downs', 'Karalee', 'Chuwar', 'Pine Mountain', 'Barellan Point',
  'Muirlea', 'Blacksoil',
]);

// Mirror build.js getSlug() exactly so file names line up (e.g. D'Aguilar -> daguilar).
function slugify(name) {
  return name.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function climateParagraph(suburb) {
  if (COASTAL.has(suburb)) {
    return `Because ${suburb} sits close to the water, homes here cop salt-laden air that accelerates corrosion on older steel and tin roofs. In coastal pockets like this we recommend marine-grade Colorbond&reg; Ultra, along with regular gutter and fastener checks, so your roof keeps its finish and structural integrity for decades.`;
  }
  if (HINTERLAND.has(suburb)) {
    return `${suburb} sits in elevated, leafy country where higher rainfall, gusty winds and surrounding bushland place extra demand on a roof. Our installs focus on secure fastening against wind uplift, well-detailed valleys and flashings to shed heavy downpours, and gutter-guard options to manage leaf litter from nearby trees.`;
  }
  return `Like the rest of South East Queensland, ${suburb} faces a fierce summer storm season with damaging hail, wind-driven rain and intense heat. We build for it &mdash; storm-rated fixings, correctly pitched sheeting and ridge capping for fast water run-off, plus heat-reflective Colorbond&reg; colours and Thermatech&reg; technology to keep your home cooler.`;
}

// Load suburbs.json (flat array) -> region buckets + slug index (dedup by slug).
function buildIndex() {
  const data = JSON.parse(fs.readFileSync(SUBURBS_JSON, 'utf8'));
  const regions = {};
  const bySlug = {};
  for (const s of data) {
    if (!s || !s.name) continue;
    const slug = slugify(s.name);
    if (!bySlug[slug]) {
      bySlug[slug] = { name: s.name, postcode: String(s.postcode || ''), region: s.region, slug };
      (regions[s.region] = regions[s.region] || []).push(bySlug[slug]);
    }
  }
  return { regions, bySlug };
}

function buildBlock(info, regions, existingFiles) {
  const { suburb, postcode, region } = info;
  const descriptor = REGION_DESCRIPTOR[region] || region;
  const pcNum = parseInt(postcode, 10);

  // Nearest neighbours: same region, sorted by postcode proximity then name,
  // only those with an existing page, max 10.
  const neighbours = (regions[region] || [])
    .filter((s) => s.slug !== info.slug && existingFiles.has(`roofing-${s.slug}.html`))
    .map((s) => ({ ...s, dist: Math.abs((parseInt(s.postcode, 10) || 9999) - (pcNum || 9999)) }))
    .sort((a, b) => a.dist - b.dist || a.name.localeCompare(b.name))
    .slice(0, 10);

  const neighbourProse = neighbours.slice(0, 4).map((s) => s.name).join(', ');
  const neighbourLinks = neighbours
    .map((s) => `                    <a href="roofing-${s.slug}.html">Roofing ${s.name}</a>`)
    .join('\n');

  const pc = postcode ? ` ${postcode}` : '';

  return `${START}
        <section class="section local-context">
            <div class="container">
                <div class="section-header" data-reveal>
                    <span class="section-tag">Local Roofing</span>
                    <h2>Roofing in <span class="text-accent">${suburb}</span></h2>
                </div>
                <div class="local-context-body" data-reveal>
                    <p>Ascend Roofing Group is a Colorbond&reg; metal roofing specialist serving ${suburb}${pc} and the surrounding suburbs of ${descriptor}. From full roof replacements to repairs and brand-new installations, we work on homes right across ${suburb}${neighbourProse ? ` and neighbouring areas like ${neighbourProse}` : ''}.</p>
                    <p>${climateParagraph(suburb)}</p>
                    <p>Whatever your roof needs in ${suburb}, we can help with
                        <a href="../roof-replacement.html">roof replacement</a>,
                        <a href="../roof-repairs-brisbane.html">roof repairs</a>,
                        <a href="../new-roof-installation-brisbane.html">new roof installation</a>,
                        <a href="../gutters-downpipes-brisbane.html">gutters &amp; downpipes</a>,
                        <a href="../roof-insulation-brisbane.html">roof insulation</a> and
                        <a href="../skylights-whirlybirds-brisbane.html">skylights &amp; whirlybirds</a>.
                        See every area we cover on our <a href="../locations.html">service areas</a> page.</p>
                </div>${neighbourLinks ? `
                <div class="suburb-links local-suburb-links" data-reveal>
${neighbourLinks}
                </div>` : ''}
            </div>
        </section>
        ${END}`;
}

// Pages listed in service-areas/custom.json are written by hand and carry
// content richer than anything this script injects, so enriching them would
// overwrite the very thing they exist for. build.js skips generating them for
// the same reason.
function readCustomSlugs() {
  const p = path.join(SA_DIR, 'custom.json');
  if (!fs.existsSync(p)) return new Set();
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  return new Set(parsed.map((c) => c.slug));
}

function main() {
  const { regions, bySlug } = buildIndex();
  const customSlugs = readCustomSlugs();
  const files = fs
    .readdirSync(SA_DIR)
    .filter((f) => /^roofing-.*\.html$/.test(f))
    .filter((f) => !customSlugs.has(f.replace(/\.html$/, '')));
  const existingFiles = new Set(fs.readdirSync(SA_DIR).filter((f) => /^roofing-.*\.html$/.test(f)));

  let enriched = 0;
  const skipped = [];

  for (const file of files) {
    const fp = path.join(SA_DIR, file);
    let html = fs.readFileSync(fp, 'utf8');

    const slug = file.replace(/^roofing-/, '').replace(/\.html$/, '');
    const lookup = bySlug[slug];
    const titleMatch = html.match(/<title>\s*Roof Replacement ([^|]+?)\s*\|/);
    const suburb = (titleMatch && titleMatch[1].trim()) || (lookup && lookup.name);

    if (!suburb || !lookup) {
      skipped.push(`${file} (no suburb/region mapping)`);
      continue;
    }

    let postcode = lookup.postcode;
    if (!postcode) {
      const pcMatch = html.match(/\b(4\d{3})\b/);
      postcode = pcMatch ? pcMatch[1] : '';
    }

    const info = { suburb, postcode, region: lookup.region, slug };
    const block = buildBlock(info, regions, existingFiles);

    if (html.includes(START) && html.includes(END)) {
      html = html.replace(
        new RegExp(escapeRe(START) + '[\\s\\S]*?' + escapeRe(END)),
        block,
      );
    } else {
      const idx = html.indexOf(ANCHOR);
      if (idx === -1) {
        skipped.push(`${file} (no insertion anchor)`);
        continue;
      }
      html = html.slice(0, idx) + block + '\n\n    ' + html.slice(idx);
    }

    fs.writeFileSync(fp, html, 'utf8');
    enriched++;
  }

  // Note: sitemap lastmod is owned by build.js (deterministic, derived from
  // content commit dates) — this script must not re-stamp it.

  const report = {
    date: TODAY,
    totalFiles: files.length,
    enriched,
    skipped,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
