import { jest } from '@jest/globals';

function makeReq(headers = { origin: 'https://www.ascendroofinggroup.com.au' }) {
    return { method: 'GET', query: {}, headers };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
}

// Places API (New) Place Details shape.
function mockPlaceSuccess(overrides = {}) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            rating: 4.9,
            userRatingCount: 87,
            googleMapsUri: 'https://maps.google.com/?cid=123',
            reviews: [
                {
                    rating: 5,
                    text: { text: 'Replaced our roof in three days. Tidy and on time.' },
                    authorAttribution: { displayName: 'Sarah R.', photoUri: 'https://lh3.googleusercontent.com/a/x' },
                    relativePublishTimeDescription: '2 months ago'
                },
                {
                    rating: 5,
                    // no text — must be filtered out
                    authorAttribution: { displayName: 'Empty Reviewer' },
                    relativePublishTimeDescription: 'a week ago'
                }
            ],
            ...overrides
        })
    });
}

function mockPlaceError(httpStatus, status) {
    return Promise.resolve({
        ok: false,
        status: httpStatus,
        json: () => Promise.resolve({ error: { code: httpStatus, status, message: 'API error' } })
    });
}

describe('google-reviews handler', () => {
    let handler, resetCache;

    beforeAll(async () => {
        const mod = await import('../api/google-reviews.js');
        handler = mod.default;
        resetCache = mod.__testing.resetCache;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetCache();
        process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
        process.env.GOOGLE_PLACE_ID = 'test-place-id';
    });

    afterEach(() => {
        delete process.env.GOOGLE_MAPS_API_KEY;
        delete process.env.GOOGLE_PLACE_ID;
    });

    test('returns 405 for non-GET requests', async () => {
        const res = makeRes();
        await handler({ method: 'POST', query: {}, headers: {} }, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    test('returns 403 for a disallowed origin', async () => {
        const res = makeRes();
        await handler(makeReq({ origin: 'https://evil.example.com' }), res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    // The page must never invent a rating: with no place id configured the
    // endpoint reports unavailable rather than guessing.
    test('reports unavailable when GOOGLE_PLACE_ID is not set', async () => {
        delete process.env.GOOGLE_PLACE_ID;
        const res = makeRes();
        await handler(makeReq(), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            available: false, reason: 'not-configured'
        }));
    });

    test('returns rating, count and reviews from Place Details', async () => {
        global.fetch = jest.fn().mockReturnValue(mockPlaceSuccess());
        const res = makeRes();
        await handler(makeReq(), res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.available).toBe(true);
        expect(payload.rating).toBe(4.9);
        expect(payload.total).toBe(87);
        expect(payload.profileUrl).toBe('https://maps.google.com/?cid=123');
        expect(payload.reviews).toHaveLength(1); // the text-less review is dropped
        expect(payload.reviews[0]).toEqual(expect.objectContaining({
            author: 'Sarah R.', rating: 5, when: '2 months ago'
        }));
    });

    test('sends the API key and a field mask, and asks for the configured place', async () => {
        global.fetch = jest.fn().mockReturnValue(mockPlaceSuccess());
        await handler(makeReq(), makeRes());

        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toContain('/v1/places/test-place-id');
        expect(opts.headers['X-Goog-Api-Key']).toBe('test-google-key');
        expect(opts.headers['X-Goog-FieldMask']).toContain('userRatingCount');
    });

    test('a second call inside the TTL does not hit Google again', async () => {
        global.fetch = jest.fn().mockReturnValue(mockPlaceSuccess());
        await handler(makeReq(), makeRes());
        await handler(makeReq(), makeRes());
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('a Google error degrades to unavailable rather than failing the page', async () => {
        global.fetch = jest.fn().mockReturnValue(mockPlaceError(403, 'PERMISSION_DENIED'));
        const res = makeRes();
        await handler(makeReq(), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            available: false, reason: 'lookup-failed'
        }));
    });

    test('a network failure degrades to unavailable', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
        const res = makeRes();
        await handler(makeReq(), res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            available: false, reason: 'request-failed'
        }));
    });

    test('a place with no rating yet is reported as unavailable', async () => {
        global.fetch = jest.fn().mockReturnValue(mockPlaceSuccess({ rating: 0, userRatingCount: 0, reviews: [] }));
        const res = makeRes();
        await handler(makeReq(), res);
        expect(res.json.mock.calls[0][0].available).toBe(false);
    });
});
