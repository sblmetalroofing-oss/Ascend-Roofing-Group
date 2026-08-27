import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    BASE_URL,
    CANONICAL_HOST,
    appliesToCanonicalHost,
    canonicalOf,
    checkIndexingHygiene,
    listPages,
    pageForUrl,
    readSitemapUrls,
    sourceToRegExp,
    urlForPage,
} from '../scripts/check-indexing-hygiene.js';

// A minimal site on disk, so the negative cases below prove the checker
// actually detects each problem rather than passing vacuously on the real repo.
function makeSite({ pages = {}, sitemap = [], vercel = {}, robots = 'User-agent: *\nAllow: /\n' } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexing-'));
    for (const [rel, html] of Object.entries(pages)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, html);
    }
    const locs = sitemap.map((u) => `    <url><loc>${u}</loc></url>`).join('\n');
    fs.writeFileSync(path.join(dir, 'sitemap.xml'), `<urlset>\n${locs}\n</urlset>\n`);
    fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify(vercel));
    fs.writeFileSync(path.join(dir, 'robots.txt'), robots);
    return dir;
}

const page = (canonical, extraHead = '') =>
    `<html><head>${extraHead}<link rel="canonical" href="${canonical}">` +
    `<title>t</title></head><body>hi</body></html>`;

const NOINDEX = '<meta name="robots" content="noindex, follow">';

describe('urlForPage', () => {
    test('serves index.html at its directory', () => {
        expect(urlForPage('index.html')).toBe(`${BASE_URL}/`);
        expect(urlForPage('blog/index.html')).toBe(`${BASE_URL}/blog/`);
    });

    test('leaves other pages at their .html path', () => {
        expect(urlForPage('service-areas/roofing-ascot.html')).toBe(
            `${BASE_URL}/service-areas/roofing-ascot.html`,
        );
    });
});

describe('sourceToRegExp', () => {
    test('treats an unescaped dot in a literal source as a literal', () => {
        const re = sourceToRegExp('/roofing-logan.html');
        expect(re.test('/roofing-logan.html')).toBe(true);
        expect(re.test('/roofing-loganXhtml')).toBe(false);
    });

    test('keeps (.*) as a wildcard group', () => {
        const re = sourceToRegExp('/roofing-(.*)\\.html');
        expect(re.test('/roofing-ascot.html')).toBe(true);
        // The catch-all is anchored at the root, so the generated suburb pages
        // it redirects *to* must not themselves match it — that would be a loop.
        expect(re.test('/service-areas/roofing-ascot.html')).toBe(false);
    });
});

describe('canonicalOf', () => {
    test('extracts the href, or null when absent', () => {
        expect(canonicalOf(page(`${BASE_URL}/x.html`))).toBe(`${BASE_URL}/x.html`);
        expect(canonicalOf('<html><head></head></html>')).toBeNull();
    });
});

describe('checkIndexingHygiene — clean site', () => {
    test('accepts self-canonical pages that match the sitemap exactly', () => {
        const dir = makeSite({
            pages: {
                'index.html': page(`${BASE_URL}/`),
                'blog/index.html': page(`${BASE_URL}/blog/`),
                'quote.html': page(`${BASE_URL}/quote.html`, NOINDEX),
            },
            sitemap: [`${BASE_URL}/`, `${BASE_URL}/blog/`],
        });
        expect(checkIndexingHygiene(dir)).toEqual([]);
    });
});

