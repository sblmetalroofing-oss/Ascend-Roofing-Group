import { jest } from '@jest/globals';

function makeReq(query, headers = { origin: 'https://www.ascendroofinggroup.com.au' }) {
    return { method: 'GET', query, headers };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn();
    return res;
}

// The legacy Places API answers HTTP 200 for application-level problems too —
// the `status` field carries the real outcome, and `error_message` explains a
// REQUEST_DENIED. Only transport failures show up as a non-2xx.
function mockGoogleSuccess(predictions = []) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            status: predictions.length ? 'OK' : 'ZERO_RESULTS',
            predictions
        })
    });
}

function mockGoogleStatus(status, error_message = 'API error') {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status, error_message })
    });
}

function mockHttpError(httpStatus) {
    return Promise.resolve({
        ok: false,
        status: httpStatus,
        json: () => Promise.resolve({})
    });
}

function prediction(description, place_id = 'abc123') {
    return { description, place_id };
}

// Query string of the URL the handler fetched.
function requestParams() {
    return new URL(global.fetch.mock.calls[0][0]).searchParams;
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
    test('proxies to the legacy Places Autocomplete endpoint for 3+ character input', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(
            mockGoogleSuccess([prediction('1 Brisbane St, Brisbane QLD 4000')])
        );
        const res = makeRes();
        await handler(makeReq({ input: 'bri' }), res);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch.mock.calls[0][0]).toContain(
            'https://maps.googleapis.com/maps/api/place/autocomplete/json'
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('sends the trimmed input string as a query parameter', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockGoogleSuccess());
        const res = makeRes();
        await handler(makeReq({ input: '  1 King St Sydney  ' }), res);
        expect(requestParams().get('input')).toBe('1 King St Sydney');
    });

    test('restricts results to Australian addresses', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockGoogleSuccess());
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(requestParams().get('components')).toBe('country:au');
        expect(requestParams().get('types')).toBe('address');
    });

    // ── Session tokens ────────────────────────────────────
    test('forwards a valid session token so the lookup is billed as one session', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockGoogleSuccess());
        const res = makeRes();
        const token = '8e29a0f2-6c1b-4f1e-9a11-2b7c9f0d4e55';
        await handler(makeReq({ input: 'Brisbane', sessiontoken: token }), res);
        expect(requestParams().get('sessiontoken')).toBe(token);
    });

    test('drops a malformed session token rather than forwarding it', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockGoogleSuccess());
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane', sessiontoken: 'bad token&key=leak' }), res);
        expect(requestParams().get('sessiontoken')).toBeNull();
    });

    // ── API key handling ──────────────────────────────────
    test('never echoes the API key back to the caller', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(
            mockGoogleSuccess([prediction('1 Test St, Brisbane QLD 4000')])
        );
        const res = makeRes();
        await handler(makeReq({ input: 'Test' }), res);
        expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('test-google-key');
    });

    test('returns 500 when GOOGLE_MAPS_API_KEY is not set', async () => {
        delete process.env.GOOGLE_MAPS_API_KEY;
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].error).toMatch(/server configuration/i);
    });

    // ── No matches ────────────────────────────────────────
    test('returns 200 with empty predictions when Google has no matches', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockGoogleSuccess([]));
        const res = makeRes();
        await handler(makeReq({ input: 'zzzzz' }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].predictions).toEqual([]);
    });

    // ── Google API error status ───────────────────────────
    test('returns 500 when Google denies the request (legacy Places API disabled)', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(
            mockGoogleStatus('REQUEST_DENIED', 'This API project is not authorized to use this API.')
        );
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].error).toMatch(/failed to fetch predictions/i);
    });

    test('returns 500 when Google rejects the request as invalid', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockGoogleStatus('INVALID_REQUEST'));
        const res = makeRes();
        await handler(makeReq({ input: 'Brisbane' }), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    test('returns 500 when Google answers a non-2xx', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockHttpError(503));
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

    test('scrubs the API key out of logged errors', async () => {
        const logged = [];
        const spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
            logged.push(args.join(' '));
        });
        global.fetch = jest.fn().mockRejectedValueOnce(
            new Error('fetch failed for https://maps.googleapis.com/...?key=test-google-key')
        );
        await handler(makeReq({ input: 'Brisbane' }), makeRes());
        expect(logged.join('\n')).not.toContain('test-google-key');
        expect(logged.join('\n')).toContain('***');
        spy.mockRestore();
    });

    // ── Response mapping ──────────────────────────────────
    test('maps Google predictions to the dropdown shape', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(
            mockGoogleSuccess([prediction('1 Test St, Brisbane QLD 4000, Australia', 'abc123')])
        );
        const res = makeRes();
        await handler(makeReq({ input: 'Test' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.predictions).toEqual([
            { description: '1 Test St, Brisbane QLD 4000, Australia', place_id: 'abc123' }
        ]);
        expect(body.status).toBe('OK');
    });

    test('skips predictions missing a description or place_id', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockGoogleSuccess([
            prediction('1 Real St, Beenleigh QLD 4207, Australia', 'real1'),
            { description: 'no place id' },
            { place_id: 'no-description' }
        ]));
        const res = makeRes();
        await handler(makeReq({ input: 'Beenleigh' }), res);
        expect(res.json.mock.calls[0][0].predictions).toEqual([
            { description: '1 Real St, Beenleigh QLD 4207, Australia', place_id: 'real1' }
        ]);
    });
});
