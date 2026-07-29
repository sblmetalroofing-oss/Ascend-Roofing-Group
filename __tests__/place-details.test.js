import { jest } from '@jest/globals';
import { parseAddressComponents, PLACE_ID_RE, SESSION_TOKEN_RE } from '../lib/places.js';

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

function component(long_name, types, short_name = long_name) {
    return { long_name, short_name, types };
}

// A typical Australian street address as the legacy Details endpoint returns it.
const BRISBANE_COMPONENTS = [
    component('14', ['street_number']),
    component('Smith Street', ['route'], 'Smith St'),
    component('Wynnum', ['locality', 'political']),
    component('Brisbane City', ['administrative_area_level_2', 'political'], 'Brisbane'),
    component('Queensland', ['administrative_area_level_1', 'political'], 'QLD'),
    component('Australia', ['country', 'political'], 'AU'),
    component('4178', ['postal_code'])
];

function mockDetailsSuccess(components = BRISBANE_COMPONENTS, location = { lat: -27.44, lng: 153.17 }) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            status: 'OK',
            result: {
                address_components: components,
                formatted_address: '14 Smith St, Wynnum QLD 4178, Australia',
                geometry: { location }
            }
        })
    });
}

function mockDetailsStatus(status, error_message = 'API error') {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status, error_message })
    });
}

function requestParams() {
    return new URL(global.fetch.mock.calls[0][0]).searchParams;
}

const VALID_PLACE_ID = 'ChIJ_____abcdefg123';

describe('parseAddressComponents', () => {
    test('splits a standard street address into its parts', () => {
        const parsed = parseAddressComponents(BRISBANE_COMPONENTS);
        expect(parsed.street_address).toBe('14 Smith Street');
        expect(parsed.suburb).toBe('Wynnum');
        expect(parsed.state).toBe('QLD');
        expect(parsed.state_long).toBe('Queensland');
        expect(parsed.postcode).toBe('4178');
        expect(parsed.country).toBe('Australia');
    });

    test('prefixes a unit number using the Australian convention', () => {
        const parsed = parseAddressComponents([
            component('2', ['subpremise']),
            ...BRISBANE_COMPONENTS
        ]);
        expect(parsed.street_address).toBe('2/14 Smith Street');
        expect(parsed.unit).toBe('2');
    });

    test('falls back to sublocality when locality is absent', () => {
        const parsed = parseAddressComponents([
            component('Smith Road', ['route']),
            component('Mount Nebo', ['sublocality', 'political']),
            component('Queensland', ['administrative_area_level_1'], 'QLD'),
            component('4520', ['postal_code'])
        ]);
        expect(parsed.suburb).toBe('Mount Nebo');
    });

    test('falls back to the council area when no locality or sublocality exists', () => {
        const parsed = parseAddressComponents([
            component('Somewhere Road', ['route']),
            component('Somerset', ['administrative_area_level_2', 'political']),
            component('Queensland', ['administrative_area_level_1'], 'QLD')
        ]);
        expect(parsed.suburb).toBe('Somerset');
    });

    test('returns empty strings rather than throwing on missing components', () => {
        const parsed = parseAddressComponents(undefined);
        expect(parsed.street_address).toBe('');
        expect(parsed.suburb).toBe('');
        expect(parsed.state).toBe('');
        expect(parsed.postcode).toBe('');
    });

    test('handles a route with no street number', () => {
        const parsed = parseAddressComponents([
            component('Old Cleveland Road', ['route']),
            component('Carindale', ['locality'])
        ]);
        expect(parsed.street_address).toBe('Old Cleveland Road');
    });
});

