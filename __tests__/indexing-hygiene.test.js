import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    BASE_URL,
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
