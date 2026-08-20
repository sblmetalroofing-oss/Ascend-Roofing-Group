import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    applyPrune,
    normaliseKeepEntry,
    planPrune,
    readKeepList,
    redirectTargetFor,
    slugOf,
} from '../scripts/prune-service-areas.js';

// A minimal site on disk. applyPrune deletes files and rewrites vercel.json,
// so every case that exercises it runs against one of these, never the repo.
function makeSite({ suburbs = [], keep = null, vercel = { redirects: [] } } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
    fs.mkdirSync(path.join(dir, 'service-areas'), { recursive: true });
    for (const s of suburbs) {
        fs.writeFileSync(path.join(dir, 'service-areas', `${slugOf(s.name)}.html`), '<html></html>');
    }
    fs.writeFileSync(path.join(dir, 'suburbs.json'), JSON.stringify(suburbs));
    fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify(vercel));
    if (keep) fs.writeFileSync(path.join(dir, 'service-areas', 'keep.json'), JSON.stringify(keep));
    return dir;
}

const SUBURBS = [
    { name: 'Ascot', postcode: '4007', region: 'Brisbane' },
    { name: 'Hamilton', postcode: '4007', region: 'Brisbane' },
    { name: 'Bulimba', postcode: '4171', region: 'Brisbane' },
    { name: 'Southport', postcode: '4215', region: 'Gold Coast' },
];

describe('slugOf', () => {
    it('builds the page slug from the suburb name', () => {
        expect(slugOf('Ascot')).toBe('roofing-ascot');
        expect(slugOf('Mount Gravatt East')).toBe('roofing-mount-gravatt-east');
    });

    it('collapses punctuation rather than emitting it', () => {
        expect(slugOf("O'Connell  Park")).toBe('roofing-o-connell-park');
    });
});

describe('normaliseKeepEntry', () => {
    it('accepts a bare suburb name, a slug, or a path', () => {
        expect(normaliseKeepEntry('ascot')).toBe('roofing-ascot');
        expect(normaliseKeepEntry('roofing-ascot')).toBe('roofing-ascot');
        expect(normaliseKeepEntry('service-areas/roofing-ascot.html')).toBe('roofing-ascot');
    });

    it('tolerates surrounding whitespace', () => {
        expect(normaliseKeepEntry('  Ascot \n')).toBe('roofing-ascot');
    });
});

describe('redirectTargetFor', () => {
    const removed = { name: 'Hamilton', postcode: '4007', region: 'Brisbane' };

    it('prefers a kept suburb sharing the postcode', () => {
        const kept = new Set(['roofing-ascot', 'roofing-bulimba']);
        expect(redirectTargetFor(removed, kept, SUBURBS)).toBe('/service-areas/roofing-ascot.html');
    });

    it('falls back to a kept suburb in the same region', () => {
        const kept = new Set(['roofing-bulimba']);
        expect(redirectTargetFor(removed, kept, SUBURBS)).toBe('/service-areas/roofing-bulimba.html');
    });

    it('falls back to the hub when nothing in the region survives', () => {
        const kept = new Set(['roofing-southport']);
        expect(redirectTargetFor(removed, kept, SUBURBS)).toBe('/locations.html');
    });
});

describe('planPrune', () => {
    it('returns null when there is no keep-list to act on', () => {
        expect(planPrune(makeSite({ suburbs: SUBURBS }))).toBeNull();
    });

    it('plans a removal for every suburb not on the list', () => {
        const dir = makeSite({ suburbs: SUBURBS, keep: ['ascot', 'southport'] });
        const plan = planPrune(dir);
        expect(plan).toMatchObject({ total: 4, keeping: 2 });
        expect(plan.removals.map((r) => r.slug)).toEqual(['roofing-bulimba', 'roofing-hamilton']);
    });

    it('reports keep-list entries that match no known suburb', () => {
        const dir = makeSite({ suburbs: SUBURBS, keep: ['ascot', 'nowhere-ville'] });
        expect(planPrune(dir).unknown).toEqual(['roofing-nowhere-ville']);
    });

    it('plans nothing to remove when the list covers every suburb', () => {
        const dir = makeSite({ suburbs: SUBURBS, keep: SUBURBS.map((s) => s.name) });
        expect(planPrune(dir).removals).toEqual([]);
    });
});

describe('applyPrune', () => {
    it('deletes the pruned pages and leaves the kept ones', () => {
        const dir = makeSite({ suburbs: SUBURBS, keep: ['ascot', 'southport'] });
        applyPrune(planPrune(dir), dir);

        const left = fs.readdirSync(path.join(dir, 'service-areas')).sort();
        expect(left).toEqual(['keep.json', 'roofing-ascot.html', 'roofing-southport.html']);
    });

    it('drops pruned suburbs from suburbs.json so the build cannot recreate them', () => {
        const dir = makeSite({ suburbs: SUBURBS, keep: ['ascot', 'southport'] });
        applyPrune(planPrune(dir), dir);

        const left = JSON.parse(fs.readFileSync(path.join(dir, 'suburbs.json'), 'utf8'));
        expect(left.map((s) => s.name)).toEqual(['Ascot', 'Southport']);
    });

    it('writes a permanent redirect for each removed page', () => {
        const dir = makeSite({ suburbs: SUBURBS, keep: ['ascot', 'southport'] });
        applyPrune(planPrune(dir), dir);

        const { redirects } = JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8'));
        expect(redirects).toContainEqual({
            source: '/service-areas/roofing-hamilton.html',
            destination: '/service-areas/roofing-ascot.html',
            permanent: true,
        });
        expect(redirects.every((r) => r.permanent)).toBe(true);
    });

    it('orders new redirects ahead of the existing catch-all', () => {
        const catchAll = {
            source: '/roofing-(.*)\\.html',
            destination: '/service-areas/roofing-$1.html',
            permanent: true,
        };
        const dir = makeSite({ suburbs: SUBURBS, keep: ['ascot', 'southport'], vercel: { redirects: [catchAll] } });
        applyPrune(planPrune(dir), dir);

        const { redirects } = JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8'));
        expect(redirects[redirects.length - 1]).toEqual(catchAll);
    });

    it('replaces its own redirects instead of stacking them on a re-run', () => {
        const dir = makeSite({ suburbs: SUBURBS, keep: ['ascot', 'southport'] });
        const plan = planPrune(dir);
        applyPrune(plan, dir);
        applyPrune(plan, dir); // pages already gone; redirects must not duplicate

        const { redirects } = JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8'));
        const sources = redirects.map((r) => r.source);
        expect(new Set(sources).size).toBe(sources.length);
    });

    it('preserves unrelated redirects already in vercel.json', () => {
        const legacy = { source: '/roofing-logan.html', destination: '/locations.html', permanent: true };
        const dir = makeSite({ suburbs: SUBURBS, keep: ['ascot', 'southport'], vercel: { redirects: [legacy] } });
        applyPrune(planPrune(dir), dir);

        const { redirects } = JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8'));
        expect(redirects).toContainEqual(legacy);
    });
});

describe('readKeepList', () => {
    it('rejects a keep.json that is not an array', () => {
        const dir = makeSite({ suburbs: SUBURBS });
        fs.writeFileSync(path.join(dir, 'service-areas', 'keep.json'), '{"keep":[]}');
        expect(() => readKeepList(dir)).toThrow(/must be a JSON array/);
    });
});
