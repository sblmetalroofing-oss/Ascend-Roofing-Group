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
                <p>QBCC Licensed | ABN Registered</p>
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
