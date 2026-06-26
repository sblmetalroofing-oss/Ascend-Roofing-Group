$ScriptPath = $PSScriptRoot
$TemplatePath = Join-Path $ScriptPath "template.html"
$SuburbsPath = Join-Path $ScriptPath "suburbs.json"
$OutputPath = Join-Path $ScriptPath "service-areas"
$LocationsTemplatePath = Join-Path $ScriptPath "locations.html"

Write-Host "Starting SEO Landing Page Generation (Ascend Roofing Group)..."

# Read Template
$TemplateContent = Get-Content -Path $TemplatePath -Raw
if (-not $TemplateContent) {
    Write-Error "Template file not found at $TemplatePath"
    exit 1
}

# Read Suburbs JSON
$SuburbsJson = Get-Content -Path $SuburbsPath -Raw | ConvertFrom-Json
if (-not $SuburbsJson) {
    Write-Error "Suburbs JSON not found or invalid at $SuburbsPath"
    exit 1
}

Write-Host "Found $($SuburbsJson.Count) suburbs."

$Regions = @{}

# List of available project images
$ProjectImages = @(
    "20231130_153142.jpg",
    "20240307_171821.jpg",
    "DJI_20240427080531_0013_D_edited_edited.jpg",
    "IMG_4703.JPG",
    "dji_fly_20250220_134822_0091_1740023538708_photo_edited.png",
    "dji_fly_20250313_141642_0183_1741839576383_photo.JPEG"
)

# Placeholder images in template to replace
$TemplateImages = @(
    "./images/17964553073761123.avif",
    "./images/18055540900925803.avif",
    "./images/17845590288288225.avif"
)

# Create Slug Function
function Get-Slug {
    param ([string]$Name)
    $Name = $Name.ToLower()
    $Name = $Name -replace " ", "-"
    $Name = $Name -replace "[^a-z0-9-]", ""
    return $Name
}

