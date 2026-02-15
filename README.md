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

## How to Build (Vercel / Node.js)

This project is configured for seamless deployment on Vercel.

### Local Development
1. Install Node.js.
2. Run the build script:
   ```bash
   npm run build
   # or
   node build.js
   ```

### Vercel Configuration
- **Build Command**: `npm run build`
- **Output Directory**: `.` (The root directory)
- **Ignored Files**: `service-areas/`, `locations.html`, and `sitemap.xml` are generated during build and ignored by git.

### Legacy Method
You can still use the PowerShell script if preferred:
```powershell
.\generate_pages.ps1
```

## Branding

- **Company**: Ascend Roofing Group
- **Primary Color**: White (`#ffffff`)
- **Accent Color**: Blue (`#2563EB`)
- **Font**: Inter & Space Grotesk
