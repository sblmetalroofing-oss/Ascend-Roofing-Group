import { jest } from '@jest/globals';

// ─── Mocks ────────────────────────────────────────────────
const mockEmailSend = jest.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null });
jest.unstable_mockModule('resend', () => ({
    Resend: jest.fn(() => ({ emails: { send: mockEmailSend } }))
}));

const mockSql = jest.fn();
jest.unstable_mockModule('@vercel/postgres', () => ({
    sql: mockSql
}));

// ─── Helpers ──────────────────────────────────────────────

function makeReq(body, ip = '1.2.3.4') {
    return {
        method: 'POST',
        body,
        headers: { origin: 'https://www.ascendroofinggroup.com.au', 'x-forwarded-for': ip }
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn();
    return res;
}

const validFiles = {
    photoId: { name: 'licence.png', type: 'image/png', data: 'data:image/png;base64,AAABBBCCC==' },
    whiteCard: { name: 'whitecard.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,DDDEEEFFF==' }
};

const validBody = {
    firstName: 'Jane', lastName: 'Smith', dateOfBirth: '1990-01-15',
    email: 'jane@example.com', phone: '0400000000',
    streetAddress: '1 Test St', suburb: 'Brisbane', state: 'QLD', postcode: '4000',
    emergencyName: 'John Smith', emergencyRelationship: 'Partner', emergencyPhone: '0400000001',
    position: 'Roof Plumber', employmentType: 'Full-time', startDate: '2026-08-01',
    tfn: '123 456 789', taxFreeThreshold: true, australianResident: true, hasHelpDebt: false,
    bsb: '062-000', accountNumber: '12345678', accountName: 'Jane Smith',
    declaration: true,
    files: validFiles
};

describe('submit-new-employee handler', () => {
    let handler;

    beforeAll(async () => {
        const mod = await import('../api/submit-new-employee.js');
        handler = mod.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.RESEND_API_KEY = 'test-key';
        delete process.env.POSTGRES_URL;
        delete process.env.ENCRYPTION_KEY;
    });

    afterEach(() => {
        delete process.env.RESEND_API_KEY;
        delete process.env.POSTGRES_URL;
        delete process.env.ENCRYPTION_KEY;
    });

    // ── Method / origin guards ────────────────────────────
    test('returns 405 for non-POST requests', async () => {
        const res = makeRes();
        await handler({ method: 'GET', body: {}, headers: {} }, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    test('returns 403 for off-site origins', async () => {
        const res = makeRes();
        await handler({ method: 'POST', body: validBody, headers: { origin: 'https://evil.example' } }, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    // ── Validation ────────────────────────────────────────
    test.each([
        'firstName', 'lastName', 'dateOfBirth', 'email', 'phone', 'tfn', 'bsb', 'accountNumber', 'accountName'
    ])('returns 400 when required field "%s" is missing', async (field) => {
        const body = { ...validBody };
        delete body[field];
        const res = makeRes();
        await handler(makeReq(body), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(new RegExp(field, 'i'));
    });

    test('returns 400 when the declaration is not accepted', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, declaration: false }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/declaration/i);
    });

    test('returns 400 when photo ID or white card is missing', async () => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, files: { photoId: validFiles.photoId } }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/white card/i);
    });

    test.each(['12345', 'abcdefgh', '1234567890'])('rejects invalid TFN "%s"', async (tfn) => {
        const res = makeRes();
        await handler(makeReq({ ...validBody, tfn }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/tfn/i);
        // the invalid TFN itself must not be echoed back
        expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain(tfn);
    });

    test('accepts a TFN with spaces (normalised to digits)', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── Upload validation ─────────────────────────────────
    test('rejects disallowed upload content types', async () => {
        const body = {
            ...validBody,
            files: { ...validFiles, photoId: { name: 'x.svg', type: 'image/svg+xml', data: 'data:image/svg+xml;base64,AAAA' } }
        };
        const res = makeRes();
        await handler(makeReq(body), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/pdf, jpg, or png/i);
    });

    test('rejects uploads over the size cap', async () => {
        const big = 'A'.repeat(7 * 1024 * 1024); // ~5.25 MB decoded
        const body = { ...validBody, files: { ...validFiles, photoId: { name: 'big.png', type: 'image/png', data: `data:image/png;base64,${big}` } } };
        const res = makeRes();
        await handler(makeReq(body), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/too large/i);
    });

    // ── PII protection ────────────────────────────────────
    test('email masks the TFN, BSB and account number (last 3 only)', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(res.status).toHaveBeenCalledWith(200);
        const { html, attachments } = mockEmailSend.mock.calls[0][0];
        expect(html).not.toContain('123456789'); // full TFN (normalised)
        expect(html).not.toContain('12345678'); // full account number
        expect(html).toContain('••••••789');
        expect(html).toContain('•••••678');
        // attachments use regenerated names, not client-supplied ones
        expect(attachments.map(a => a.filename)).toEqual(['photo-id.png', 'white-card.pdf']);
    });

    test('stores encrypted TFN/bank fields when ENCRYPTION_KEY is set', async () => {
        process.env.ENCRYPTION_KEY = 'a'.repeat(64);
        process.env.POSTGRES_URL = 'postgres://test';
        mockSql.mockResolvedValue({ rows: [{ id: 42 }] });
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(res.status).toHaveBeenCalledWith(200);
        // sql is a tagged template: values are in the call's remaining args
        const insertValues = mockSql.mock.calls[0].slice(1).map(String);
        expect(insertValues.some(v => v.startsWith('enc:v1:'))).toBe(true);
        expect(insertValues).not.toContain('123456789');
    });

    // ── Failure paths ─────────────────────────────────────
    test('reports a warning when the database write fails', async () => {
        process.env.POSTGRES_URL = 'postgres://test';
        mockSql.mockRejectedValue(new Error('db down'));
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].warning).toMatch(/could not be saved/i);
    });

    test('does not leak internal error details on Resend failure', async () => {
        mockEmailSend.mockResolvedValueOnce({ data: null, error: { message: 'secret internal detail' } });
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret internal detail');
    });

    // ── Rate limiting ─────────────────────────────────────
    test('returns 429 after 5 submissions from the same IP', async () => {
        for (let i = 0; i < 5; i++) {
            const res = makeRes();
            await handler(makeReq(validBody, '5.5.5.5'), res);
            expect(res.status).toHaveBeenCalledWith(200);
        }
        const res = makeRes();
        await handler(makeReq(validBody, '5.5.5.5'), res);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });
});
