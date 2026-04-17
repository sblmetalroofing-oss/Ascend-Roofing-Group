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

const mockExtractInsuranceData = jest.fn();
jest.unstable_mockModule('../lib/extract-insurance-data.js', () => ({
    extractInsuranceData: mockExtractInsuranceData
}));

// ─── Helpers ──────────────────────────────────────────────

function makeReq(body) {
    return { method: 'POST', body, headers: { origin: 'https://www.ascendroofinggroup.com.au' } };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

// Days from today as ISO date string
function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

const validFiles = {
    publicLiability: {
        name: 'public_liability.png',
        type: 'image/png',
        data: 'data:image/png;base64,AAABBBCCC=='
    },
    workersComp: {
        name: 'workers_comp.png',
        type: 'image/png',
        data: 'data:image/png;base64,DDDEEEFFF=='
    }
};

const validBody = {
    firstName: 'Bob',
    lastName: 'Builder',
    email: 'bob@builder.com',
    phone: '0400000000',
    businessName: 'Bob Builder Pty Ltd',
    abn: '12345678901',
    businessAddress: '1 Trade St Brisbane QLD 4000',
    bsb: '062-000',
    accountNumber: '12345678',
    accountName: 'Bob Builder',
    files: validFiles
};

const successExtraction = {
    success: true,
    data: {
        document_type: 'Public Liability',
        expiry_date: daysFromNow(90),
        policy_number: 'PL-001',
        insurer_name: 'CGU Insurance',
        confidence: 0.9
    }
};

describe('submit-subby-pack handler', () => {
    let handler;

    beforeAll(async () => {
        const mod = await import('../api/submit-subby-pack.js');
        handler = mod.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.RESEND_API_KEY = 'test-key';
        delete process.env.POSTGRES_URL;
        mockExtractInsuranceData.mockResolvedValue(successExtraction);
    });

    afterEach(() => {
        delete process.env.RESEND_API_KEY;
        delete process.env.POSTGRES_URL;
    });

    // ── Method guard ─────────────────────────────────────
    test('returns 405 for non-POST requests', async () => {
        const req = { method: 'GET', body: {} };
        const res = makeRes();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    // ── Required field validation ─────────────────────────
    test.each([
        'firstName', 'lastName', 'email', 'phone', 'businessName', 'bsb', 'accountNumber', 'accountName'
    ])('returns 400 when required field "%s" is missing', async (field) => {
        const body = { ...validBody };
        delete body[field];
        const res = makeRes();
        await handler(makeReq(body), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/missing required fields/i);
    });

    // ── Required files validation ─────────────────────────
    test('returns 400 when publicLiability file is missing', async () => {
        const body = { ...validBody, files: { workersComp: validFiles.workersComp } };
        const res = makeRes();
        await handler(makeReq(body), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].message).toMatch(/public liability/i);
    });

    test('returns 400 when workersComp file is missing', async () => {
        const body = { ...validBody, files: { publicLiability: validFiles.publicLiability } };
        const res = makeRes();
        await handler(makeReq(body), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 when files object is missing entirely', async () => {
        const body = { ...validBody };
        delete body.files;
        const res = makeRes();
        await handler(makeReq(body), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    // ── Happy path (no DB) ────────────────────────────────
    test('sends email and returns 200 with successful extraction', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    test('calls extractInsuranceData for each provided file', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        // Called for publicLiability and workersComp (2 files)
        expect(mockExtractInsuranceData).toHaveBeenCalledTimes(2);
    });

    // ── AI extraction failure ─────────────────────────────
    test('still sends email when AI extraction fails', async () => {
        mockExtractInsuranceData.mockResolvedValue({ success: false, error: 'OpenAI timeout', data: null });
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── Simulation mode (no API key) ──────────────────────
    test('returns 200 in simulation mode when RESEND_API_KEY not set', async () => {
        delete process.env.RESEND_API_KEY;
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockEmailSend).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].message).toMatch(/simulation/i);
    });

    // ── Database interaction ───────────────────────────────
    test('skips database when POSTGRES_URL is not set', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockSql).not.toHaveBeenCalled();
    });

    test('inserts subcontractor to database when POSTGRES_URL is set', async () => {
        process.env.POSTGRES_URL = 'postgres://test';
        mockSql.mockResolvedValueOnce({ rows: [{ id: 42 }] }); // subcontractor insert
        // No insurance insert since extraction returns a document with expiry
        mockSql.mockResolvedValue({ rows: [] }); // insurance insert
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockSql).toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].subcontractorId).toBe(42);
    });

    test('continues and sends email even when database insert fails', async () => {
        process.env.POSTGRES_URL = 'postgres://test';
        mockSql.mockRejectedValueOnce(new Error('DB connection failed'));
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    // ── Expiry warning: within 60 days ────────────────────
    test('includes expiry warning in email for insurance expiring within 60 days', async () => {
        mockExtractInsuranceData.mockResolvedValue({
            success: true,
            data: {
                document_type: 'Public Liability',
                expiry_date: daysFromNow(25),
                policy_number: 'PL-001',
                insurer_name: 'CGU',
                confidence: 0.9
            }
        });
        const res = makeRes();
        await handler(makeReq(validBody), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).toMatch(/expires in \d+ days/i);
    });

    // ── Expiry warning: expired insurance ────────────────
    test('includes EXPIRED warning for insurance with past expiry date', async () => {
        mockExtractInsuranceData.mockResolvedValue({
            success: true,
            data: {
                document_type: 'Public Liability',
                expiry_date: daysFromNow(-10),
                policy_number: 'PL-001',
                insurer_name: 'CGU',
                confidence: 0.9
            }
        });
        const res = makeRes();
        await handler(makeReq(validBody), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).toMatch(/EXPIRED/i);
        expect(html).toMatch(/\d+ days ago/);
    });

    // ── Email attachments ────────────────────────────────
    test('includes files as attachments in email', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        const { attachments } = mockEmailSend.mock.calls[0][0];
        expect(attachments).toHaveLength(2);
        expect(attachments[0].filename).toBe('public_liability.png');
        expect(attachments[1].filename).toBe('workers_comp.png');
    });

    test('strips data URL prefix from attachment base64 content', async () => {
        const res = makeRes();
        await handler(makeReq(validBody), res);
        const { attachments } = mockEmailSend.mock.calls[0][0];
        // Content should be just the base64 part, not "data:image/png;base64,XXX"
        expect(attachments[0].content).toBe('AAABBBCCC==');
        expect(attachments[1].content).toBe('DDDEEEFFF==');
    });

    // ── Sanitization ──────────────────────────────────────
    test('sanitizes HTML entities in business name to prevent XSS in email', async () => {
        const body = { ...validBody, businessName: '<script>alert(1)</script>' };
        const res = makeRes();
        await handler(makeReq(body), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    // ── Resend error ──────────────────────────────────────
    test('returns 400 when Resend returns an error', async () => {
        mockEmailSend.mockResolvedValueOnce({ data: null, error: { message: 'Bad request' } });
        const res = makeRes();
        await handler(makeReq(validBody), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    // ── Optional fields ───────────────────────────────────
    test('handles missing optional fields (abn, businessAddress) gracefully', async () => {
        const body = { ...validBody };
        delete body.abn;
        delete body.businessAddress;
        const res = makeRes();
        await handler(makeReq(body), res);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('optional otherCerts file is processed if provided', async () => {
        const body = {
            ...validBody,
            files: {
                ...validFiles,
                otherCerts: {
                    name: 'other.png',
                    type: 'image/png',
                    data: 'data:image/png;base64,GGGHHHIII=='
                }
            }
        };
        const res = makeRes();
        await handler(makeReq(body), res);
        // extractInsuranceData called 3 times (PL + WC + other)
        expect(mockExtractInsuranceData).toHaveBeenCalledTimes(3);
    });
});
