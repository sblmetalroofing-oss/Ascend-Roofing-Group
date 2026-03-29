import { jest } from '@jest/globals';

function makeReq(query) {
    return { method: 'GET', query };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

function mockGoogleSuccess(predictions = []) {
    return Promise.resolve({
        json: () => Promise.resolve({ status: 'OK', predictions })
    });
}

function mockGoogleZeroResults() {
    return Promise.resolve({
        json: () => Promise.resolve({ status: 'ZERO_RESULTS', predictions: [] })
    });
}

function mockGoogleError(status) {
    return Promise.resolve({
        json: () => Promise.resolve({ status, error_message: 'API error' })
    });
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
    test('proxies to Google for 3+ character input', async () => {
        const mockPredictions = [{ description: '1 Brisbane St, Brisbane QLD 4000' }];
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess(mockPredictions));
        const res = makeRes();
        await handler(makeReq({ input: 'bri' }), res);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── URL encoding ─────────────────────────────────────
    test('URL-encodes the input string in the Google API call', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess());
        const res = makeRes();
        await handler(makeReq({ input: '1 King St Sydney' }), res);
        const calledUrl = global.fetch.mock.calls[0][0];
        expect(calledUrl).toContain(encodeURIComponent('1 King St Sydney'));
    });

    test('country restriction to Australia is included in API call', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess());
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        const calledUrl = global.fetch.mock.calls[0][0];
        expect(calledUrl).toContain('country:au');
    });

    // ── Missing API key ───────────────────────────────────
    test('returns 500 when GOOGLE_MAPS_API_KEY is not set', async () => {
        delete process.env.GOOGLE_MAPS_API_KEY;
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].error).toMatch(/server configuration/i);
    });

    // ── ZERO_RESULTS ──────────────────────────────────────
    test('returns 200 with empty predictions for ZERO_RESULTS status', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleZeroResults());
        const res = makeRes();
        await handler(makeReq({ input: 'zzzzz' }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body.predictions).toEqual([]);
    });

    // ── Google API error status ───────────────────────────
    test('returns 500 when Google returns REQUEST_DENIED status', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleError('REQUEST_DENIED'));
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].error).toMatch(/failed to fetch predictions/i);
    });

    test('returns 500 when Google returns INVALID_REQUEST status', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleError('INVALID_REQUEST'));
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

    // ── Response passthrough ──────────────────────────────
    test('passes through the full Google response including predictions', async () => {
        const mockPredictions = [
            { description: '1 Test St, Brisbane QLD 4000, Australia', place_id: 'abc123' }
        ];
        global.fetch = jest.fn().mockResolvedValueOnce(mockGoogleSuccess(mockPredictions));
        const res = makeRes();
        await handler(makeReq({ input: 'Test' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.predictions).toEqual(mockPredictions);
        expect(body.status).toBe('OK');
    });
});
