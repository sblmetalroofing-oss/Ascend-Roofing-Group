import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    clusterPages,
    listSuburbPages,
    normaliseBody,
    readSuburbNames,
    summarise,
} from '../scripts/content-uniqueness.js';

// A minimal site on disk, so the cases below prove the clustering actually
// groups by content rather than passing vacuously on the real repo.
function makeSite({ pages = {}, suburbs = [] } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uniqueness-'));
    fs.mkdirSync(path.join(dir, 'service-areas'), { recursive: true });
    for (const [name, html] of Object.entries(pages)) {
        fs.writeFileSync(path.join(dir, 'service-areas', name), html);
    }
    fs.writeFileSync(path.join(dir, 'suburbs.json'), JSON.stringify(suburbs));
    return dir;
}

// The template these pages are generated from: one body, place name and
// postcode substituted in.
const body = (suburb, postcode) =>
    `<html><body><h1>Roofing ${suburb}</h1>` +
    `<p>Colorbond roofing in ${suburb} ${postcode}. Free quotes.</p></body></html>`;

describe('normaliseBody', () => {
    const names = ['Ascot', 'Mount Gravatt', 'Mount Gravatt East'];

    it('strips suburb names and postcodes so only the shared copy remains', () => {
        expect(normaliseBody(body('Ascot', '4007'), names)).toBe(
            'Roofing Colorbond roofing in . Free quotes.',
        );
    });

    it('collapses two pages that differ only by place name', () => {
        expect(normaliseBody(body('Ascot', '4007'), names)).toBe(
            normaliseBody(body('Mount Gravatt', '4122'), names),
        );
    });

    it('replaces the longest suburb name first', () => {
        // "Mount Gravatt East" must not be left as a stray "East".
        expect(normaliseBody('<p>Mount Gravatt East</p>', names)).toBe('');
    });

    it('drops scripts, styles and the generated neighbour grid', () => {
        const html =
            '<style>.a{color:red}</style><script>var x=1</script>' +
            '<p>Shared copy.</p>' +
            '<a href="roofing-albion.html"><span>Albion</span></a>';
        expect(normaliseBody(html, ['Albion'])).toBe('Shared copy.');
    });

    it('keeps pages apart when the copy itself differs', () => {
        const a = normaliseBody('<p>Heritage overlay applies here.</p>', names);
        const b = normaliseBody('<p>Coastal salt-air corrosion.</p>', names);
        expect(a).not.toBe(b);
    });
});

describe('clusterPages', () => {
    it('groups pages that differ only by suburb, largest group first', () => {
        const dir = makeSite({
            suburbs: [
                { name: 'Ascot', postcode: '4007' },
                { name: 'Albion', postcode: '4010' },
                { name: 'Bulimba', postcode: '4171' },
            ],
            pages: {
                'roofing-ascot.html': body('Ascot', '4007'),
                'roofing-albion.html': body('Albion', '4010'),
                'roofing-bulimba.html': '<p>Genuinely different copy.</p>',
            },
        });

        const clusters = clusterPages(dir);
        expect(clusters).toHaveLength(2);
        expect(clusters[0]).toEqual([
            path.join('service-areas', 'roofing-albion.html'),
            path.join('service-areas', 'roofing-ascot.html'),
        ]);
        expect(clusters[1]).toEqual([path.join('service-areas', 'roofing-bulimba.html')]);
    });

    it('reports every page as distinct when the copy is genuinely unique', () => {
        const dir = makeSite({
            suburbs: [{ name: 'Ascot', postcode: '4007' }, { name: 'Albion', postcode: '4010' }],
            pages: {
                'roofing-ascot.html': '<p>Post-war timber stock, heritage overlay.</p>',
                'roofing-albion.html': '<p>1980s brick veneer, tile-to-metal conversions.</p>',
            },
        });

        const s = summarise(dir);
        expect(s).toMatchObject({ total: 2, distinct: 2, duplicates: 0, uniqueShare: 1 });
    });
});

describe('summarise', () => {
    it('counts duplicates as the gap between pages and distinct bodies', () => {
        const dir = makeSite({
            suburbs: [
                { name: 'Ascot', postcode: '4007' },
                { name: 'Albion', postcode: '4010' },
                { name: 'Bulimba', postcode: '4171' },
            ],
            pages: {
                'roofing-ascot.html': body('Ascot', '4007'),
                'roofing-albion.html': body('Albion', '4010'),
                'roofing-bulimba.html': body('Bulimba', '4171'),
            },
        });

        expect(summarise(dir)).toMatchObject({
            total: 3,
            distinct: 1,
            duplicates: 2,
            largest: 3,
        });
    });

    it('handles a site with no suburb pages', () => {
        const dir = makeSite({ suburbs: [] });
        expect(summarise(dir)).toMatchObject({ total: 0, distinct: 0, uniqueShare: 1 });
    });
});

describe('the real site', () => {
    it('has a suburb page set whose distinct-body count bounds what can be indexed', () => {
        const s = summarise();
        expect(s.total).toBe(listSuburbPages().length);
        expect(readSuburbNames().length).toBeGreaterThan(0);
        // Distinct bodies can never exceed the pages that carry them.
        expect(s.distinct).toBeGreaterThan(0);
        expect(s.distinct).toBeLessThanOrEqual(s.total);
    });
});

// Nearby-suburb links are assigned as a ring over each region ordered by
// postcode, so every suburb page is linked as often as it links. The previous
// selection sorted by the candidate's first character and left 44 of 314
// suburbs with locations.html as their only internal inbound link — the
// thinnest possible crawl path to the pages already sitting in
// "Discovered - currently not indexed".
describe('nearby-suburb link distribution', () => {
    const repoRoot = path.join(new URL(import.meta.url).pathname, '..', '..');

    function nearbyInboundCounts() {
        const dir = path.join(repoRoot, 'service-areas');
        const files = fs.readdirSync(dir).filter((f) => /^roofing-.*\.html$/.test(f));
        const counts = new Map(files.map((f) => [f.replace(/\.html$/, ''), 0]));
        for (const f of files) {
            const html = fs.readFileSync(path.join(dir, f), 'utf8');
            const linked = new Set(
                [...html.matchAll(/<a href="(roofing-[a-z0-9-]+)\.html" class="nearby-card"/g)].map(
                    (m) => m[1],
                ),
            );
            for (const slug of linked) {
                if (counts.has(slug)) counts.set(slug, counts.get(slug) + 1);
            }
        }
        return counts;
    }

    it('leaves no suburb page unlinked by its neighbours', () => {
        const counts = nearbyInboundCounts();
        const orphans = [...counts].filter(([, n]) => n === 0).map(([slug]) => slug);
        expect(orphans).toEqual([]);
    });

    it('links every suburb page an equal number of times', () => {
        const values = [...nearbyInboundCounts().values()];
        expect(Math.min(...values)).toBe(Math.max(...values));
    });

    it('gives every page a full grid of outbound neighbour links', () => {
        const dir = path.join(repoRoot, 'service-areas');
        for (const f of fs.readdirSync(dir).filter((x) => /^roofing-.*\.html$/.test(x))) {
            const html = fs.readFileSync(path.join(dir, f), 'utf8');
            const out = [...html.matchAll(/class="nearby-card"/g)].length;
            expect(out).toBeGreaterThanOrEqual(6);
        }
    });
});
