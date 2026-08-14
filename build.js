import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  templatePath: path.join(__dirname, "template.html"),
  suburbsPath: path.join(__dirname, "suburbs.json"),
  outputDir: path.join(__dirname, "service-areas"),
  locationsPath: path.join(__dirname, "locations.html"),
  sitemapPath: path.join(__dirname, "sitemap.xml"),
  baseUrl: "https://www.ascendroofinggroup.com.au",
};

// Utilities
function getSlug(name) {
  return name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// Escape a value for use inside a double-quoted HTML attribute.
function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Sitemap lastmod: the last commit date of the content inputs — deterministic
// per commit, so rebuilding without content changes produces no diff (CI
// enforces this) and Google isn't told unchanged pages are "new".
function getSiteLastmod() {
  const FALLBACK = "2026-07-10";
  try {
    // --no-merges: on a pull_request, Actions checks out a merge commit that
    // GitHub creates at test time, in its own timezone. That commit touches
    // whatever the PR touches, so without this it becomes the answer and the
    // date is "whenever CI happened to run" — which never matches the date
    // the author's build wrote. Only real content commits may set it.
    // Requires full history in CI (fetch-depth: 0 in .github/workflows/ci.yml).
    const out = execSync(
      "git log -1 --no-merges --format=%cs -- template.html suburbs.json build.js scripts/enrich-service-areas.cjs",
      { cwd: __dirname, encoding: "utf8" },
    ).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

// The review rail reads as a fan: outer cards tilt, the middle one sits
// flat and forward. The homepage sets these classes by hand; generated
// pages get them here.
function tiltReviewCards(html) {
  const tiltClasses = ["t-review-card t-tilt-l", "t-review-card t-feature", "t-review-card t-tilt-r"];
  let i = 0;
  return html.replace(/class='t-review-card'/g, () => {
    const cls = tiltClasses[i % tiltClasses.length];
    i++;
    return `class='${cls}'`;
  });
}

// Main Build Function
async function build() {
  console.log("Starting Build Process...");

  // 1. Ensure Output Directory Exists
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // 2. Read Source Files
  const templateContent = fs.readFileSync(CONFIG.templatePath, "utf8");
  const suburbs = JSON.parse(fs.readFileSync(CONFIG.suburbsPath, "utf8"));

  console.log(`Found ${suburbs.length} suburbs.`);

  const regions = {};
  let sitemapUrls = [];

  // Pre-build region lookup for nearby suburbs
  const regionMap = {};
  suburbs.forEach((s) => {
    if (!regionMap[s.region]) regionMap[s.region] = [];
    regionMap[s.region].push(s);
  });
  const allRegions = Object.keys(regionMap);

  // Function to get nearby suburbs (same region first, then adjacent)
  function getNearbySuburbs(currentSuburb, count = 6) {
    const sameRegion = regionMap[currentSuburb.region].filter(
      (s) => s.name !== currentSuburb.name,
    );

    // Shuffle same-region suburbs deterministically based on suburb name
    const seed = currentSuburb.name
      .split("")
      .reduce((a, c) => a + c.charCodeAt(0), 0);
    const shuffled = [...sameRegion].sort((a, b) => {
      const ha = (a.name.charCodeAt(0) * 31 + seed) % 1000;
      const hb = (b.name.charCodeAt(0) * 31 + seed) % 1000;
      return ha - hb;
    });

    let nearby = shuffled.slice(0, count);

    // If not enough in same region, pull from other regions
    if (nearby.length < count) {
      const others = suburbs
        .filter(
          (s) =>
            s.name !== currentSuburb.name && s.region !== currentSuburb.region,
        )
        .slice(0, count - nearby.length);
      nearby = nearby.concat(others);
    }

    return nearby.slice(0, count);
  }

  // Function to generate nearby suburbs HTML
  function generateNearbyHtml(nearbyList) {
    return nearbyList
      .map((s) => {
        const slug = getSlug(s.name);
        return `<a href="roofing-${slug}.html" class="nearby-card" title="Roofing ${s.name}"><span class="nearby-name">${s.name}</span><span class="nearby-region">${s.region} ${s.postcode}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17l9.2-9.2M17 17V7.8H7.8"/></svg></a>`;
      })
      .join("\n                ");
  }

  // ── Content spinning arrays (match generate_pages.ps1) ──
  const HERO_SUBTITLES = [
    "Family-owned roofing specialists providing top-quality Colorbond® installations and repairs for homes in <strong>{{SUBURB}} {{POSTCODE}}</strong> and surrounding areas.",
    "Your local experts in metal roofing. We deliver durable and stunning Colorbond® solutions tailored exactly for properties in <strong>{{SUBURB}} {{POSTCODE}}</strong>.",
    "With over a decade of experience, we provide trusted roof replacements, repairs, and fresh installations for homeowners across <strong>{{SUBURB}}</strong>.",
    "As {{REGION}}'s premier roofing team, we pride ourselves on exceptional craftsmanship and premium materials for every project in <strong>{{SUBURB}} {{POSTCODE}}</strong>.",
  ];

  const ABOUT_US_P1 = [
    "Ascend Roofing Group is a proudly family-owned and operated business serving {{SUBURB}} and the wider {{REGION}} region. With over 14 years of hands-on experience in the roofing industry, we've built our reputation on quality workmanship, honest advice, and delivering results that stand the test of time.",
    "When it comes to metal roofing in {{SUBURB}}, Ascend Roofing Group is the name you can trust. Over the last 14+ years, our family business has dedicated itself to providing top-tier Colorbond® installations and unmatched customer service throughout the {{REGION}} area.",
    "Looking for reliable roofers in {{SUBURB}}? Ascend Roofing Group brings over 14 years of dedicated expertise to every job. As a family-run company, we focus on high-quality materials, transparent communication, and ensuring your roof is built to last in the Queensland climate.",
  ];

  const ABOUT_US_P2 = [
    "We understand the specific needs of homes in {{SUBURB}}. Whether you need a full roof replacement or minor repairs, our team treats every project with the same dedication and attention to detail.",
    "No matter the size of the project in {{SUBURB}} — from fixing a stubborn leak to a complete roof transformation — our experienced tradespeople approach the work with maximum care and precision.",
    "Every property in {{SUBURB}} is unique, which is why we offer tailored roofing solutions. We take the time to inspect, quote accurately, and deliver a finished product that significantly boosts your home's curbside appeal and protection.",
  ];

  const SERVICES_CARDS = [
    `<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><path d='M24 6L4 22h8v18h24V22h8L24 6z'/><path d='M18 40V28h12v12'/></svg></div><h3>New Roofs in {{SUBURB}}</h3><p>Building a new home in {{SUBURB}}? We install premium Colorbond® steel roofing designed to last.</p></div>`,
    `<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><path d='M8 18L24 6l16 12'/><path d='M12 22v18h24V22'/><path d='M6 40h36'/><path d='M20 32h8M24 28v8'/></svg></div><h3>Roof Replacements</h3><p>Upgrade your old {{SUBURB}} roof. Complete tear-off and replacement with modern metal roofing.</p></div>`,
    `<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><path d='M10 24L24 12l14 12'/><path d='M14 28v12h20V28'/><circle cx='34' cy='18' r='6'/><path d='M31 18l2 2 4-4'/></svg></div><h3>Leak Repairs</h3><p>Fast, reliable repairs for leaks and storm damage in the {{SUBURB}} {{POSTCODE}} area.</p></div>`,
    `<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><rect x='8' y='16' width='32' height='24' rx='2'/><path d='M8 22h32'/><path d='M8 28h32'/><path d='M8 34h32'/><path d='M16 16V12M32 16V12'/></svg></div><h3>Insulation Upgrades</h3><p>Keep your {{SUBURB}} home cooler. Energy-efficient insulation solutions installed under your roof.</p></div>`,
    `<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><path d='M12 8v32'/><path d='M12 40c4-8 4-16 0-24'/><path d='M12 40c-4-8-4-16 0-24'/><path d='M8 40h8'/><path d='M28 14h12v26H28z'/><path d='M28 22h12'/><path d='M28 30h12'/></svg></div><h3>Gutters &amp; Downpipes</h3><p>Seamless gutter and downpipe installation to protect your property from heavy rainfall.</p></div>`,
    `<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><circle cx='24' cy='24' r='8'/><path d='M24 4v8M24 36v8M4 24h8M36 24h8M8.93 8.93l5.66 5.66M33.41 33.41l5.66 5.66M8.93 39.07l5.66-5.66M33.41 14.59l5.66-5.66'/></svg></div><h3>Skylights &amp; Whirlybirds</h3><p>Natural lighting and ventilation solutions for homes and businesses in {{REGION}}.</p></div>`,
  ];

  // TODO(owner): replace these representative testimonials with real,
  // attributed customer reviews (names used with permission).
  const TESTIMONIALS_CARDS = [
    `<div class='t-review-card' data-reveal><div class='t-stars' aria-hidden='true'>★★★★★</div><p>"Ascend Roofing replaced our entire roof in just three days. The team was professional, tidy, and the new Colorbond roof looks absolutely stunning. Couldn't be happier!"</p><div class='t-who'><strong>Homeowner</strong> &middot; <span>Brisbane</span></div></div>`,
    `<div class='t-review-card' data-reveal><div class='t-stars' aria-hidden='true'>★★★★★</div><p>"After the last big storm we needed urgent repairs. The team were out the next day and had everything sealed up perfectly. Great communication from start to finish."</p><div class='t-who'><strong>Local Resident</strong> &middot; <span>South East Queensland</span></div></div>`,
    `<div class='t-review-card' data-reveal><div class='t-stars' aria-hidden='true'>★★★★★</div><p>"We got three quotes and Ascend was the most transparent and competitive. No hidden fees, honest advice, and the workmanship is top-notch. Highly recommend this family business."</p><div class='t-who'><strong>Property Manager</strong> &middot; <span>Logan</span></div></div>`,
    `<div class='t-review-card' data-reveal><div class='t-stars' aria-hidden='true'>★★★★★</div><p>"Absolutely thrilled with the new roof. The guys worked incredibly hard and left the site spotless. Would definitely use Ascend Roofing Group again."</p><div class='t-who'><strong>Homeowner</strong> &middot; <span>Gold Coast</span></div></div>`,
    `<div class='t-review-card' data-reveal><div class='t-stars' aria-hidden='true'>★★★★★</div><p>"Prompt, polite, and well priced. They fixed a leak that two other companies couldn't find. Excellent service."</p><div class='t-who'><strong>Property Owner</strong> &middot; <span>Ipswich</span></div></div>`,
    `<div class='t-review-card' data-reveal><div class='t-stars' aria-hidden='true'>★★★★★</div><p>"From the initial quote to the final inspection, everything was seamless. High-quality Colorbond installation and friendly staff."</p><div class='t-who'><strong>Homeowner</strong> &middot; <span>Moreton Bay</span></div></div>`,
  ];

  // Deterministic pick from array based on suburb name hash
  function pick(arr, suburb, offset = 0) {
    const hash = suburb.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return arr[(hash + offset) % arr.length];
  }

  // Meta description variations for unique content across pages
  const META_DESCRIPTIONS = [
    `Looking for roofing in {{SUBURB}}? Ascend Roofing Group provides premium Colorbond® replacements, repairs, and new roofs in {{SUBURB}} {{POSTCODE}}. Call 0419 098 049.`,
    `Expert roof replacement in {{SUBURB}} {{POSTCODE}}. Family-owned Ascend Roofing Group delivers quality Colorbond® steel roofing with free quotes and no hidden fees. QBCC licensed.`,
    `Need a roofer in {{SUBURB}}? We specialise in Colorbond® metal roofing across {{REGION}}. 14+ years experience, 1,200+ roofs completed. Get your free quote today.`,
    `{{SUBURB}} roofing specialists. Ascend Roofing Group offers complete roof replacements, storm repairs, and new installations in {{SUBURB}} {{POSTCODE}}. Trusted across {{REGION}}.`,
    `Professional roofing services in {{SUBURB}} {{POSTCODE}}. From full Colorbond® re-roofs to gutters and insulation — Ascend Roofing Group has {{REGION}} covered. Call now.`,
    `Top-rated roofers serving {{SUBURB}} and {{REGION}}. Premium Colorbond® roof replacements and repairs with transparent pricing. QBCC licensed, fully insured. 0419 098 049.`,
    `Ascend Roofing Group — your local {{SUBURB}} roofing experts. Quality Colorbond® installations, fast turnarounds, and honest pricing across {{REGION}}. Free on-site quotes.`,
    `Roof replacement in {{SUBURB}}? Get a free quote from Ascend Roofing Group. We install premium Colorbond® steel roofing across {{REGION}} with a focus on quality and value.`,
  ];

  // Deterministic meta description selection based on suburb name
  function getMetaDescription(suburb) {
    const hash = suburb.name
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const index = hash % META_DESCRIPTIONS.length;
    return META_DESCRIPTIONS[index]
      .replace(/\{\{SUBURB\}\}/g, suburb.name)
      .replace(/\{\{REGION\}\}/g, suburb.region)
      .replace(/\{\{POSTCODE\}\}/g, suburb.postcode);
  }

  // 3. Generate Suburb Pages
  const seenSlugs = new Set();
  suburbs.forEach((suburb) => {
    const slug = getSlug(suburb.name);
    if (seenSlugs.has(slug)) {
      console.warn(`Duplicate suburb entry skipped: ${suburb.name} (${slug})`);
      return;
    }
    seenSlugs.add(slug);
    const filename = `roofing-${slug}.html`;
    const filePath = path.join(CONFIG.outputDir, filename);

    // Generate nearby suburbs HTML
    const nearbySuburbs = getNearbySuburbs(suburb, 6);
    const nearbyHtml = generateNearbyHtml(nearbySuburbs);
    const metaDesc = getMetaDescription(suburb);

    // Build spinning content (deterministic)
    const heroSubtitle = pick(HERO_SUBTITLES, suburb)
      .replace(/\{\{SUBURB\}\}/g, suburb.name)
      .replace(/\{\{REGION\}\}/g, suburb.region)
      .replace(/\{\{POSTCODE\}\}/g, suburb.postcode);

    const aboutP1 = pick(ABOUT_US_P1, suburb, 1)
      .replace(/\{\{SUBURB\}\}/g, suburb.name)
      .replace(/\{\{REGION\}\}/g, suburb.region)
      .replace(/\{\{POSTCODE\}\}/g, suburb.postcode);

    const aboutP2 = pick(ABOUT_US_P2, suburb, 2)
      .replace(/\{\{SUBURB\}\}/g, suburb.name)
      .replace(/\{\{REGION\}\}/g, suburb.region)
      .replace(/\{\{POSTCODE\}\}/g, suburb.postcode);

    // Build services grid — all 6 cards, suburb-localised
    const servicesGrid = SERVICES_CARDS.map((card) =>
      card
        .replace(/\{\{SUBURB\}\}/g, suburb.name)
        .replace(/\{\{REGION\}\}/g, suburb.region)
        .replace(/\{\{POSTCODE\}\}/g, suburb.postcode),
    ).join("\n");

    // Pick 3 testimonials deterministically
    const hash = suburb.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const t1 = TESTIMONIALS_CARDS[hash % TESTIMONIALS_CARDS.length];
    const t2 = TESTIMONIALS_CARDS[(hash + 2) % TESTIMONIALS_CARDS.length];
    const t3 = TESTIMONIALS_CARDS[(hash + 4) % TESTIMONIALS_CARDS.length];
    const testimonialsGrid = [t1, t2, t3].join("\n");

    // Replace Content
    let content = templateContent
      .replace(/\{\{SUBURB\}\}/g, suburb.name)
      .replace(/\{\{REGION\}\}/g, suburb.region)
      .replace(/\{\{POSTCODE\}\}/g, suburb.postcode)
      .replace(/\{\{SLUG\}\}/g, slug)
      .replace(
        /\{\{SUBURB_QUERY\}\}/g,
        encodeURIComponent(`${suburb.name} QLD`),
      )
      .replace(/\{\{NEARBY_SUBURBS\}\}/g, nearbyHtml)
      .replace(/\{\{META_DESCRIPTION\}\}/g, metaDesc)
      .replace(/\{\{HERO_SUBTITLE\}\}/g, heroSubtitle)
      .replace(/\{\{ABOUT_US_P1\}\}/g, aboutP1)
      .replace(/\{\{ABOUT_US_P2\}\}/g, aboutP2)
      .replace(/\{\{SERVICES_GRID\}\}/g, servicesGrid)
      .replace(/\{\{TESTIMONIALS_GRID\}\}/g, tiltReviewCards(testimonialsGrid));

    // Write File
    fs.writeFileSync(filePath, content);

    // Collect Data for Locations & Sitemap
    if (!regions[suburb.region]) {
      regions[suburb.region] = [];
    }
    regions[suburb.region].push({ name: suburb.name, filename: filename });

    sitemapUrls.push(`${CONFIG.baseUrl}/service-areas/${filename}`);
  });

  console.log("Generated all suburb pages.");

  // 4. Generate Locations Index
  let locationsGridHtml = "";

  // Sort Regions
  const sortedRegions = Object.keys(regions).sort();

  sortedRegions.forEach((region) => {
    locationsGridHtml += `<div class='region-group'><h2 class='region-title'>${region}</h2><div class='locations-grid'>`;

    // Sort Suburbs within Region
    const sortedSuburbs = regions[region].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    sortedSuburbs.forEach((item) => {
      // Double-quoted attributes + escaping: suburb names can contain
      // apostrophes (D'Aguilar), which broke the single-quoted title attr.
      locationsGridHtml += `<a href="service-areas/${item.filename}" class="location-link" title="Roofing ${escapeAttr(item.name)}">${item.name}</a>`;
    });

    locationsGridHtml += `</div></div>`;
  });

  const locationsTemplate = `<!DOCTYPE html>
<html lang="en-AU">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ascend Roofing Group Service Areas | Brisbane & Gold Coast</title>
    <meta name="description" content="Ascend Roofing Group serves all suburbs across Brisbane, Gold Coast, Logan, Ipswich, and Moreton Bay. Find your local roofing specialist here.">
    <link rel="canonical" href="https://www.ascendroofinggroup.com.au/locations.html">
    <meta property="og:title" content="Ascend Roofing Group Service Areas | Brisbane &amp; Gold Coast">
    <meta property="og:description" content="Roof replacement and metal roofing across all Brisbane, Gold Coast, Logan, Ipswich and Moreton Bay suburbs. Find your local area.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://www.ascendroofinggroup.com.au/locations.html">
    <meta property="og:image" content="https://www.ascendroofinggroup.com.au/images/ROOFING GROUP.png">
    <meta property="og:site_name" content="Ascend Roofing Group">
    <meta property="og:locale" content="en_AU">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Ascend Roofing Group Service Areas | Brisbane &amp; Gold Coast">
    <meta name="twitter:description" content="Roof replacement and metal roofing across all Brisbane, Gold Coast, Logan, Ipswich and Moreton Bay suburbs.">
    <meta name="twitter:image" content="https://www.ascendroofinggroup.com.au/images/ROOFING GROUP.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap"
        rel="stylesheet">
    <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <meta name="theme-color" content="#0a0a0a">
    <!-- TODO(owner): supply a GA4 measurement ID, then uncomment (also in
         template.html, index.html, and the hand-written page heads) -->
    <!-- <script async src="https://www.googletagmanager.com/gtag/js?id=YOUR_ID_HERE"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'YOUR_ID_HERE');
    </script> -->
    <link rel="stylesheet" href="styles.css">
    <style>
        .locations-hero { 
            padding: 160px 0 80px; 
            text-align: center; 
            background: linear-gradient(rgba(17, 24, 39, 0.8), rgba(17, 24, 39, 0.8)), url('./images/dji_fly_20250313_141642_0183_1741839576383_photo.JPEG') no-repeat center center/cover;
            color: #ffffff;
        }
        .locations-hero h1 { color: #ffffff; }
        .locations-hero p { color: rgba(255, 255, 255, 0.9) !important; }
        .locations-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-top: 40px; }
        .location-link { 
            display: block; 
            padding: 12px 16px; 
            background: var(--bg-card); 
            border: 1px solid var(--border-color); 
            border-radius: var(--radius-sm); 
            color: var(--text-secondary); 
            transition: var(--transition);
            text-decoration: none;
        }
        .location-link:hover { 
            background: var(--bg-card-hover); 
            border-color: var(--accent-link); 
            color: var(--text-primary); 
            transform: translateY(-2px);
        }
        .region-group { margin-bottom: 60px; }
        .region-title { 
            font-size: 1.5rem; 
            margin-bottom: 20px; 
            padding-bottom: 10px; 
            border-bottom: 1px solid var(--border-color);
            color: var(--accent-link);
            font-family: var(--font-heading);
        }
    </style>
    <script defer src="/_vercel/speed-insights/script.js"></script>
    <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
    <a class="skip-link" href="#main">Skip to content</a>
    <!-- ===================== HEADER (utility bar + nav) ===================== -->
    <header class="t-header">
        <div class="t-utility-bar">
            <div class="t-logo-panel">
                <a href="/" aria-label="Ascend Roofing Group home">
                    <img src="./images/ROOFING GROUP.png" alt="Ascend Roofing Group Logo" width="400" height="400">
                </a>
            </div>
            <div class="t-utility-inner">
                <div class="t-availability"><span class="t-pulse"></span> Available 7 Days</div>
                <div class="t-utility-right">
                    <a href="tel:0419098049" class="t-btn t-btn-accent">0419 098 049</a>
                    <a href="/#contact" class="t-btn t-btn-ghost">Get a Quote</a>
                </div>
            </div>
        </div>
        <nav class="t-navbar" id="navbar" aria-label="Main navigation">
            <button class="t-nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="navMenu">
                <span></span><span></span><span></span>
            </button>
            <ul class="t-nav-menu" id="navMenu">
                <li><a href="/">Home</a></li>
                <li><a href="/#about">About Us</a></li>
                <li><a href="/#services">Our Services</a></li>
                <li><a href="blog/">Blog</a></li>
                <li><a href="faq.html">FAQ's</a></li>
                <li><a href="/#testimonials">Reviews</a></li>
                <li><a href="locations.html" class="active">Areas We Service</a></li>
                <li><a href="/#contact">Contact Us</a></li>
            </ul>
        </nav>
    </header>
    <div class="t-nav-overlay" id="navOverlay"></div>

    <main id="main">
    <section class="locations-hero">
        <div class="container">
            <h1>Our Service <span class="text-accent">Areas</span></h1>
            <p style="color: var(--text-secondary); max-width: 600px; margin: 20px auto;">We provide premium metal roofing services across South East Queensland. Find your suburb below.</p>
        </div>
    </section>

    <div class="t-marquee" aria-label="Why homeowners trust Ascend Roofing Group">
        <div class="t-marquee-track">
            <span>Workmanship Guarantee</span><span>&#9670;</span>
            <span>QBCC Licensed &amp; Insured</span><span>&#9670;</span>
            <span>Free Written Quotes</span><span>&#9670;</span>
            <span>Genuine Colorbond&reg; Steel</span><span>&#9670;</span>
            <span>Family Owned &amp; Operated</span><span>&#9670;</span>
            <span>Workmanship Guarantee</span><span>&#9670;</span>
            <span>QBCC Licensed &amp; Insured</span><span>&#9670;</span>
            <span>Free Written Quotes</span><span>&#9670;</span>
            <span>Genuine Colorbond&reg; Steel</span><span>&#9670;</span>
            <span>Family Owned &amp; Operated</span><span>&#9670;</span>
        </div>
    </div>

    <section class="t-section t-section--light section">
        <div class="container">
            ${locationsGridHtml}
        </div>
    </section>
    <section class="t-cta-strip">
        <div class="t-container">
            <span class="t-eyebrow">Free Quote &middot; No Obligation</span>
            <h2>Ready to Get Started?</h2>
            <div class="t-actions">
                <a href="tel:0419098049" class="t-btn t-btn-accent">0419 098 049</a>
                <a href="/#contact" class="t-btn t-btn-ghost">Get a Free Quote</a>
            </div>
        </div>
    </section>

    </main>

    <!-- ===================== FOOTER ===================== -->
    <footer class="footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <a href="/" class="nav-logo">
                        <img src="./images/ROOFING GROUP.png" alt="Ascend Roofing Group Logo" class="logo-img" width="400" height="400" loading="lazy">
                    </a>
                    <p>Family-owned metal roofing specialists serving Brisbane & the Gold Coast with premium Colorbond®
                        steel solutions.</p>
                </div>
                <div class="footer-links">
                    <h4>Quick Links</h4>
                    <ul>
                        <li><a href="/#services">Services</a></li>
                        <li><a href="/#about">About Us</a></li>
                        <li><a href="locations.html">Locations</a></li>
                        <li><a href="/#team">Our Team</a></li>
                        <li><a href="/#testimonials">Reviews</a></li>
                        <li><a href="/#contact">Contact</a></li>
                        <li><a href="terms.html">Terms & Conditions</a></li>
                        <li><a href="faq.html">FAQ</a></li>
                    </ul>
                </div>
                <div class="footer-links">
                    <h4>Services</h4>
                    <ul>
                        <li><a href="new-roof-installation-brisbane.html">New Roof Installations</a></li>
                        <li><a href="roof-replacement.html">Roof Replacements</a></li>
                        <li><a href="roof-repairs-brisbane.html">Roof Repairs</a></li>
                        <li><a href="roof-insulation-brisbane.html">Insulation Upgrades</a></li>
                        <li><a href="gutters-downpipes-brisbane.html">Gutters &amp; Downpipes</a></li>
                        <li><a href="blog/">Roofing Blog</a></li>
                    </ul>
                </div>
                <div class="footer-contact">
                    <h4>Get In Touch</h4>
                    <p><a href="tel:0419098049">📞 0419 098 049</a></p>
                    <p><a href="mailto:admin@ascendroofinggroup.com.au">✉️ admin@ascendroofinggroup.com.au</a></p>
                    <p>📍 Brisbane & Gold Coast, QLD</p>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2026 Ascend Roofing Group Pty Ltd. All rights reserved.</p>
                <!-- TODO(owner): replace "ABN Registered" with the actual ABN, e.g. "ABN 12 345 678 901" -->
                <p>QBCC Lic. 15600031 | ABN Registered</p>
            </div>
        </div>
    </footer>
    <script src="script.js"></script>
</body>
</html>`;

  fs.writeFileSync(CONFIG.locationsPath, locationsTemplate);
  console.log("Generated locations.html index.");

  // 5. Generate Sitemap with lastmod dates
  const siteLastmod = getSiteLastmod();

  // Static pages. Blog posts keep their real publish/update dates; everything
  // else uses the content lastmod so unchanged rebuilds produce no diff.
  const STATIC_URLS = [
    { loc: "/", priority: "1.0", changefreq: "weekly" },
    { loc: "/locations.html", priority: "0.9", changefreq: "weekly" },
    { loc: "/roof-replacement.html", priority: "0.8", changefreq: "monthly" },
    { loc: "/roof-repairs-brisbane.html", priority: "0.8", changefreq: "monthly" },
    { loc: "/new-roof-installation-brisbane.html", priority: "0.8", changefreq: "monthly" },
    { loc: "/roof-insulation-brisbane.html", priority: "0.8", changefreq: "monthly" },
    { loc: "/gutters-downpipes-brisbane.html", priority: "0.8", changefreq: "monthly" },
    { loc: "/skylights-whirlybirds-brisbane.html", priority: "0.8", changefreq: "monthly" },
    { loc: "/blog/", priority: "0.7", changefreq: "weekly" },
    { loc: "/faq.html", priority: "0.6", changefreq: "monthly" },
    { loc: "/terms.html", priority: "0.3", changefreq: "yearly" },
    { loc: "/privacy.html", priority: "0.3", changefreq: "yearly" },
    { loc: "/blog/asbestos-roof-removal-brisbane-guide.html", priority: "0.6", changefreq: "monthly", lastmod: "2026-03-08" },
    { loc: "/blog/best-metal-roofing-materials-queensland-2026.html", priority: "0.6", changefreq: "monthly", lastmod: "2026-03-08" },
    { loc: "/blog/how-much-roof-replacement-cost-brisbane-2026.html", priority: "0.6", changefreq: "monthly", lastmod: "2026-03-08" },
    { loc: "/blog/signs-roof-needs-replacing-brisbane.html", priority: "0.6", changefreq: "monthly", lastmod: "2026-03-08" },
    { loc: "/blog-colorbond-roof-replacement-brisbane-gold-coast.html", priority: "0.6", changefreq: "monthly" },
    { loc: "/blog/storm-damage-roof-repair-insurance-claims-brisbane.html", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-30" },
    { loc: "/blog/roof-restoration-vs-replacement-brisbane.html", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-30" },
    { loc: "/blog/how-to-choose-colorbond-roof-colour-queensland.html", priority: "0.6", changefreq: "monthly", lastmod: "2026-05-30" },
  ];

  const renderUrl = ({ loc, priority, changefreq, lastmod }) => `
    <url>
        <loc>${loc.startsWith("http") ? loc : CONFIG.baseUrl + loc}</loc>
        <lastmod>${lastmod || siteLastmod}</lastmod>
        <priority>${priority}</priority>
        <changefreq>${changefreq}</changefreq>
    </url>`;

  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${STATIC_URLS.map(renderUrl).join("")}${sitemapUrls
    .map((url) => renderUrl({ loc: url, priority: "0.6", changefreq: "monthly" }))
    .join("")}
</urlset>`;

  fs.writeFileSync(CONFIG.sitemapPath, sitemapContent);
  console.log(
    `Sitemap generated at ${CONFIG.sitemapPath} with ${STATIC_URLS.length + sitemapUrls.length} URLs (lastmod ${siteLastmod}).`,
  );

  stampAssetVersions();

  console.log("Build Complete!");
}

/**
 * styles.css and script.js are served with max-age=3600 and
 * stale-while-revalidate=86400 (see vercel.json), but the pages link to
 * them by bare filename. After a deploy a returning visitor can pair the
 * NEW html with CSS up to a day old, which renders the new markup
 * unstyled. Stamping a content hash onto the URLs makes each deploy
 * fetch fresh assets while keeping the long cache lifetime for
 * unchanged ones.
 */
function stampAssetVersions() {
  const hash = (file) =>
    crypto
      .createHash("md5")
      .update(fs.readFileSync(path.join(__dirname, file)))
      .digest("hex")
      .slice(0, 8);

  const cssV = hash("styles.css");
  const jsV = hash("script.js");

  // template.html is a build input, not a served page — the suburb pages it
  // generates are stamped below on their own. Stamping it too fed a loop: a
  // styles.css edit rewrote the template, and the template is one of the
  // inputs getSiteLastmod() watches, so every styling change re-dated the
  // whole sitemap and the drift check went red.
  // Every directory that ships HTML. blog/ was missed on the first pass,
  // so those pages would have kept serving stale CSS after a deploy.
  const dirs = [__dirname, CONFIG.outputDir, path.join(__dirname, "blog")];
  const targets = dirs
    .filter((d) => fs.existsSync(d))
    .flatMap((d) =>
      fs
        .readdirSync(d)
        .filter((f) => f.endsWith(".html") && f !== "template.html")
        .map((f) => path.join(d, f)),
    );

  let changed = 0;
  for (const file of targets) {
    const before = fs.readFileSync(file, "utf8");
    const after = before
      .replace(/(href="(?:\.\.\/|\/)?styles\.css)(?:\?v=[0-9a-f]+)?"/g, `$1?v=${cssV}"`)
      .replace(/(src="(?:\.\.\/|\/)?script\.js)(?:\?v=[0-9a-f]+)?"/g, `$1?v=${jsV}"`);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed++;
    }
  }

  console.log(
    `Stamped asset versions (css ${cssV}, js ${jsV}) across ${changed} pages.`,
  );
}

build().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
