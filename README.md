# Ascend Roofing Group Website

Source code for the Ascend Roofing Group website, a static site for a Brisbane & Gold Coast metal roofing company.

## Project Structure

- **`index.html`**: The main landing page.
- **`styles.css`**: Global styles and variables (Dark Architectural Theme).
- **`script.js`**: Frontend interactivity (mobile menu, scroll effects).
- **`generate_pages.ps1`**: PowerShell script to generate ~300+ SEO landing pages for each suburb.
- **`service-areas/`**: Generated SEO landing pages for each suburb.
- **`suburbs.json`**: Data source for the SEO pages.
- **`locations.html`**: Generated index of all service areas.
- **`images/`**: Project assets.

## How to Build

The website is static HTML/CSS/JS. To regenerate the SEO suburb pages:

1. Open PowerShell.
2. Run the generation script:
   ```powershell
   .\generate_pages.ps1
   ```
3. This will update `locations.html` and populate `service-areas/` with `roofing-[suburb].html` files based on `template.html` and `suburbs.json`.

## Branding

- **Company**: Ascend Roofing Group
- **Primary Color**: White (`#ffffff`)
- **Accent Color**: Blue (`#2563EB`)
- **Font**: Inter & Space Grotesk
