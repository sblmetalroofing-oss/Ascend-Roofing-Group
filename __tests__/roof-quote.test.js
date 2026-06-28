import { jest } from '@jest/globals';

// ─── Mock resend before importing handler ─────────────────
const mockEmailSend = jest.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null });
jest.unstable_mockModule('resend', () => ({
    Resend: jest.fn(() => ({ emails: { send: mockEmailSend } }))
}));

// ─── Helpers ──────────────────────────────────────────────

// Unique client IP per request so the handler's in-memory per-IP rate limiter
// (1 request / 5 min) doesn't 429 subsequent tests sharing one process.
let _ipCounter = 0;
function makeReq(body) {
    _ipCounter += 1;
    return {
        method: 'POST',
        body,
        headers: {
            origin: 'https://www.ascendroofinggroup.com.au',
            'x-forwarded-for': `203.0.113.${_ipCounter}`,
        },
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

// Nominatim geocoding response for a valid SEQ address
function mockNominatimSuccess({ postcode = '4000', state = 'Queensland' } = {}) {
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{
            lat: '-27.4698',
            lon: '153.0251',
            display_name: '1 Brisbane St, Brisbane City QLD 4000, Australia',
            address: { state, postcode, suburb: 'Brisbane City' }
        }])
    });
}

// Google Solar API response
function mockSolarSuccess({ areaSqm = 150, pitchDegrees = 20 } = {}) {
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
            solarPotential: {
                wholeRoofStats: { areaMeters2: areaSqm },
                roofSegmentStats: [{
                    stats: { areaMeters2: areaSqm },
                    pitchDegrees
                }]
            }
        })
    });
}

function mockSolar404() {
    return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('Not found') });
}

// ─── Tests ────────────────────────────────────────────────

