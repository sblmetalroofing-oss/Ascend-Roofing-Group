import { jest } from '@jest/globals';

// ─── Mock resend before importing handler ─────────────────
const mockEmailSend = jest.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null });
jest.unstable_mockModule('resend', () => ({
    Resend: jest.fn(() => ({ emails: { send: mockEmailSend } }))
}));

function makeReq(body) {
    return { method: 'POST', body };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const validBase = {
    firstName: 'Jane',
    lastName: 'Smith',
    jobAddress: '1 Test Street Brisbane QLD 4000',
    roofColour: 'Surfmist',
    gutterColour: 'Ironstone',
    fasciaColour: 'Monument',
    signature: 'Typed: Jane Smith'
};

// A minimal but realistic PNG base64 data URL
const validImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('submit-colour handler', () => {
    let handler;

    beforeAll(async () => {
        const mod = await import('../api/submit-colour.js');
        handler = mod.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.RESEND_API_KEY = 'test-key';
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
    test('sends email and returns 200 for valid typed signature', async () => {
        const res = makeRes();
        await handler(makeReq(validBase), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    test('sends email with drawn signature as img tag when valid data URL', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, signature: validImageDataUrl }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).toContain('<img src="data:image/png;base64,');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── XSS fix: signature validation ────────────────────
    test('does NOT embed javascript: URL in img src', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, signature: 'javascript:alert(document.cookie)' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<img src="javascript:');
        expect(html).not.toContain('javascript:');
    });

    test('does NOT embed data:text/html as img src', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, signature: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<img src="data:text/html');
    });

    test('does NOT embed arbitrary string as img src', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, signature: 'data:image/png;base64,<script>alert(1)</script>' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        // The regex won't match because of the script tag in the base64 content
        expect(html).not.toContain('<img src="data:image/png;base64,<script>');
    });

    test('accepts valid data:image/jpeg;base64,... signature', async () => {
        const jpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC==';
        const res = makeRes();
        await handler(makeReq({ ...validBase, signature: jpegDataUrl }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).toContain('<img src="data:image/jpeg;base64,');
    });

    // ── Sanitization ──────────────────────────────────────
    test('sanitizes HTML entities in name fields', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, firstName: '<script>', lastName: '&"test"' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&amp;');
    });

    test('sanitizes HTML entities in address', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, jobAddress: '1 <b>Test</b> Street' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<b>');
        expect(html).toContain('&lt;b&gt;');
    });

    test('sanitizes HTML entities in colour fields', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, roofColour: '<img onerror=alert(1)>' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<img onerror=alert(1)>');
        expect(html).toContain('&lt;img onerror=alert(1)&gt;');
    });

    // ── Null/missing fields ───────────────────────────────
    test('uses "Not selected" when colour fields are missing', async () => {
        const res = makeRes();
        await handler(makeReq({ firstName: 'Jane', lastName: 'Smith', jobAddress: '1 Test St', signature: 'Typed: Jane' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        // All three colour fields default to "Not selected"
        const count = (html.match(/Not selected/g) || []).length;
        expect(count).toBeGreaterThanOrEqual(3);
    });

    test('handles undefined signature without crashing', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, signature: undefined }), res);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── Typed signature detection ─────────────────────────
    test('detects typed signature and renders as text not image', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBase, signature: 'Typed: Jane Smith' }), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        // Should not contain an img tag — typed sig is shown as text
        expect(html).not.toContain('<img src=');
        expect(html).toContain('Typed:');
    });

    // ── Simulation mode (no API key) ──────────────────────
    test('returns 200 in simulation mode when RESEND_API_KEY is not set', async () => {
        delete process.env.RESEND_API_KEY;
        const res = makeRes();
        await handler(makeReq(validBase), res);
        expect(mockEmailSend).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].message).toMatch(/simulation/i);
    });

    // ── Resend error handling ─────────────────────────────
    test('returns 400 when Resend returns an error', async () => {
        mockEmailSend.mockResolvedValueOnce({ data: null, error: { message: 'Rate limit exceeded' } });
        const res = makeRes();
        await handler(makeReq(validBase), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    test('returns 500 when Resend throws an exception', async () => {
        mockEmailSend.mockRejectedValueOnce(new Error('Network error'));
        const res = makeRes();
        await handler(makeReq(validBase), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    // ── Email subject includes customer and address ────────
    test('email subject includes customer name and address', async () => {
        const res = makeRes();
        await handler(makeReq(validBase), res);
        const { subject } = mockEmailSend.mock.calls[0][0];
        expect(subject).toContain('Jane');
        expect(subject).toContain('Smith');
    });
});