describe('checkIndexingHygiene — regressions it must catch', () => {
    test('flags a noindex page that is also submitted in the sitemap', () => {
        const dir = makeSite({
            pages: { 'quote.html': page(`${BASE_URL}/quote.html`, NOINDEX) },
            sitemap: [`${BASE_URL}/quote.html`],
        });
        expect(checkIndexingHygiene(dir)).toEqual([
            expect.stringContaining('is noindex but is listed in sitemap.xml'),
        ]);
    });

    test('flags an indexable page missing from the sitemap', () => {
        const dir = makeSite({
            pages: { 'orphan.html': page(`${BASE_URL}/orphan.html`) },
            sitemap: [],
        });
        expect(checkIndexingHygiene(dir)).toEqual([
            expect.stringContaining('missing from sitemap.xml'),
        ]);
    });

    test('flags a canonical pointing away from the page that serves it', () => {
        const dir = makeSite({
            pages: { 'a.html': page(`${BASE_URL}/somewhere-else.html`) },
            sitemap: [`${BASE_URL}/a.html`],
        });
        expect(checkIndexingHygiene(dir)).toEqual([
            expect.stringContaining('but the page is served at'),
        ]);
    });

    test('flags the second of two pages claiming one canonical', () => {
        // Requiring self-canonical URLs is what rules this out: b.html pointing
        // at a.html's canonical is reported as b.html's canonical being wrong.
        const dir = makeSite({
            pages: {
                'a.html': page(`${BASE_URL}/a.html`),
                'b.html': page(`${BASE_URL}/a.html`),
            },
            sitemap: [`${BASE_URL}/a.html`, `${BASE_URL}/b.html`],
        });
        expect(checkIndexingHygiene(dir)).toEqual([
            expect.stringContaining('b.html: canonical is'),
        ]);
    });

    test('flags an indexable page with no canonical at all', () => {
        const dir = makeSite({
            pages: { 'a.html': '<html><head><title>t</title></head><body>hi</body></html>' },
            sitemap: [`${BASE_URL}/a.html`],
        });
        expect(checkIndexingHygiene(dir)).toEqual([
            expect.stringContaining('has no <link rel="canonical">'),
        ]);
    });

    test('flags a sitemap URL with no file behind it', () => {
        const dir = makeSite({ pages: {}, sitemap: [`${BASE_URL}/ghost.html`] });
        expect(checkIndexingHygiene(dir)).toEqual([
            expect.stringContaining('has no file on disk'),
        ]);
    });

    test('flags a sitemap URL that vercel.json redirects away', () => {
        const dir = makeSite({
            pages: { 'old.html': page(`${BASE_URL}/old.html`) },
            sitemap: [`${BASE_URL}/old.html`],
            vercel: {
                redirects: [{ source: '/old.html', destination: '/new.html', permanent: true }],
            },
        });
        expect(checkIndexingHygiene(dir)).toContainEqual(
            expect.stringContaining('is redirected by vercel.json'),
        );
    });

    test('flags a sitemap URL that robots.txt disallows', () => {
        const dir = makeSite({
            pages: { 'private/a.html': page(`${BASE_URL}/private/a.html`) },
            sitemap: [`${BASE_URL}/private/a.html`],
            robots: 'User-agent: *\nDisallow: /private/\n',
        });
        expect(checkIndexingHygiene(dir)).toContainEqual(
            expect.stringContaining('is blocked by robots.txt'),
        );
    });

    test('flags a sitemap URL on a different origin', () => {
        const dir = makeSite({
            pages: { 'a.html': page(`${BASE_URL}/a.html`) },
            sitemap: [`${BASE_URL}/a.html`, 'https://ascendroofinggroup.com.au/a.html'],
        });
        expect(checkIndexingHygiene(dir)).toContainEqual(
            expect.stringContaining('is not on https://www.ascendroofinggroup.com.au'),
        );
    });

    test('treats an X-Robots-Tag noindex header as noindex, like template.html', () => {
        const dir = makeSite({
            pages: { 'template.html': page(`${BASE_URL}/service-areas/roofing-{{SLUG}}.html`) },
            sitemap: [],
            vercel: {
                headers: [
                    {
                        source: '/template.html',
                        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
                    },
                ],
            },
        });
        // Header-noindexed, so neither the sitemap nor the canonical rules apply.
        expect(checkIndexingHygiene(dir)).toEqual([]);
    });
});

// Search Console showed 61% of impressions landing on the apex host while
// every canonical pointed at www, so vercel.json now redirects apex to www.
// That rule matches "/(.*)", and without the host condition being honoured it
// would read as a redirect shadowing every sitemap URL.
describe('appliesToCanonicalHost', () => {
    const apexRule = {
        source: '/(.*)',
        has: [{ type: 'host', value: 'ascendroofinggroup.com.au' }],
        destination: 'https://www.ascendroofinggroup.com.au/$1',
        permanent: true,
    };

    test('an unconditional rule applies', () => {
        expect(appliesToCanonicalHost({ source: '/a.html', destination: '/b.html' })).toBe(true);
    });

    test('a rule scoped to another host does not apply', () => {
        expect(appliesToCanonicalHost(apexRule)).toBe(false);
    });

    test('a rule scoped to the canonical host still applies', () => {
        expect(
            appliesToCanonicalHost({ source: '/(.*)', has: [{ type: 'host', value: CANONICAL_HOST }] }),
        ).toBe(true);
    });

    test('request-dependent conditions are not treated as unconditional', () => {
        expect(appliesToCanonicalHost({ source: '/(.*)', has: [{ type: 'cookie', key: 'beta' }] })).toBe(false);
        expect(appliesToCanonicalHost({ source: '/(.*)', missing: [{ type: 'header', key: 'x' }] })).toBe(false);
    });

    test('the apex redirect does not flag sitemap URLs as shadowed', () => {
        const page = `<html><head><link rel="canonical" href="${BASE_URL}/a.html"></head></html>`;
        const dir = makeSite({
            pages: { 'a.html': page },
            sitemap: [`${BASE_URL}/a.html`],
            vercel: { redirects: [apexRule] },
        });
        expect(checkIndexingHygiene(dir)).toEqual([]);
    });

    test('an unconditional catch-all redirect is still reported', () => {
        const page = `<html><head><link rel="canonical" href="${BASE_URL}/a.html"></head></html>`;
        const dir = makeSite({
            pages: { 'a.html': page },
            sitemap: [`${BASE_URL}/a.html`],
            vercel: { redirects: [{ source: '/(.*)', destination: '/b.html', permanent: true }] },
        });
        expect(checkIndexingHygiene(dir).join('\n')).toMatch(/is redirected by vercel\.json/);
    });
});