describe('roof-quote handler', () => {
    let handler;

    beforeAll(async () => {
        const mod = await import('../api/roof-quote.js');
        handler = mod.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.RESEND_API_KEY;
        // Set API key so getRoofData proceeds to call Solar API (mocked via global.fetch)
        process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
    });

    afterEach(() => {
        delete process.env.GOOGLE_MAPS_API_KEY;
    });

    // ── Method guard ─────────────────────────────────────
    test('returns 405 for non-POST requests', async () => {
        const req = { method: 'GET', body: {} };
        const res = makeRes();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    // ── Input validation ─────────────────────────────────
    test('rejects missing address', async () => {
        const res = makeRes();
        await handler(makeReq({ job_type: 'replacement', email: 'test@example.com' }), res);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].error).toMatch(/valid street address/i);
    });

    test('rejects address shorter than 5 characters', async () => {
        const res = makeRes();
        await handler(makeReq({ address: 'abc', job_type: 'replacement' }), res);
        expect(res.status).toHaveBeenCalledWith(422);
    });

    test('rejects address longer than 300 characters', async () => {
        const res = makeRes();
        await handler(makeReq({ address: 'a'.repeat(301), job_type: 'replacement' }), res);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].error).toMatch(/too long/i);
    });

    test('rejects invalid job type', async () => {
        const res = makeRes();
        await handler(makeReq({ address: '1 Valid Street Brisbane', job_type: 'demolish' }), res);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].error).toMatch(/invalid job type/i);
    });

    test('rejects invalid email format', async () => {
        const res = makeRes();
        await handler(makeReq({ address: '1 Valid Street Brisbane', job_type: 'replacement', email: 'not-an-email' }), res);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].error).toMatch(/valid email/i);
    });

    test('accepts valid email format', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockNominatimSuccess()).mockResolvedValueOnce(mockSolar404());
        const res = makeRes();
        await handler(makeReq({ address: '1 Test Street Brisbane QLD', job_type: 'replacement', email: 'user@domain.com.au' }), res);
        expect(res.status).not.toHaveBeenCalledWith(422);
    });

    test.each([
        ['<script>alert(1)</script>', 'script tag'],
        ['addr javascript: void', 'javascript: protocol'],
        ['1 Street onerror=alert(1)', 'onerror= attribute'],
        ['1 Street onload=evil()', 'onload= attribute'],
    ])('rejects XSS pattern in address: %s (%s)', async (address) => {
        const res = makeRes();
        await handler(makeReq({ address, job_type: 'replacement' }), res);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].error).toMatch(/invalid characters/i);
    });

    // ── Geocoding ────────────────────────────────────────
    test('returns 404 when Nominatim finds no results', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([])
        });
        const res = makeRes();
        await handler(makeReq({ address: '1 Nowhere Street QLD', job_type: 'replacement' }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json.mock.calls[0][0].error).toMatch(/could not find address/i);
    });

    test('returns 404 when address is outside Queensland', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([{
                lat: '-33.8688',
                lon: '151.2093',
                display_name: '1 Test St, Sydney NSW 2000',
                address: { state: 'New South Wales', postcode: '2000', suburb: 'Sydney' }
            }])
        });
        const res = makeRes();
        await handler(makeReq({ address: '1 Test Street Sydney', job_type: 'replacement' }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json.mock.calls[0][0].error).toMatch(/outside queensland/i);
    });

    test('returns 404 for postcode outside SEQ service area (e.g. Cairns 4870) when geocoded', async () => {
        // Nominatim geocodes the address but postcode is non-SEQ → geocodeAddress returns error → handler 404
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([{
                lat: '-16.9186',
                lon: '145.7781',
                display_name: '1 Test St, Cairns QLD 4870',
                address: { state: 'Queensland', postcode: '4870', suburb: 'Cairns' }
            }])
        });
        const res = makeRes();
        await handler(makeReq({ address: '1 Test Street Cairns QLD', job_type: 'replacement' }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json.mock.calls[0][0].error).toMatch(/outside our primary service area/i);
    });

    test('returns 422 for non-SEQ postcode extracted from address when client coords provided', async () => {
        // When client lat/lng supplied, postcode is extracted from address string then checked
        global.fetch = jest.fn().mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({
            address: '1 Test Street Cairns QLD 4870',
            job_type: 'replacement',
            lat: '-16.9186',
            lng: '145.7781'
        }), res);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json.mock.calls[0][0].error).toMatch(/outside our primary service area/i);
    });

    // ── Quote calculation: job type multipliers ───────────
    test('new_metal_install uses 1.0x multiplier', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'new_metal_install' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.quote.available).toBe(true);
        // 100sqm * $100 * 1.0 = $10,000; range: $9,000–$11,000
        expect(body.quote.base_amount).toBe(10000);
        expect(body.quote.range_low).toBe(9000);
        expect(body.quote.range_high).toBe(11000);
    });

    test('replacement uses 1.15x multiplier', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'replacement' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.quote.available).toBe(true);
        // 100sqm * $100 * 1.15 = $11,500
        expect(body.quote.base_amount).toBe(11500);
        expect(body.quote.job_type_multiplier).toBe(1.15);
    });

    test('repair uses 0.5x multiplier', async () => {
        // Use 30sqm to stay under the 50sqm repair cap so multiplier is the only variable
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 30, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'repair' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.quote.available).toBe(true);
        // 30sqm * $100 * 0.5 = $1,500
        expect(body.quote.base_amount).toBe(1500);
        expect(body.quote.job_type_multiplier).toBe(0.5);
    });

    // ── Quote calculation: repair area cap ────────────────
    test('repair caps area at 50sqm for large roofs', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 200, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'repair' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.quote.area_sqm).toBe(50);
        // 50sqm * $100 * 0.5 = $2,500
        expect(body.quote.base_amount).toBe(2500);
    });

    test('repair does not cap area when already under 50sqm', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 30, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'repair' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.quote.area_sqm).toBe(30);
    });

    // ── Quote calculation: surcharges ─────────────────────
    test('adds 10% high pitch surcharge for pitch > 25 degrees', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 30 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'new_metal_install' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.quote.surcharges).toHaveLength(1);
        expect(body.quote.surcharges[0].name).toBe('High Pitch Surcharge');
        // base 10000 + 10% = 11000
        expect(body.quote.estimated_total).toBe(11000);
    });

    test('no high pitch surcharge for pitch <= 25 degrees', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 25 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'new_metal_install' }), res);
        const body = res.json.mock.calls[0][0];
        const pitchSurcharges = body.quote.surcharges.filter(s => s.name === 'High Pitch Surcharge');
        expect(pitchSurcharges).toHaveLength(0);
    });

    // ── Coastal postcode surcharge ────────────────────────
    test.each([
        ['4217', 'Surfers Paradise'],
        ['4218', 'Main Beach'],
        ['4507', 'Bribie Island'],
    ])('adds 20% coastal surcharge for postcode %s (%s)', async (postcode) => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: `1 Test St QLD ${postcode}`, job_type: 'new_metal_install' }), res);
        const body = res.json.mock.calls[0][0];
        const coastal = body.quote.surcharges.find(s => s.name === 'Coastal Location Surcharge');
        expect(coastal).toBeDefined();
        expect(coastal.rate).toBe('+20%');
    });

    test('non-coastal SEQ postcode has no coastal surcharge', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'new_metal_install' }), res);
        const body = res.json.mock.calls[0][0];
        const coastal = body.quote.surcharges.find(s => s.name === 'Coastal Location Surcharge');
        expect(coastal).toBeUndefined();
    });

    // ── Quote range ───────────────────────────────────────
    test('range_low and range_high are always ±10% of estimated_total', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 120, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'replacement' }), res);
        const { estimated_total, range_low, range_high } = res.json.mock.calls[0][0].quote;
        expect(range_low).toBeCloseTo(estimated_total * 0.9, 1);
        expect(range_high).toBeCloseTo(estimated_total * 1.1, 1);
    });

    // ── Fallback when Solar API returns 404 ──────────────
    test('returns unavailable quote when Solar API has no data', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolar404());
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'replacement' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.quote.available).toBe(false);
        expect(body.quote.message).toMatch(/on-site inspection/i);
    });

    // ── Client-provided coordinates ───────────────────────
    test('uses client lat/lng without calling Nominatim', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 80, pitchDegrees: 15 }));
        const res = makeRes();
        await handler(makeReq({
            address: '1 Test St Brisbane QLD 4000',
            job_type: 'new_metal_install',
            lat: '-27.4698',
            lng: '153.0251'
        }), res);
        // Only one fetch call (Solar API), not two (Nominatim + Solar)
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── Client-provided coordinates: postcode extraction ─
    test('extracts 4xxx postcode from address string when lat/lng provided', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 80, pitchDegrees: 15 }));
        const res = makeRes();
        await handler(makeReq({
            address: '1 Test St Surfers Paradise QLD 4217',
            job_type: 'new_metal_install',
            lat: '-27.9',
            lng: '153.4'
        }), res);
        const body = res.json.mock.calls[0][0];
        // 4217 is coastal — should have coastal surcharge
        const coastal = body.quote.surcharges?.find(s => s.name === 'Coastal Location Surcharge');
        expect(coastal).toBeDefined();
    });

    // ── Postcode extraction: street number must not win (B1) ─
    test('uses the postcode after the state token, not a leading street number', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({
            address: '4115 Mount Lindesay Hwy, Park Ridge QLD 4125',
            job_type: 'replacement',
            lat: '-27.81',
            lng: '153.02'
        }), res);
        const body = res.json.mock.calls[0][0];
        // 4125 (real postcode) — not 4115 (street number)
        expect(body.postcode).toBe('4125');
    });

    test('a leading 4xxx street number does not trigger a wrong coastal surcharge', async () => {
        // First 4xxx token (4500, non-coastal) precedes the real postcode (4218, coastal)
        global.fetch = jest.fn().mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({
            address: '4500 Gold Coast Hwy, Mermaid Beach QLD 4218',
            job_type: 'new_metal_install',
            lat: '-28.05',
            lng: '153.44'
        }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.postcode).toBe('4218');
        const coastal = body.quote.surcharges.find(s => s.name === 'Coastal Location Surcharge');
        expect(coastal).toBeDefined();
    });

    // ── Client coordinate validation (B2) ─────────────────
    test('falls back to Nominatim when client coords are non-numeric', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({
            address: '1 Test St Brisbane QLD 4000',
            job_type: 'replacement',
            lat: 'abc',
            lng: 'def'
        }), res);
        // Two fetches: Nominatim + Solar (client coords rejected)
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('falls back to Nominatim when client coords are outside Australia', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({
            address: '1 Test St Brisbane QLD 4000',
            job_type: 'replacement',
            lat: '51.5074',  // London — outside AU bounds
            lng: '-0.1278'
        }), res);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── All-surcharges scenario ───────────────────────────
    test('calculates correctly with all surcharges applied (high pitch + coastal)', async () => {
        // Using client coords + coastal postcode + high pitch
        global.fetch = jest.fn().mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 30 }));
        const res = makeRes();
        await handler(makeReq({
            address: '1 Beachfront Ave Surfers Paradise QLD 4217',
            job_type: 'new_metal_install',
            lat: '-27.9',
            lng: '153.4'
        }), res);
        const body = res.json.mock.calls[0][0];
        // base = 100 * 100 * 1.0 = 10000
        // high pitch = +10% = 1000
        // coastal = +20% = 2000
        // total = 13000
        expect(body.quote.estimated_total).toBe(13000);
        expect(body.quote.surcharges).toHaveLength(2);
    });

    // ── Geocoding service error ───────────────────────────
    test('returns 404 when Nominatim service is unavailable', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({ ok: false });
        const res = makeRes();
        await handler(makeReq({ address: '1 Test Street Brisbane QLD', job_type: 'replacement' }), res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json.mock.calls[0][0].error).toMatch(/geocoding service/i);
    });

    // ── Successful full response ──────────────────────────
    test('returns complete success response with all fields', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 150, pitchDegrees: 20 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'replacement', email: 'client@example.com' }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.quote.available).toBe(true);
        expect(body.roof.area_sqm).toBe(150);
        expect(body.disclaimers).toHaveLength(2);
        expect(body.generated_at).toBeDefined();
    });

    // ── Lead capture only fires with contact info ─────────
    test('does not send email if no contact info provided', async () => {
        process.env.RESEND_API_KEY = 'test-key';
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({ address: '1 Test St Brisbane QLD 4000', job_type: 'replacement' }), res);
        expect(mockEmailSend).not.toHaveBeenCalled();
    });

    test('sends lead capture email when email provided', async () => {
        process.env.RESEND_API_KEY = 'test-key';
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({
            address: '1 Test St Brisbane QLD 4000',
            job_type: 'replacement',
            email: 'client@example.com',
            first_name: 'John',
            last_name: 'Smith'
        }), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
    });

    // ── Suburb enrichment in lead email (manual / Nominatim path) ──
    test('appends geocoded suburb to the address in the lead email when typed without a suburb', async () => {
        process.env.RESEND_API_KEY = 'test-key';
        global.fetch = jest.fn()
            .mockResolvedValueOnce(mockNominatimSuccess({ postcode: '4000' }))
            .mockResolvedValueOnce(mockSolarSuccess({ areaSqm: 100, pitchDegrees: 10 }));
        const res = makeRes();
        await handler(makeReq({
            address: '4 Shields Street',
            job_type: 'new_metal_install',
            email: 'client@example.com',
            first_name: 'John',
            last_name: 'Smith'
        }), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
        const { html, subject } = mockEmailSend.mock.calls[0][0];
        // Nominatim mock resolves the suburb as 'Brisbane City'
        expect(html).toContain('Brisbane City');
        expect(subject).toContain('Brisbane City');
        // The API response address is enriched too
        expect(res.json.mock.calls[0][0].address).toContain('Brisbane City');
    });
});
