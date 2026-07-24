import { jest } from '@jest/globals';

function makeReq(query, headers = { origin: 'https://www.ascendroofinggroup.com.au' }) {
    return { method: 'GET', query, headers };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

// Places API (New) returns { suggestions: [{ placePrediction: {...} }] } on
// success (the field is simply absent when there are no matches) and a
// { error: { code, status, message } } body with a non-2xx HTTP status on
// failure.
function mockGoogleSuccess(suggestions = []) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(suggestions.length ? { suggestions } : {})
    });
}

function mockGoogleError(httpStatus, status) {
    return Promise.resolve({
        ok: false,
        status: httpStatus,
        json: () => Promise.resolve({ error: { code: httpStatus, status, message: 'API error' } })
    });
}

function suggestion(description, placeId = 'abc123') {
    return { placePrediction: { placeId, text: { text: description } } };
}

describe('places-autocomplete handler', () => {
    let handler;

    beforeAll(async () => {
        const mod = await import('../api/places-autocomplete.js');
        handler = mod.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
    });

    afterEach(() => {
        delete process.env.GOOGLE_MAPS_API_KEY;
    });

    // ── Method guard ─────────────────────────────────────
    test('returns 405 for non-GET requests', async () => {
        const req = { method: 'POST', query: { input: 'test' } };
        const res = makeRes();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    // ── Origin verification ──────────────────────────────
    test('returns 403 for a disallowed origin', async () => {
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }, { origin: 'https://evil.example.com' }), res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 403 when no origin or referer is present', async () => {
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }, {}), res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    // ── Input length validation ───────────────────────────
    test('returns 400 with empty predictions for empty input', async () => {
        const res = makeRes();
        await handler(makeReq({ input: '' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].predictions).toEqual([]);
    });

    test('returns 400 with empty predictions for single character input', async () => {
        const res = makeRes();
        await handler(makeReq({ input: 'a' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 with empty predictions for 2-character input', async () => {
        const res = makeRes();
        await handler(makeReq({ input: 'ab' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 when input is missing', async () => {
        const res = makeRes();
        await handler(makeReq({}), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    // ── Valid input ───────────────────────────────────────
    test('proxies to Google Places API (New) for 3+ character input', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(
            mockGoogleSuccess([suggestion('1 Brisbane St, Brisbane QLD 4000')])
        );
        const res = makeRes();
        await handler(makeReq({ input: 'bri' }), res);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:autocomplete');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── Request body ─────────────────────────────────────
    test('sends the input string in the POST body', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess());
        const res = makeRes();
        await handler(makeReq({ input: '1 King St Sydney' }), res);
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.input).toBe('1 King St Sydney');
    });

    test('region restriction to Australia is included in the request', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess());
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.includedRegionCodes).toEqual(['au']);
    });

    test('sends the API key via header, not the URL', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess());
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        const [url, opts] = global.fetch.mock.calls[0];
        expect(opts.headers['X-Goog-Api-Key']).toBe('test-google-key');
        expect(url).not.toContain('test-google-key');
    });

    // ── Missing API key ───────────────────────────────────
    test('returns 500 when GOOGLE_MAPS_API_KEY is not set', async () => {
        delete process.env.GOOGLE_MAPS_API_KEY;
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].error).toMatch(/server configuration/i);
    });

    // ── No matches ────────────────────────────────────────
    test('returns 200 with empty predictions when Google has no suggestions', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess([]));
        const res = makeRes();
        await handler(makeReq({ input: 'zzzzz' }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body.predictions).toEqual([]);
    });

    // ── Google API error status ───────────────────────────
    test('returns 500 when Google denies the request', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleError(403, 'PERMISSION_DENIED'));
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].error).toMatch(/failed to fetch predictions/i);
    });

    test('returns 500 when Google rejects the request as invalid', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleError(400, 'INVALID_ARGUMENT'));
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    // ── Network error ─────────────────────────────────────
    test('returns 500 when fetch throws a network error', async () => {
        global.fetch = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    // ── Response mapping ──────────────────────────────────
    test('maps Google suggestions to the legacy predictions shape', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(
            mockGoogleSuccess([suggestion('1 Test St, Brisbane QLD 4000, Australia', 'abc123')])
        );
        const res = makeRes();
        await handler(makeReq({ input: 'Test' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.predictions).toEqual([
            { description: '1 Test St, Brisbane QLD 4000, Australia', place_id: 'abc123' }
        ]);
        expect(body.status).toBe('OK');
    });

    test('skips suggestions without a place prediction or description', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess([
            suggestion('1 Real St, Beenleigh QLD 4207, Australia', 'real1'),
            { queryPrediction: { text: { text: 'not a place' } } },
            { placePrediction: { placeId: 'no-text' } }
        ]));
        const res = makeRes();
        await handler(makeReq({ input: 'Beenleigh' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.predictions).toEqual([
            { description: '1 Real St, Beenleigh QLD 4207, Australia', place_id: 'real1' }
        ]);
    });
});