describe('the real site', () => {
    test('has no indexing-hygiene problems', () => {
        expect(checkIndexingHygiene()).toEqual([]);
    });

    test('sitemap and pages are consistent with each other', () => {
        const urls = readSitemapUrls();
        expect(urls.length).toBeGreaterThan(300);
        for (const url of urls) expect(pageForUrl(url)).not.toBeNull();
        expect(listPages().length).toBeGreaterThanOrEqual(urls.length);
    });
});

// sitemap.xml is now a sitemap index — one child per page bucket, so Search
// Console reports indexed counts for core pages and suburb pages separately.
describe('readSitemapUrls with a sitemap index', () => {
    function makeIndexSite({ children = {}, missingChild = null } = {}) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexing-'));
        const entries = [];
        for (const [file, urls] of Object.entries(children)) {
            const locs = urls.map((u) => `    <url><loc>${u}</loc></url>`).join('\n');
            fs.writeFileSync(path.join(dir, file), `<urlset>\n${locs}\n</urlset>\n`);
            entries.push(file);
        }
        if (missingChild) entries.push(missingChild);
        const refs = entries
            .map((f) => `    <sitemap><loc>${BASE_URL}/${f}</loc></sitemap>`)
            .join('\n');
        fs.writeFileSync(path.join(dir, 'sitemap.xml'), `<sitemapindex>\n${refs}\n</sitemapindex>\n`);
        fs.writeFileSync(path.join(dir, 'vercel.json'), '{}');
        fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
        return dir;
    }

    test('expands children into their page URLs', () => {
        const dir = makeIndexSite({
            children: {
                'sitemap-pages.xml': [`${BASE_URL}/a.html`],
                'sitemap-service-areas.xml': [`${BASE_URL}/service-areas/b.html`],
            },
        });
        expect(readSitemapUrls(dir).sort()).toEqual([
            `${BASE_URL}/a.html`,
            `${BASE_URL}/service-areas/b.html`,
        ]);
    });

    test('a plain urlset still reads as before', () => {
        const dir = makeSite({ sitemap: [`${BASE_URL}/a.html`] });
        expect(readSitemapUrls(dir)).toEqual([`${BASE_URL}/a.html`]);
    });

    test('a child sitemap missing on disk is surfaced, not skipped', () => {
        const dir = makeIndexSite({
            children: { 'sitemap-pages.xml': [] },
            missingChild: 'sitemap-ghost.xml',
        });
        // The unexpandable child comes back as a URL, which the checker then
        // reports as a sitemap entry with no file behind it.
        expect(readSitemapUrls(dir)).toEqual([`${BASE_URL}/sitemap-ghost.xml`]);
        expect(checkIndexingHygiene(dir).join('\n')).toMatch(/sitemap-ghost\.xml.*no file on disk/);
    });

    test('the real sitemap.xml is an index whose children exist and stay on-origin', () => {
        const repoRoot = path.join(new URL(import.meta.url).pathname, '..', '..');
        const xml = fs.readFileSync(path.join(repoRoot, 'sitemap.xml'), 'utf8');
        expect(xml).toMatch(/<sitemapindex[\s>]/);
        for (const [, child] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
            expect(child.startsWith(BASE_URL + '/')).toBe(true);
        }
        const urls = readSitemapUrls();
        expect(urls.length).toBeGreaterThan(300);
        expect(urls.every((u) => !u.endsWith('.xml'))).toBe(true);
    });
});
