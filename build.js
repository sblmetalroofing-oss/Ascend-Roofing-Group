import fs from "fs";
import path from "path";
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
  baseUrl: "https://ascendroofinggroup.com.au",
};

// Project Images (for randomization)
const PROJECT_IMAGES = [
  "20231130_153142.jpg",
  "20240307_171821.jpg",
  "DJI_20240427080531_0013_D_edited_edited.jpg",
  "IMG_4703.JPG",
  "dji_fly_20250220_134822_0091_1740023538708_photo_edited.png",
  "dji_fly_20250313_141642_0183_1741839576383_photo.JPEG",
];

const TEMPLATE_PLACEHOLDERS = [
  "../images/17964553073761123.avif",
  "../images/18055540900925803.avif",
  "../images/17845590288288225.avif",
];

// Utilities
function getSlug(name) {
  return name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function getRandomImages(count) {
  const shuffled = [...PROJECT_IMAGES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
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

  // Meta description variations for unique content across pages
  const META_DESCRIPTIONS = [
    `Looking for roofing in {{SUBURB}}? Ascend Roofing Group provides premium Colorbond® replacements, repairs, and new roofs in {{SUBURB}} {{POSTCODE}}. Call 0490 196 284.`,
    `Expert roof replacement in {{SUBURB}} {{POSTCODE}}. Family-owned Ascend Roofing Group delivers quality Colorbond® steel roofing with free quotes and no hidden fees. QBCC licensed.`,
    `Need a roofer in {{SUBURB}}? We specialise in Colorbond® metal roofing across {{REGION}}. 14+ years experience, 1,200+ roofs completed. Get your free quote today.`,
    `{{SUBURB}} roofing specialists. Ascend Roofing Group offers complete roof replacements, storm repairs, and new installations in {{SUBURB}} {{POSTCODE}}. Trusted across {{REGION}}.`,
    `Professional roofing services in {{SUBURB}} {{POSTCODE}}. From full Colorbond® re-roofs to gutters and insulation — Ascend Roofing Group has {{REGION}} covered. Call now.`,
    `Top-rated roofers serving {{SUBURB}} and {{REGION}}. Premium Colorbond® roof replacements and repairs with transparent pricing. QBCC licensed, fully insured. 0490 196 284.`,
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
  suburbs.forEach((suburb) => {
    const slug = getSlug(suburb.name);
    const filename = `roofing-${slug}.html`;
    const filePath = path.join(CONFIG.outputDir, filename);

    // Generate nearby suburbs HTML
    const nearbySuburbs = getNearbySuburbs(suburb, 6);
    const nearbyHtml = generateNearbyHtml(nearbySuburbs);
    const metaDesc = getMetaDescription(suburb);

    // Replace Content
    let content = templateContent
      .replace(/\{\{SUBURB\}\}/g, suburb.name)
      .replace(/\{\{REGION\}\}/g, suburb.region)
      .replace(/\{\{POSTCODE\}\}/g, suburb.postcode)
      .replace(/\{\{SLUG\}\}/g, slug)
      .replace(/\{\{NEARBY_SUBURBS\}\}/g, nearbyHtml)
      .replace(/\{\{META_DESCRIPTION\}\}/g, metaDesc);

    // Randomize Images
    const selectedImages = getRandomImages(3);
    TEMPLATE_PLACEHOLDERS.forEach((placeholder, index) => {
      content = content
        .split(placeholder)
        .join(`../images/${selectedImages[index]}`);
    });

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
      locationsGridHtml += `<a href='service-areas/${item.filename}' class='location-link' title='Roofing ${item.name}'>${item.name}</a>`;
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap"
        rel="stylesheet">
    <link rel="icon" href="./images/ROOFING GROUP.png" type="image/png">
    <!-- Google Analytics (Placeholder) -->
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
            border-color: var(--accent); 
            color: var(--text-primary); 
            transform: translateY(-2px);
        }
        .region-group { margin-bottom: 60px; }
        .region-title { 
            font-size: 1.5rem; 
            margin-bottom: 20px; 
            padding-bottom: 10px; 
            border-bottom: 1px solid var(--border-color);
            color: var(--accent);
            font-family: var(--font-heading);
        }
    </style>
    <script defer src="/_vercel/speed-insights/script.js"></script>
</head>
<body>
    <!-- ===================== NAVIGATION ===================== -->
    <nav class="navbar" id="navbar">
        <div class="container nav-container">
            <a href="index.html" class="nav-logo">
                <img src="./images/ROOFING GROUP.png" alt="Ascend Roofing Group Logo" class="logo-img">
            </a>
            <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation">
                <span></span><span></span><span></span>
            </button>
            <ul class="nav-menu" id="navMenu">
                <li><a href="index.html" class="nav-link">Home</a></li>
                <li><a href="index.html#services" class="nav-link">Services</a></li>
                <li><a href="index.html#gallery" class="nav-link">Projects</a></li>
                <li><a href="index.html#about" class="nav-link">About</a></li>
                <li><a href="locations.html" class="nav-link active">Locations</a></li>
                <li><a href="index.html#testimonials" class="nav-link">Reviews</a></li>
                <li><a href="index.html#contact" class="nav-link nav-cta">Get a Quote</a></li>
            </ul>
        </div>
    </nav>

    <section class="locations-hero">
        <div class="container">
            <h1>Our Service <span class="text-accent">Areas</span></h1>
            <p style="color: var(--text-secondary); max-width: 600px; margin: 20px auto;">We provide premium metal roofing services across South East Queensland. Find your suburb below.</p>
        </div>
    </section>

    <section class="section">
        <div class="container">
            ${locationsGridHtml}
        </div>
    </section>

    <!-- ===================== FOOTER ===================== -->
    <footer class="footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <a href="index.html" class="nav-logo">
                        <img src="./images/ROOFING GROUP.png" alt="Ascend Roofing Group Logo" class="logo-img">
                    </a>
                    <p>Family-owned metal roofing specialists serving Brisbane & the Gold Coast with premium Colorbond®
                        steel solutions.</p>
                </div>
                <div class="footer-links">
                    <h4>Quick Links</h4>
                    <ul>
                        <li><a href="index.html#services">Services</a></li>
                        <li><a href="index.html#about">About Us</a></li>
                        <li><a href="locations.html">Locations</a></li>
                        <li><a href="index.html#team">Our Team</a></li>
                        <li><a href="index.html#testimonials">Reviews</a></li>
                        <li><a href="index.html#contact">Contact</a></li>
                        <li><a href="terms.html">Terms & Conditions</a></li>
                        <li><a href="faq.html">FAQ</a></li>
                    </ul>
                </div>
                <div class="footer-links">
                    <h4>Services</h4>
                    <ul>
                        <li><a href="index.html#services">New Roof Installations</a></li>
                        <li><a href="index.html#services">Roof Replacements</a></li>
                        <li><a href="index.html#services">Roof Repairs</a></li>
                        <li><a href="index.html#services">Insulation Upgrades</a></li>
                        <li><a href="index.html#services">Gutters & Downpipes</a></li>
                    </ul>
                </div>
                <div class="footer-contact">
                    <h4>Get In Touch</h4>
                    <p><a href="tel:0490196284">📞 0490 196 284</a></p>
                    <p><a href="mailto:admin@ascendroofinggroup.com.au">✉️ admin@ascendroofinggroup.com.au</a></p>
                    <p>📍 Brisbane & Gold Coast, QLD</p>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2026 Ascend Roofing Group Pty Ltd. All rights reserved.</p>
                <p>QBCC Licensed | ABN Registered</p>
            </div>
        </div>
    </footer>
    <script src="script.js"></script>
</body>
</html>`;

  fs.writeFileSync(CONFIG.locationsPath, locationsTemplate);
  console.log("Generated locations.html index.");

  // 5. Generate Sitemap with lastmod dates
  const today = new Date().toISOString().split("T")[0];
  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${CONFIG.baseUrl}/</loc>
        <lastmod>${today}</lastmod>
        <priority>1.0</priority>
        <changefreq>weekly</changefreq>
    </url>
    <url>
        <loc>${CONFIG.baseUrl}/locations.html</loc>
        <lastmod>${today}</lastmod>
        <priority>0.9</priority>
        <changefreq>weekly</changefreq>
    </url>
    <url>
        <loc>${CONFIG.baseUrl}/faq.html</loc>
        <lastmod>${today}</lastmod>
        <priority>0.6</priority>
        <changefreq>monthly</changefreq>
    </url>
    <url>
        <loc>${CONFIG.baseUrl}/terms.html</loc>
        <lastmod>${today}</lastmod>
        <priority>0.3</priority>
        <changefreq>yearly</changefreq>
    </url>
    <url>
        <loc>${CONFIG.baseUrl}/privacy.html</loc>
        <lastmod>${today}</lastmod>
        <priority>0.3</priority>
        <changefreq>yearly</changefreq>
    </url>
    ${sitemapUrls
      .map(
        (url) => `
    <url>
        <loc>${url}</loc>
        <lastmod>${today}</lastmod>
        <priority>0.6</priority>
        <changefreq>monthly</changefreq>
    </url>`,
      )
      .join("")}
</urlset>`;

  fs.writeFileSync(CONFIG.sitemapPath, sitemapContent);
  console.log(
    `Sitemap generated at ${CONFIG.sitemapPath} with ${sitemapUrls.length + 2} URLs.`,
  );

  console.log("Build Complete!");
}

build().catch((err) => console.error(err));
