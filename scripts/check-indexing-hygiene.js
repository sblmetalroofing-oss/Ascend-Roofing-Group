// Checks the invariants that keep Search Console's Page indexing report clean.
//
// Each check maps to a "why pages aren't indexed" reason in that report, so a
// failure here is a page that would eventually show up as non-indexed in
// Search Console — weeks later, and without telling you which commit did it.
//
// See docs/page-indexing-report.md for what each reason means for this site.
//
// Run directly:  npm run check:indexing
// Run in CI:     __tests__/indexing-hygiene.test.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));

export const BASE_URL = "https://www.ascendroofinggroup.com.au";

// ---------------------------------------------------------------- collection

// Every .html file that ships, as a repo-relative path. Excludes node_modules
// and .git; everything else in the tree is deployed by Vercel as-is.
export function listPages(root = ROOT) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) out.push(path.relative(root, full));
    }
  })(root);
  return out.sort();
}

// The URL a page is served at. index.html is served at its directory, so
// blog/index.html is /blog/ and index.html is /.
export function urlForPage(relPath) {
  const p = "/" + relPath.split(path.sep).join("/");
  return BASE_URL + p.replace(/\/index\.html$/, "/");
}

export function readSitemapUrls(root = ROOT) {
  const xml = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

// The file that serves a sitemap URL, or null if nothing on disk does.
export function pageForUrl(url, root = ROOT) {
  if (!url.startsWith(BASE_URL)) return null;
  let p = url.slice(BASE_URL.length) || "/";
  if (p.endsWith("/")) p += "index.html";
  const rel = p.replace(/^\//, "");
  return fs.existsSync(path.join(root, rel)) ? rel : null;
}

export function canonicalOf(html) {
  const m = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  return m ? m[1] : null;
}

// vercel.json sources are path patterns with regex groups, e.g.
// "/roofing-(.*)\\.html". Anchor them, keep the "(.*)" groups and anything the
// pattern already escaped, and treat every other regex metacharacter as a
// literal — otherwise the "." in "/roofing-logan.html" would match any
// character and report redirects Vercel would never actually perform.
export function sourceToRegExp(source) {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\" && i + 1 < source.length) {
      out += "\\" + source[++i]; // already escaped by the author, e.g. "\."
    } else if (source.startsWith("(.*)", i)) {
      out += "(.*)";
      i += 3;
    } else if (".*+?^${}()|[]\\".includes(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  return new RegExp("^" + out + "$");
}

// A page is non-indexable if its own markup says noindex, or if vercel.json
// sends an X-Robots-Tag: noindex header for its path. Both are equally binding
// on Googlebot, so both have to count.
export function isNoindex(relPath, html, vercel) {
  if (/<meta\s+name="robots"[^>]*content="[^"]*noindex/i.test(html)) return true;
  const routePath = urlForPage(relPath).slice(BASE_URL.length);
  for (const rule of vercel.headers || []) {
    if (!sourceToRegExp(rule.source).test(routePath)) continue;
    for (const h of rule.headers || []) {
      if (h.key.toLowerCase() === "x-robots-tag" && /noindex/i.test(h.value)) {
        return true;
      }
    }
  }
  return false;
}

export function readVercel(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
}

// robots.txt Disallow rules that apply to every crawler.
export function readRobotsDisallows(root = ROOT) {
  const txt = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  const rules = [];
  let appliesToAll = false;
  for (const line of txt.split("\n")) {
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") appliesToAll = value === "*";
    else if (key === "disallow" && appliesToAll && value) rules.push(value);
  }
  return rules;
}

// --------------------------------------------------------------- the checks

// Returns an array of human-readable problems; empty means the site is clean.
export function checkIndexingHygiene(root = ROOT) {
  const problems = [];
  const vercel = readVercel(root);
  const disallows = readRobotsDisallows(root);
  const sitemapUrls = readSitemapUrls(root);
  const sitemapSet = new Set(sitemapUrls);

  const redirects = (vercel.redirects || []).map((r) => ({
    re: sourceToRegExp(r.source),
    source: r.source,
    destination: r.destination,
  }));

  for (const rel of listPages(root)) {
    const html = fs.readFileSync(path.join(root, rel), "utf8");
    const url = urlForPage(rel);
    const noindex = isNoindex(rel, html, vercel);
    const inSitemap = sitemapSet.has(url);

    // "URL marked 'noindex'" — a noindex page in the sitemap asks Google to
    // index a page that then refuses to be indexed. Sitemap membership should
    // mean exactly "this page is meant to rank".
    if (noindex && inSitemap) {
      problems.push(
        `${rel}: is noindex but is listed in sitemap.xml (${url}) — contradictory signals.`,
      );
    }

    // The same invariant from the other side: an indexable page missing from
    // the sitemap is left to organic discovery, which is what lands pages in
    // "Discovered – currently not indexed".
    if (!noindex && !inSitemap) {
      problems.push(
        `${rel}: is indexable but missing from sitemap.xml (expected <loc>${url}</loc>). Add it, or mark the page noindex.`,
      );
    }

    // The canonical rules below only bind pages meant to be indexed.
    if (noindex) continue;

    // "Duplicate, Google chose different canonical than user" — the usual
    // cause is a canonical that points somewhere other than the page itself.
    //
    // Every indexable page here is self-canonical, and requiring that also
    // rules out two pages claiming one canonical: distinct files always have
    // distinct URLs. A page that genuinely needs to point elsewhere is a
    // duplicate, so mark it noindex and leave it out of the sitemap.
    const canonical = canonicalOf(html);
    if (!canonical) {
      problems.push(`${rel}: indexable page has no <link rel="canonical">.`);
    } else if (canonical !== url) {
      problems.push(
        `${rel}: canonical is ${canonical} but the page is served at ${url}.`,
      );
    }
  }

  for (const url of sitemapUrls) {
    // "Not found (404)" — a sitemap entry with nothing behind it.
    if (!pageForUrl(url, root)) {
      problems.push(`sitemap.xml: <loc>${url}</loc> has no file on disk.`);
    }

    // One origin only. A mix of www/non-www or http/https splits ranking
    // signals between two URLs Google then treats as duplicates.
    if (!url.startsWith(BASE_URL + "/")) {
      problems.push(`sitemap.xml: ${url} is not on ${BASE_URL}.`);
      continue;
    }

    const routePath = url.slice(BASE_URL.length);

    // "Page with redirect" — a redirected URL can never be the indexed one,
    // so listing it in the sitemap only spends crawl budget.
    for (const r of redirects) {
      if (r.re.test(routePath)) {
        problems.push(
          `sitemap.xml: ${url} is redirected by vercel.json ("${r.source}" -> "${r.destination}") — list the destination instead.`,
        );
      }
    }

    // "Indexed, though blocked by robots.txt" — submitting a URL you also
    // block is the exact combination that produces that warning.
    for (const rule of disallows) {
      if (routePath.startsWith(rule)) {
        problems.push(
          `sitemap.xml: ${url} is blocked by robots.txt ("Disallow: ${rule}").`,
        );
      }
    }
  }

  return problems;
}

// ------------------------------------------------------------------- runner

if (process.argv[1] && fs.realpathSync(process.argv[1]) === __filename) {
  const problems = checkIndexingHygiene();
  if (problems.length) {
    console.error(`Indexing hygiene: ${problems.length} problem(s) found.\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\nSee docs/page-indexing-report.md for what each one means.");
    process.exitCode = 1;
  } else {
    console.log(
      `Indexing hygiene: clean — ${listPages().length} pages, ` +
        `${readSitemapUrls().length} sitemap URLs, no conflicting signals.`,
    );
  }
}
