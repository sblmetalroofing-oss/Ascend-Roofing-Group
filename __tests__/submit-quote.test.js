import { jest } from '@jest/globals';

// ─── Mock resend before importing handler ─────────────────
const mockEmailSend = jest.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null });
jest.unstable_mockModule('resend', () => ({
    Resend: jest.fn(() => ({ emails: { send: mockEmailSend } }))
}));

function makeReq(body) {
    return { method: 'POST', body, headers: { origin: 'https://www.ascendroofinggroup.com.au' } };
}

// Nominatim geocoding response used to enrich the address with a suburb
function mockNominatimSuccess({ postcode = '4000', suburb = 'Brisbane City' } = {}) {
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{
            lat: '-27.4698',
            lon: '153.0251',
            display_name: `1 Test Street, ${suburb} QLD ${postcode}, Australia`,
            address: { state: 'Queensland', postcode, suburb }
        }])
    });
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const validBody = {
    name: 'John Smith',
    email: 'john@smith.com',
    phone: '0400000000',
    address: '1 Test Street Brisbane QLD 4000',
    roof_type: 'Terracotta Tiles',
    service: 'Full Replacement',
    message: 'Looking for a quote on my roof.'
};

describe('submit-quote handler', () => {
    let handler;

    beforeAll(async () => {
        const mod = await import('../api/submit-quote.js');
        handler = mod.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.RESEND_API_KEY = 'test-key';
        // Handler now geocodes the address (best-effort) to enrich it with a suburb.
        global.fetch = jest.fn().mockResolvedValue(mockNominatimSuccess());
    });

    afterEach(() => {
        delete process.env.RESEND_API_KEY;
    });

    // ── Method guard ─────────────────────────────────────
    test('returns 405 for non-POST requests', async () => {
        const req = { method: 'GET', body: {} };
        const res = makeRes();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    // ── Happy path ────────────────────────────────────────
    test('sends email and returns 200 for valid submission', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    // ── Sanitization ──────────────────────────────────────
    test('sanitizes HTML entities in name field', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, name: '<script>alert(1)</script>' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    test('sanitizes HTML entities in email field', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, email: '"test"@example.com' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('"test"');
        expect(html).toContain('&quot;test&quot;');
    });

    test('sanitizes HTML entities in message field', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, message: '<b>Bold message</b> & "quoted"' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<b>');
        expect(html).toContain('&lt;b&gt;');
        expect(html).toContain('&amp;');
        expect(html).toContain('&quot;');
    });

    test('sanitizes HTML entities in phone field', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, phone: '<script>1</script>' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<script>');
    });

    test('sanitizes HTML entities in address field', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, address: "1 Test's Road <b>Here</b>" }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).toContain('&#x27;');
        expect(html).not.toContain('<b>');
    });

    // ── Required field validation ─────────────────────────
    test('returns 400 when required fields are missing (only name provided)', async () => {
        const res = makeRes();
        await handler(makeReq({ name: 'Test User' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    test('returns 400 when all fields are missing', async () => {
        const res = makeRes();
        await handler(makeReq({}), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    // ── Email content ─────────────────────────────────────
    test('email subject includes customer name', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        const { subject } = mockEmailSend.mock.calls[0][0];
        expect(subject).toContain('John Smith');
    });

    test('email html contains all submitted field values', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        const { html } = mockEmailSend.mock.calls[0][0];
        expect(html).toContain('John Smith');
        expect(html).toContain('john@smith.com');
        expect(html).toContain('0400000000');
        expect(html).toContain('Terracotta Tiles');
        expect(html).toContain('Full Replacement');
        expect(html).toContain('Looking for a quote');
    });

    // ── Simulation mode ───────────────────────────────────
    test('returns 200 in simulation mode when RESEND_API_KEY not set', async () => {
        delete process.env.RESEND_API_KEY;
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockEmailSend).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].success).toBe(true);
        expect(res.json.mock.calls[0][0].message).toMatch(/simulation/i);
    });

    // ── Resend error handling ─────────────────────────────
    test('returns 400 when Resend returns an error object', async () => {
        mockEmailSend.mockResolvedValueOnce({ data: null, error: { message: 'Invalid recipient' } });
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    test('returns 500 when Resend throws an exception', async () => {
        mockEmailSend.mockRejectedValueOnce(new Error('ECONNRESET'));
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    // ── Custom env overrides ──────────────────────────────
    test('uses FROM_EMAIL env var when set', async () => {
        process.env.FROM_EMAIL = 'custom@sender.com';
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockEmailSend.mock.calls[0][0].from).toBe('custom@sender.com');
        delete process.env.FROM_EMAIL;
    });

    test('uses BUSINESS_EMAIL env var as recipient when set', async () => {
        process.env.BUSINESS_EMAIL = 'office@business.com.au';
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockEmailSend.mock.calls[0][0].to).toBe('office@business.com.au');
        delete process.env.BUSINESS_EMAIL;
    });

    // ── Suburb enrichment ─────────────────────────────────
    test('appends geocoded suburb to the address when typed without one', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, address: '4 Shields Street' }), res);
        const { html } = mockEmailSend.mock.calls[0][0];
        expect(html).toContain('Brisbane City');
        expect(html).toContain('4 Shields Street');
    });

    test('still sends the lead with the raw address when geocoding fails', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
        const res = makeRes();
        await handler(makeReq({ ...validBody, address: '4 Shields Street' }), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
        const { html } = mockEmailSend.mock.calls[0][0];
        expect(html).toContain('4 Shields Street');
        expect(html).not.toContain('Brisbane City');
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
