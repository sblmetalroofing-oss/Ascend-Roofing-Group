#!/usr/bin/env node
/*
 * build-region-hubs.cjs
 *
 * Builds the regional hub pages under service-areas/ from template.html plus
 * the researched content in content/regions/<slug>.json.
 *
 * These pages exist because region-level demand had nowhere to land. Search
 * Console shows "roof replacement moreton bay" and "metal roofing ipswich"
 * carrying thousands of impressions and zero clicks: Moreton Bay had no page
 * at all (it is a region, not a suburb, so suburbs.json never contained it),
 * and Ipswich had only a generated suburb page ranking around position 43 on
 * one of the 103 near-identical template bodies.
 *
 * They take their chrome from template.html like every other page here, so nav,
 * footer and styling stay in step. What they do NOT take is the generated body:
 * the hero lead, the FAQ (visible and JSON-LD), the About prose and the service
 * grid are all replaced with region-specific content, and the postcode-bearing
 * markup is dropped because a region does not have one postcode.
 *
 * service-areas/custom.json lists these slugs so build.js does not regenerate
 * them from the suburb template and enrich-service-areas.cjs does not overwrite
 * them. This script is what actually writes them, and it runs first in
 * `npm run build` so those files always exist by the time build.js checks.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template.html');
const CONTENT_DIR = path.join(ROOT, 'content', 'regions');
const OUT_DIR = path.join(ROOT, 'service-areas');
const BASE = 'https://www.ascendroofinggroup.com.au';

const esc = (s) =>
  String(s).replace(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jsonText = (s) =>
  String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&reg;/g, '®')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CHEVRON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

// Fails when the anchor is absent, so a template edit that moves a block is a
// loud build error rather than a page silently missing its content. Tests the
// match, not the diff: a replacement identical to what was there is fine.
function replaceOnce(html, pattern, replacement, what) {
  if (!pattern.test(html)) throw new Error(`build-region-hubs: could not find ${what}`);
  return html.replace(pattern, replacement);
}

// The body: the researched sections rendered into the template's own section
// markup, so they inherit the site's styling rather than introducing new CSS.
function renderSections(sections) {
  return sections
    .map((s, i) => {
      const paras = s.paragraphs.map((p) => `                    <p>${p}</p>`).join('\n');
      const tone = i % 2 === 0 ? 't-section--light' : 't-section--grey';
      return `    <section class="t-section ${tone} section">
        <div class="container">
            <div class="section-header" data-reveal>
                <h2>${esc(s.heading)}</h2>
            </div>
            <div class="region-prose" data-reveal>
${paras}
            </div>
        </div>
    </section>`;
    })
    .join('\n\n');
}

function renderFaqList(faqs) {
  return faqs
    .map(
      (f) => `                <div class="faq-item" data-reveal>
                    <button class="faq-question" aria-expanded="false">
                        <span>${esc(f.question)}</span>
                        ${CHEVRON}
                    </button>
                    <div class="faq-answer">
                        <p>${f.answer}</p>
                    </div>
                </div>`,
    )
    .join('\n');
}

// The six services plus asbestos, each linking to its own page. A hub that
// names the region's services and then sends you to the page that details them
// is doing the job a hub is for.
const SERVICES = [
  ['../roof-replacement.html', 'Roof Replacements', 'Full strip and re-sheet in genuine Colorbond&reg; steel, with battens and tie-downs brought up to current requirements.'],
  ['../new-roof-installation-brisbane.html', 'New Roof Installations', 'New builds and extensions, working to your builder&rsquo;s programme.'],
  ['../roof-repairs-brisbane.html', 'Roof Repairs', 'Leaks, storm and hail damage, failed fixings, flashings and ridge capping.'],
  ['../asbestos-roof-replacement-brisbane.html', 'Asbestos Roof Replacement', 'Licensed Class-B removal and clearance coordinated, then your new Colorbond&reg; roof &mdash; one contract.'],
  ['../roof-insulation-brisbane.html', 'Insulation Upgrades', 'Anticon&reg; blanket and sarking, fitted while the sheets are off and the cavity is open.'],
  ['../gutters-downpipes-brisbane.html', 'Gutters &amp; Downpipes', 'Replaced with the roof so the whole water path is renewed at once.'],
  ['../skylights-whirlybirds-brisbane.html', 'Skylights &amp; Whirlybirds', 'Natural light and roof-space ventilation, flashed properly into the new sheeting.'],
];

function renderServices(region) {
  return SERVICES.map(
    ([href, title, blurb]) =>
      `<a class="service-card" href="${href}" data-reveal><h3>${title}</h3><p>${blurb}</p></a>`,
  ).join('\n                ');
}

function renderNearby(links) {
  // Only the suburb-page links belong in the neighbour grid; service-page links
  // are already woven through the prose.
  return links
    .filter((l) => /^roofing-[a-z0-9-]+\.html$/.test(l.href))
    .slice(0, 12)
    .map(
      (l) =>
        `<a href="${l.href}" class="nearby-card" title="${esc(l.anchor_text)}"><span class="nearby-name">${esc(
          l.anchor_text,
        )}</span><span class="nearby-region"></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17l9.2-9.2M17 17V7.8H7.8"/></svg></a>`,
    )
    .join('\n                ');
}

function buildPage(content, template) {
  const { _name: name, _slug: slug, _region: region } = content;
  const url = `${BASE}/service-areas/${slug}.html`;
  let html = template;

  // Chrome placeholders. POSTCODE resolves to empty: a region has no single
  // postcode, and asserting one would be a fabricated address.
  html = html
    .replace(/\{\{SUBURB\}\}/g, name)
    .replace(/\{\{REGION\}\}/g, region)
    .replace(/\{\{SLUG\}\}/g, slug.replace(/^roofing-/, ''))
    .replace(/\{\{SUBURB_QUERY\}\}/g, encodeURIComponent(`${name} QLD`))
    .replace(/\{\{POSTCODE\}\}/g, '');

  // Head
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${esc(content.title)}</title>`, 'title');
  html = replaceOnce(
    html,
    /(<meta name="description"\s*\n?\s*content=")[^"]*(">)/,
    `$1${esc(content.meta_description)}$2`,
    'meta description',
  );
  html = replaceOnce(
    html,
    /(<meta name="keywords"\s*\n?\s*content=")[^"]*(">)/,
    `$1roofing ${name}, metal roofing ${name}, roof replacement ${name}, Colorbond roofing ${name}, Ascend Roofing Group$2`,
    'keywords',
  );
  html = replaceOnce(html, /(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(content.title)}$2`, 'og:title');
  html = replaceOnce(
    html,
    /(<meta property="og:description"\s*\n?\s*content=")[^"]*(">)/,
    `$1${esc(content.meta_description)}$2`,
    'og:description',
  );
  html = replaceOnce(html, /(<meta name="twitter:title" content=")[^"]*(">)/, `$1${esc(content.title)}$2`, 'twitter:title');
  html = replaceOnce(
    html,
    /(<meta name="twitter:description" content=")[^"]*(">)/,
    `$1${esc(content.meta_description)}$2`,
    'twitter:description',
  );

  // Region-level business schema: no postalCode, and areaServed names the region.
  html = replaceOnce(
    html,
    /"address":\s*\{[\s\S]*?\},\n\s*"areaServed":\s*\[[\s\S]*?\],/,
    `"address": {
            "@type": "PostalAddress",
            "addressRegion": "QLD",
            "addressCountry": "AU"
        },
        "areaServed": [
            {"@type": "AdministrativeArea", "name": "${region}"},
            {"@type": "State", "name": "Queensland"}
        ],`,
    'business schema address/areaServed',
  );

  // FAQPage JSON-LD — replaced wholesale, not stacked, so the page does not
  // ship two contradictory FAQ sets.
  const faqLd = content.faqs
    .map(
      (f) => `            {
                "@type": "Question",
                "name": ${JSON.stringify(jsonText(f.question))},
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": ${JSON.stringify(jsonText(f.answer))}
                }
            }`,
    )
    .join(',\n');
  html = replaceOnce(
    html,
    /(\{\s*\n\s*"@context": "https:\/\/schema\.org",\s*\n\s*"@type": "FAQPage",\s*\n\s*"mainEntity": \[)[\s\S]*?(\]\s*\n\s*\})/,
    `$1\n${faqLd}\n        $2`,
    'FAQPage JSON-LD',
  );

  // Canonical / og:url already carry the slug via {{SLUG}}; assert it.
  if (!html.includes(`<link rel="canonical" href="${url}">`)) {
    throw new Error(`build-region-hubs: canonical did not resolve to ${url}`);
  }

  // Hero
  html = replaceOnce(
    html,
    /<span class="t-eyebrow">[^<]*<\/span>/,
    `<span class="t-eyebrow">Serving the ${esc(region)} region</span>`,
    'hero eyebrow',
  );
  html = replaceOnce(html, /<h1>[^<]*<\/h1>/, `<h1>${esc(content.h1)}</h1>`, 'h1');
  html = replaceOnce(
    html,
    /<p class="t-hero-lead">[\s\S]*?<\/p>/,
    `<p class="t-hero-lead">${content.hero_lead}</p>`,
    'hero lead',
  );

  // Body: the researched sections take the place of the generated ABOUT block.
  html = replaceOnce(
    html,
    /    <!-- ===================== ABOUT ===================== -->[\s\S]*?\n    <!-- ===================== WHY CHOOSE US ===================== -->/,
    `${renderSections(content.sections)}\n\n    <!-- ===================== WHY CHOOSE US ===================== -->`,
    'ABOUT block',
  );

  // Visible FAQ
  html = replaceOnce(
    html,
    /<h2>Roofing Questions in <span class="text-accent">[^<]*<\/span><\/h2>/,
    `<h2>${esc(name)} roofing questions</h2>`,
    'FAQ heading',
  );
  html = replaceOnce(
    html,
    /<p class="section-desc">Common questions[^<]*<\/p>/,
    `<p class="section-desc">What homeowners across ${esc(region)} ask us most.</p>`,
    'FAQ description',
  );
  html = replaceOnce(
    html,
    /<div class="faq-list">[\s\S]*?\n            <\/div>/,
    `<div class="faq-list">\n${renderFaqList(content.faqs)}\n            </div>`,
    'FAQ list',
  );

  // Neighbour grid -> the region's suburb pages
  html = replaceOnce(html, /\{\{NEARBY_SUBURBS\}\}/, renderNearby(content.internal_links), 'nearby grid');

  html = replaceOnce(html, /\{\{SERVICES_GRID\}\}/, renderServices(region), 'services grid');

  // The reviews section goes entirely rather than shipping the generated
  // placeholder quotes. These pages argue that the business does not invent
  // things; running invented testimonials underneath that argument would
  // undercut it, and GOOGLE_PLACE_ID is unset so the live rail has nothing to
  // show yet either. The header nav links Reviews to the homepage, not here, so
  // removing the section leaves no dangling anchor. Restore it once real
  // attributed reviews are configured.
  html = replaceOnce(
    html,
    /    <!-- ===================== TESTIMONIALS ===================== -->[\s\S]*?\n    <!-- ===================== FAQ ===================== -->/,
    '    <!-- ===================== FAQ ===================== -->',
    'testimonials section',
  );

  // Anything the suburb build would have filled and a hub does not use.
  html = html
    .replace(/\{\{ABOUT_US_P1\}\}/g, '')
    .replace(/\{\{ABOUT_US_P2\}\}/g, '')
    .replace(/\{\{HERO_SUBTITLE\}\}/g, '')
    .replace(/\{\{META_DESCRIPTION\}\}/g, '');

  const leftover = html.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) throw new Error(`build-region-hubs: unreplaced placeholder ${leftover[0]} in ${slug}`);

  return html;
}

function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('build-region-hubs: no content/regions directory, nothing to do.');
    return;
  }
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json')).sort();
  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8'));
    const html = buildPage(content, template);
    fs.writeFileSync(path.join(OUT_DIR, `${content._slug}.html`), html);
    console.log(
      `build-region-hubs: ${content._slug}.html (${content.sections.length} sections, ${content.faqs.length} FAQs)`,
    );
  }
}

if (require.main === module) main();
module.exports = { buildPage, renderSections, renderFaqList };