# Generate Pages
foreach ($Suburb in $SuburbsJson) {
    $Slug = Get-Slug -Name $Suburb.name
    $Filename = "roofing-$Slug.html"
    $FilePath = Join-Path $OutputPath $Filename
    
    $Content = $TemplateContent.Replace("{{SUBURB}}", $Suburb.name)
    $Content = $Content.Replace("{{REGION}}", $Suburb.region)
    $Content = $Content.Replace("{{POSTCODE}}", $Suburb.postcode)
    $Content = $Content.Replace("{{SLUG}}", $Slug)

    # Content Spinning Arrays
    $HeroSubtitles = @(
        "Family-owned roofing specialists providing top-quality Colorbond® installations and repairs for homes in <strong>$($Suburb.name) $($Suburb.postcode)</strong> and surrounding areas.",
        "Your local experts in metal roofing. We deliver durable and stunning Colorbond® solutions tailored exactly for properties in <strong>$($Suburb.name) $($Suburb.postcode)</strong>.",
        "With over a decade of experience, we provide trusted roof replacements, repairs, and fresh installations for homeowners across <strong>$($Suburb.name)</strong>.",
        "As $($Suburb.region)'s premier roofing team, we pride ourselves on exceptional craftsmanship and premium materials for every project in <strong>$($Suburb.name) $($Suburb.postcode)</strong>."
    )
    
    $AboutUsP1 = @(
        "Ascend Roofing Group is a proudly family-owned and operated business serving $($Suburb.name) and the wider $($Suburb.region) region. With over 14 years of hands-on experience in the roofing industry, we've built our reputation on quality workmanship, honest advice, and delivering results that stand the test of time.",
        "When it comes to metal roofing in $($Suburb.name), Ascend Roofing Group is the name you can trust. Over the last 14+ years, our family business has dedicated itself to providing top-tier Colorbond® installations and unmatched customer service throughout the $($Suburb.region) area.",
        "Looking for reliable roofers in $($Suburb.name)? Ascend Roofing Group brings over 14 years of dedicated expertise to every job. As a family-run company, we focus on high-quality materials, transparent communication, and ensuring your roof is built to last in the Queensland climate."
    )

    $AboutUsP2 = @(
        "We understand the specific needs of homes in $($Suburb.name). Whether you need a full roof replacement or minor repairs, our team treats every project with the same dedication and attention to detail.",
        "No matter the size of the project in $($Suburb.name) - from fixing a stubborn leak to a complete roof transformation - our experienced tradespeople approach the work with maximum care and precision.",
        "Every property in $($Suburb.name) is unique, which is why we offer tailored roofing solutions. We take the time to inspect, quote accurately, and deliver a finished product that significantly boosts your home's curbside appeal and protection."
    )

    $ServicesList = @(
        "<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><path d='M24 6L4 22h8v18h24V22h8L24 6z'/><path d='M18 40V28h12v12'/></svg></div><h3>New Roofs in $($Suburb.name)</h3><p>Building a new home in $($Suburb.name)? We install premium Colorbond® steel roofing designed to last.</p></div>",
        "<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><path d='M8 18L24 6l16 12'/><path d='M12 22v18h24V22'/><path d='M6 40h36'/><path d='M20 32h8M24 28v8'/></svg></div><h3>Roof Replacements</h3><p>Upgrade your old $($Suburb.name) roof. Complete tear-off and replacement with modern metal roofing.</p></div>",
        "<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><path d='M10 24L24 12l14 12'/><path d='M14 28v12h20V28'/><circle cx='34' cy='18' r='6'/><path d='M31 18l2 2 4-4'/></svg></div><h3>Leak Repairs</h3><p>Fast, reliable repairs for leaks and storm damage in the $($Suburb.name) $($Suburb.postcode) area.</p></div>",
        "<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><rect x='8' y='16' width='32' height='24' rx='2'/><path d='M8 22h32'/><path d='M8 28h32'/><path d='M8 34h32'/><path d='M16 16V12M32 16V12'/></svg></div><h3>Insulation Upgrades</h3><p>Keep your $($Suburb.name) home cooler. Energy-efficient insulation solutions installed under your roof.</p></div>",
        "<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><path d='M12 8v32'/><path d='M12 40c4-8 4-16 0-24'/><path d='M12 40c-4-8-4-16 0-24'/><path d='M8 40h8'/><path d='M28 14h12v26H28z'/><path d='M28 22h12'/><path d='M28 30h12'/></svg></div><h3>Gutters & Downpipes</h3><p>Seamless gutter and downpipe installation to protect your property from heavy rainfall.</p></div>",
        "<div class='service-card' data-reveal><div class='service-icon'><svg viewBox='0 0 48 48' fill='none' stroke='currentColor' stroke-width='2'><circle cx='24' cy='24' r='8'/><path d='M24 4v8M24 36v8M4 24h8M36 24h8M8.93 8.93l5.66 5.66M33.41 33.41l5.66 5.66M8.93 39.07l5.66-5.66M33.41 14.59l5.66-5.66'/></svg></div><h3>Skylights & Whirlybirds</h3><p>Natural lighting and ventilation solutions for homes and businesses in $($Suburb.region).</p></div>"
    )

    $TestimonialsList = @(
        "<div class='testimonial-card' data-reveal><div class='testimonial-stars'>★★★★★</div><p>`"Ascend Roofing replaced our entire roof in just three days. The team was professional, tidy, and the new Colorbond roof looks absolutely stunning. Couldn't be happier!`"</p><div class='testimonial-author'><div class='author-avatar'>MK</div><div><strong>Mark K.</strong><span>Homeowner</span></div></div></div>",
        "<div class='testimonial-card' data-reveal><div class='testimonial-stars'>★★★★★</div><p>`"After the last big storm we needed urgent repairs. Steve and his team were out the next day and had everything sealed up perfectly. Great communication from start to finish.`"</p><div class='testimonial-author'><div class='author-avatar'>SR</div><div><strong>Sarah R.</strong><span>Local Resident</span></div></div></div>",
        "<div class='testimonial-card' data-reveal><div class='testimonial-stars'>★★★★★</div><p>`"We got three quotes and Ascend was the most transparent and competitive. No hidden fees, honest advice, and the workmanship is top-notch. Highly recommend this family business.`"</p><div class='testimonial-author'><div class='author-avatar'>DL</div><div><strong>David L.</strong><span>Property Manager</span></div></div></div>",
        "<div class='testimonial-card' data-reveal><div class='testimonial-stars'>★★★★★</div><p>`"Absolutely thrilled with the new roof. The guys worked incredibly hard and left the site spotless. Would definitely use Ascend Roofing Group again.`"</p><div class='testimonial-author'><div class='author-avatar'>JB</div><div><strong>Jessica B.</strong><span>Homeowner</span></div></div></div>",
        "<div class='testimonial-card' data-reveal><div class='testimonial-stars'>★★★★★</div><p>`"Prompt, polite, and well priced. They fixed a leak that two other companies couldn't find. Excellent service.`"</p><div class='testimonial-author'><div class='author-avatar'>TP</div><div><strong>Tom P.</strong><span>Property Owner</span></div></div></div>",
        "<div class='testimonial-card' data-reveal><div class='testimonial-stars'>★★★★★</div><p>`"From the initial quote to the final inspection, everything was seamless. High-quality Colorbond installation and friendly staff.`"</p><div class='testimonial-author'><div class='author-avatar'>NW</div><div><strong>Nathan W.</strong><span>Homeowner</span></div></div></div>"
    )

    $ShuffledServices = $ServicesList | Sort-Object { Get-Random }
    $ServicesGridHtml = $ShuffledServices -join ""
    
    $ShuffledTestimonials = $TestimonialsList | Sort-Object { Get-Random } | Select-Object -First 3
    $TestimonialsGridHtml = $ShuffledTestimonials -join ""

    $Content = $Content.Replace("{{HERO_SUBTITLE}}", ($HeroSubtitles | Get-Random))
    $Content = $Content.Replace("{{ABOUT_US_P1}}", ($AboutUsP1 | Get-Random))
    $Content = $Content.Replace("{{ABOUT_US_P2}}", ($AboutUsP2 | Get-Random))
    $Content = $Content.Replace("{{SERVICES_GRID}}", $ServicesGridHtml)
    $Content = $Content.Replace("{{TESTIMONIALS_GRID}}", $TestimonialsGridHtml)

    # === FIX: Populate meta description with unique, SEO-optimised text ===
    $MetaDescriptions = @(
        "Ascend Roofing Group provides premium Colorbond(R) metal roofing in $($Suburb.name) $($Suburb.postcode). Expert roof replacements, repairs and new installs. QBCC licensed. Free quotes - call 0490 196 284.",
        "Need a roofer in $($Suburb.name)? Ascend Roofing Group offers professional Colorbond(R) roof replacements, repairs and new installations. 14+ years experience. Free quote today.",
        "$($Suburb.name) roofing experts. Family-owned Ascend Roofing Group delivers durable Colorbond(R) steel roofing solutions. QBCC licensed and insured. Serving $($Suburb.name) $($Suburb.postcode) and surrounds."
    )
    $Content = $Content.Replace("{{META_DESCRIPTION}}", ($MetaDescriptions | Get-Random))

    # === FIX: Generate nearby suburbs links for internal linking ===
    $SameRegionSuburbs = $SuburbsJson | Where-Object { $_.region -eq $Suburb.region -and $_.name -ne $Suburb.name }
    $NearbySelection = $SameRegionSuburbs | Get-Random -Count ([Math]::Min(8, $SameRegionSuburbs.Count))
    $NearbyHtml = ""
    foreach ($Near in $NearbySelection) {
        $NearSlug = Get-Slug -Name $Near.name
        $NearbyHtml += "<a href='roofing-$NearSlug.html' class='nearby-suburb-link'>$($Near.name)</a>"
    }
    $Content = $Content.Replace("{{NEARBY_SUBURBS}}", $NearbyHtml)
    
    # Randomize images for this page
    $SelectedImages = $ProjectImages | Get-Random -Count 3
    
    # Replace the 3 gallery placeholders with random selections
    for ($i = 0; $i -lt 3; $i++) {
        $Content = $Content.Replace($TemplateImages[$i], "../images/$($SelectedImages[$i])")
    }

    Set-Content -Path $FilePath -Value $Content
    
    # Collect for index
    if (-not $Regions.ContainsKey($Suburb.region)) {
        $Regions[$Suburb.region] = @()
    }
    $Regions[$Suburb.region] += @{ Name = $Suburb.name; Filename = $Filename }
}

Write-Host "Generated all suburb pages."

# Generate Locations Index
$LocationsContentBuilder = ""

foreach ($RegionKey in ($Regions.Keys | Sort-Object)) {
    $LocationsContentBuilder += "<div class='region-group'><h2 class='region-title'>$RegionKey</h2><div class='locations-grid'>"
    
    $SortedSuburbs = $Regions[$RegionKey] | Sort-Object -Property Name
    foreach ($Item in $SortedSuburbs) {
        $LocationsContentBuilder += "<a href='service-areas/$($Item.Filename)' class='location-link' title='Roofing $($Item.Name)'>$($Item.Name)</a>"
    }
    
    $LocationsContentBuilder += "</div></div>"
}

# Locations Index Template (Hardcoded to avoid extra file req)
$LocationsIndex = @"
<!DOCTYPE html>
<html lang="en-AU">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
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
    <div class="nav-overlay" id="navOverlay"></div>

    <section class="locations-hero">
        <div class="container">
            <h1>Our Service <span class="text-accent">Areas</span></h1>
            <p style="color: var(--text-secondary); max-width: 600px; margin: 20px auto;">We provide premium metal roofing services across South East Queensland. Find your suburb below.</p>
        </div>
    </section>

    <section class="section">
        <div class="container">
            $LocationsContentBuilder
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
                        <li><a href="privacy.html">Privacy Policy</a></li>
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
                <p>QBCC Lic. 15600031 | ABN Registered</p>
            </div>
        </div>
    </footer>
    <script src="script.js"></script>
</body>
</html>
"@

Set-Content -Path $LocationsTemplatePath -Value $LocationsIndex

Write-Host "Generated locations.html index."
Write-Host "Success! SEO Landing Pages complete."
