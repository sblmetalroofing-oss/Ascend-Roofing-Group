$ScriptPath = $PSScriptRoot
$SuburbsPath = Join-Path $ScriptPath "suburbs.json"
$OutputPath = Join-Path $ScriptPath "sitemap.xml"
$BaseUrl = "https://ascendroofinggroup.com.au"

Write-Host "Generating sitemap.xml..."

# Read Suburbs JSON
$SuburbsJson = Get-Content -Path $SuburbsPath -Raw | ConvertFrom-Json
if (-not $SuburbsJson) {
    Write-Error "Suburbs JSON not found or invalid at $SuburbsPath"
    exit 1
}

# Slug Function (must match generate_pages.ps1)
function Get-Slug {
    param ([string]$Name)
    $Name = $Name.ToLower()
    $Name = $Name -replace " ", "-"
    $Name = $Name -replace "[^a-z0-9-]", ""
    return $Name
}

$SitemapContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>$BaseUrl/</loc>
        <priority>1.0</priority>
        <changefreq>weekly</changefreq>
    </url>
    <url>
        <loc>$BaseUrl/locations.html</loc>
        <priority>0.8</priority>
        <changefreq>weekly</changefreq>
    </url>
"@

foreach ($Suburb in $SuburbsJson) {
    $Slug = Get-Slug -Name $Suburb.name
    $SitemapContent += @"

    <url>
        <loc>$BaseUrl/service-areas/roofing-$Slug.html</loc>
        <priority>0.6</priority>
        <changefreq>monthly</changefreq>
    </url>
"@
}

$SitemapContent += @"

</urlset>
"@

Set-Content -Path $OutputPath -Value $SitemapContent
Write-Host "Sitemap generated at $OutputPath with $($SuburbsJson.Count + 2) URLs."
