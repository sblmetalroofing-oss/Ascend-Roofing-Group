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

## Development Workflow

We use a standard Git workflow with Vercel Environments:

### 1. Development (The Playground)
Always make your changes on the `dev` branch first.
- **Goal**: Test new features safely without breaking the live site.
- **URL**: `ascend-roofing-group-git-dev-[username].vercel.app` (Check Vercel Dashboard for exact link)

**How to update Dev:**
```bash
git checkout dev
# Make your changes...
git add .
git commit -m "Description of changes"
git push origin dev
```
*Vercel automatically deploys the `dev` branch to a Preview Environment.*

### 2. Production (The Live Site)
Merge `dev` into `main` only when you are happy with the changes.
- **Goal**: Stability. This is what customers see.
- **URL**: `ascend-roofing-group.vercel.app`

**How to update Prod:**
```bash
git checkout main
git merge dev
git push origin main
```
*Vercel automatically deploys the `main` branch to Production.*