describe('place_id and session token validation patterns', () => {
    test('accepts real-world place id shapes', () => {
        expect(PLACE_ID_RE.test('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(true);
        expect(PLACE_ID_RE.test('EiQxNCBTbWl0aCBTdCwgV3lubnVtIFFMRCA0MTc4LCBBdXN0cmFsaWE')).toBe(true);
    });

    test('rejects ids carrying query separators or whitespace', () => {
        expect(PLACE_ID_RE.test('abc&key=leak')).toBe(false);
        expect(PLACE_ID_RE.test('abc def')).toBe(false);
        expect(PLACE_ID_RE.test('../../etc/passwd')).toBe(false);
        expect(PLACE_ID_RE.test('abc')).toBe(false);
    });

    test('accepts a UUID session token and rejects a malformed one', () => {
        expect(SESSION_TOKEN_RE.test('8e29a0f2-6c1b-4f1e-9a11-2b7c9f0d4e55')).toBe(true);
        expect(SESSION_TOKEN_RE.test('token&key=leak')).toBe(false);
    });
});

describe('place-details handler', () => {
    let handler;

    beforeAll(async () => {
        const mod = await import('../api/place-details.js');
        handler = mod.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
    });

    afterEach(() => {
        delete process.env.GOOGLE_MAPS_API_KEY;
    });

    // ── Guards ────────────────────────────────────────────
    test('returns 405 for non-GET requests', async () => {
        const res = makeRes();
        await handler({ method: 'POST', query: { place_id: VALID_PLACE_ID }, headers: {} }, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    test('returns 403 for a disallowed origin', async () => {
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }, { origin: 'https://evil.example.com' }), res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('returns 400 when place_id is missing', async () => {
        const res = makeRes();
        await handler(makeReq({}), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 for a place_id that could inject query parameters', async () => {
        global.fetch = jest.fn();
        const res = makeRes();
        await handler(makeReq({ place_id: 'abc&key=leak' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('returns 500 when GOOGLE_MAPS_API_KEY is not set', async () => {
        delete process.env.GOOGLE_MAPS_API_KEY;
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].error).toMatch(/server configuration/i);
    });

    // ── Upstream request ──────────────────────────────────
    test('calls the legacy Place Details endpoint with the place id', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockDetailsSuccess());
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }), res);
        expect(global.fetch.mock.calls[0][0]).toContain(
            'https://maps.googleapis.com/maps/api/place/details/json'
        );
        expect(requestParams().get('place_id')).toBe(VALID_PLACE_ID);
    });

    test('requests only the billable fields the forms consume', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockDetailsSuccess());
        await handler(makeReq({ place_id: VALID_PLACE_ID }), makeRes());
        expect(requestParams().get('fields')).toBe(
            'address_component,formatted_address,geometry/location'
        );
    });

    test('forwards a valid session token and drops a malformed one', async () => {
        const token = '8e29a0f2-6c1b-4f1e-9a11-2b7c9f0d4e55';
        global.fetch = jest.fn().mockReturnValueOnce(mockDetailsSuccess());
        await handler(makeReq({ place_id: VALID_PLACE_ID, sessiontoken: token }), makeRes());
        expect(requestParams().get('sessiontoken')).toBe(token);

        jest.clearAllMocks();
        global.fetch = jest.fn().mockReturnValueOnce(mockDetailsSuccess());
        await handler(makeReq({ place_id: VALID_PLACE_ID, sessiontoken: 'bad token' }), makeRes());
        expect(requestParams().get('sessiontoken')).toBeNull();
    });

    // ── Response shape ────────────────────────────────────
    test('returns every address field the forms need', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockDetailsSuccess());
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        const { result } = res.json.mock.calls[0][0];
        expect(result.street_address).toBe('14 Smith Street');
        expect(result.suburb).toBe('Wynnum');
        expect(result.state).toBe('QLD');
        expect(result.postcode).toBe('4178');
        expect(result.formatted_address).toBe('14 Smith St, Wynnum QLD 4178, Australia');
        expect(result.lat).toBe(-27.44);
        expect(result.lng).toBe(153.17);
    });

    test('returns null coordinates when geometry is absent', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockDetailsSuccess(BRISBANE_COMPONENTS, {}));
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }), res);
        const { result } = res.json.mock.calls[0][0];
        expect(result.lat).toBeNull();
        expect(result.lng).toBeNull();
    });

    test('never echoes the API key back to the caller', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockDetailsSuccess());
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }), res);
        expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('test-google-key');
    });

    // ── Failure paths ─────────────────────────────────────
    test('returns 500 when Google denies the request (legacy Places API disabled)', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(
            mockDetailsStatus('REQUEST_DENIED', 'This API project is not authorized to use this API.')
        );
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].error).toMatch(/failed to fetch place details/i);
    });

    test('returns 500 when the place is not found', async () => {
        global.fetch = jest.fn().mockReturnValueOnce(mockDetailsStatus('NOT_FOUND'));
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    test('returns 500 when fetch throws a network error', async () => {
        global.fetch = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
        const res = makeRes();
        await handler(makeReq({ place_id: VALID_PLACE_ID }), res);
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
        await handler(makeReq({ place_id: VALID_PLACE_ID }), makeRes());
        expect(logged.join('\n')).not.toContain('test-google-key');
        spy.mockRestore();
    });
});
