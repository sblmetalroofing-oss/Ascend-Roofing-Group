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

function makeReq(headers = {}) {
    return {
        method: 'GET',
        headers: {
            authorization: `Bearer test-cron-secret`,
            ...headers
        }
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
}

function makeInsuranceRecord(overrides = {}) {
    return {
        insurance_id: 1,
        document_type: 'public_liability',
        expiry_date: daysFromNow(45),
        policy_number: 'PL-001',
        insurer_name: 'CGU Insurance',
        extraction_confidence: 0.9,
        subcontractor_id: 100,
        first_name: 'Bob',
        last_name: 'Builder',
        email: 'bob@builder.com',
        phone: '0400000000',
        business_name: 'Bob Builder Pty Ltd',
        ...overrides
    };
}

describe('check-expiring-insurance handler', () => {
    let handler;

    beforeAll(async () => {
        const mod = await import('../api/cron/check-expiring-insurance.js');
        handler = mod.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.CRON_SECRET = 'test-cron-secret';
        process.env.RESEND_API_KEY = 'test-key';
        process.env.POSTGRES_URL = 'postgres://test';
    });

    afterEach(() => {
        delete process.env.CRON_SECRET;
        delete process.env.RESEND_API_KEY;
        delete process.env.POSTGRES_URL;
    });

    // ── Authorization ─────────────────────────────────────
    test('returns 401 with invalid Bearer token', async () => {
        const req = makeReq({ authorization: 'Bearer wrong-secret' });
        const res = makeRes();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0].error).toBe('Unauthorized');
    });

    test('returns 401 with missing authorization header', async () => {
        const req = { method: 'GET', headers: {} };
        const res = makeRes();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('returns 401 when CRON_SECRET is not set (header cannot match)', async () => {
        delete process.env.CRON_SECRET;
        const req = makeReq({ authorization: 'Bearer anything' });
        const res = makeRes();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });

    // ── No database configured ────────────────────────────
    test('returns 200 with no-op message when POSTGRES_URL is not set', async () => {
        delete process.env.POSTGRES_URL;
        const res = makeRes();
        await handler(makeReq(), res);
        expect(mockSql).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].message).toMatch(/not configured/i);
    });

    // ── No expiring insurance ─────────────────────────────
    test('returns count:0 when no expiring insurance found', async () => {
        mockSql.mockResolvedValueOnce({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        expect(mockEmailSend).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0].count).toBe(0);
    });

    // ── Urgency levels ────────────────────────────────────
    test('assigns red urgency for insurance expiring in less than 30 days', async () => {
        mockSql
            .mockResolvedValueOnce({ rows: [makeInsuranceRecord({ expiry_date: daysFromNow(15) })] })
            .mockResolvedValue({ rows: [] }); // for reminded_at updates
        const res = makeRes();
        await handler(makeReq(), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        // Red is urgencyColor #dc2626
        expect(html).toContain('#dc2626');
    });

    test('assigns orange urgency for insurance expiring in 30-60 days', async () => {
        mockSql
            .mockResolvedValueOnce({ rows: [makeInsuranceRecord({ expiry_date: daysFromNow(45) })] })
            .mockResolvedValue({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        // Orange is #ea580c
        expect(html).toContain('#ea580c');
    });

    test('assigns yellow urgency for insurance expiring in 60-90 days', async () => {
        mockSql
            .mockResolvedValueOnce({ rows: [makeInsuranceRecord({ expiry_date: daysFromNow(75) })] })
            .mockResolvedValue({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        // Yellow/warning is #f59e0b
        expect(html).toContain('#f59e0b');
    });

    // ── Grouping by subcontractor ─────────────────────────
    test('sends one email per subcontractor even with multiple expiring docs', async () => {
        mockSql
            .mockResolvedValueOnce({
                rows: [
                    makeInsuranceRecord({ insurance_id: 1, document_type: 'public_liability', expiry_date: daysFromNow(20) }),
                    makeInsuranceRecord({ insurance_id: 2, document_type: 'workers_comp', expiry_date: daysFromNow(50) })
                ]
            })
            .mockResolvedValue({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        // Both docs belong to subcontractor_id 100 → only 1 email
        expect(mockEmailSend).toHaveBeenCalledTimes(1);
        expect(res.json.mock.calls[0][0].emailsSent).toBe(1);
    });

    test('sends separate emails for different subcontractors', async () => {
        mockSql
            .mockResolvedValueOnce({
                rows: [
                    makeInsuranceRecord({ insurance_id: 1, subcontractor_id: 100, business_name: 'Sub A' }),
                    makeInsuranceRecord({ insurance_id: 2, subcontractor_id: 200, business_name: 'Sub B', email: 'sub_b@example.com' })
                ]
            })
            .mockResolvedValue({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(2);
        expect(res.json.mock.calls[0][0].emailsSent).toBe(2);
    });

    // ── reminded_at update ────────────────────────────────
    test('updates reminded_at in database after successful email send', async () => {
        mockSql
            .mockResolvedValueOnce({ rows: [makeInsuranceRecord({ insurance_id: 99 })] })
            .mockResolvedValue({ rows: [] }); // UPDATE calls
        const res = makeRes();
        await handler(makeReq(), res);
        // First call is SELECT, subsequent calls include UPDATE for each insurance ID
        const updateCalls = mockSql.mock.calls.slice(1);
        expect(updateCalls.length).toBeGreaterThan(0);
    });

    // ── Escalation across the 90/60/30 bands ──────────────
    test('re-sends once the document crosses into a tighter urgency band', async () => {
        mockSql.mockResolvedValueOnce({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);

        // The tagged-template strings are the query's static fragments.
        const selectSql = mockSql.mock.calls[0][0].join('?');

        // A previously-reminded row must still be selectable — filtering on
        // `reminded_at IS NULL` alone chased each document exactly once, at
        // the 90-day mark, and never again.
        expect(selectSql).toMatch(/reminded_at IS NULL\s*\n\s*OR/);
        // Both sides of the band comparison must be present: the band today,
        // and the band the document was in when it was last reminded.
        expect(selectSql).toContain('i.reminded_at::date');
        expect(selectSql.match(/<= 30 THEN 30/g)).toHaveLength(2);
        expect(selectSql.match(/<= 60 THEN 60/g)).toHaveLength(2);
    });

    // ── Continues on email failure ────────────────────────
    test('continues processing other subcontractors when one email fails', async () => {
        mockSql
            .mockResolvedValueOnce({
                rows: [
                    makeInsuranceRecord({ insurance_id: 1, subcontractor_id: 100, business_name: 'Sub A' }),
                    makeInsuranceRecord({ insurance_id: 2, subcontractor_id: 200, business_name: 'Sub B', email: 'sub_b@example.com' })
                ]
            })
            .mockResolvedValue({ rows: [] });
        // First email fails, second succeeds
        mockEmailSend
            .mockResolvedValueOnce({ data: null, error: { message: 'Bounce' } })
            .mockResolvedValueOnce({ data: { id: 'ok' }, error: null });
        const res = makeRes();
        await handler(makeReq(), res);
        expect(mockEmailSend).toHaveBeenCalledTimes(2);
        // 1 succeeded
        expect(res.json.mock.calls[0][0].emailsSent).toBe(1);
    });

    // ── No API key for emails ─────────────────────────────
    test('skips email send when RESEND_API_KEY is not set', async () => {
        delete process.env.RESEND_API_KEY;
        mockSql.mockResolvedValueOnce({ rows: [makeInsuranceRecord()] });
        const res = makeRes();
        await handler(makeReq(), res);
        expect(mockEmailSend).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].emailsSent).toBe(0);
    });

    // ── Database error ────────────────────────────────────
    test('returns 500 when database query throws', async () => {
        mockSql.mockRejectedValueOnce(new Error('Connection refused'));
        const res = makeRes();
        await handler(makeReq(), res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    // ── Response details ──────────────────────────────────
    test('response includes details of which subcontractors were emailed', async () => {
        mockSql
            .mockResolvedValueOnce({ rows: [makeInsuranceRecord({ insurance_id: 1 })] })
            .mockResolvedValue({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.details).toHaveLength(1);
        expect(body.details[0].subcontractor).toBe('Bob Builder Pty Ltd');
        expect(body.details[0].documentsCount).toBe(1);
    });

    // ── Document type label formatting ───────────────────
    test('formats document_type with underscores as title case in email', async () => {
        mockSql
            .mockResolvedValueOnce({ rows: [makeInsuranceRecord({ document_type: 'workers_comp' })] })
            .mockResolvedValue({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).toContain('Workers Comp');
    });

    // ── Brisbane-local date window ────────────────────────
    test('builds the expiry query window from Brisbane local dates', async () => {
        mockSql.mockResolvedValueOnce({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        const selectValues = mockSql.mock.calls[0].slice(1);
        const brisbaneToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });
        expect(selectValues).toContain(brisbaneToday);
        expect(selectValues.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v))).toBe(true);
    });

    // ── AI confidence display ─────────────────────────────
    test('displays AI confidence percentage in email', async () => {
        mockSql
            .mockResolvedValueOnce({ rows: [makeInsuranceRecord({ extraction_confidence: 0.85 })] })
            .mockResolvedValue({ rows: [] });
        const res = makeRes();
        await handler(makeReq(), res);
        const html = mockEmailSend.mock.calls[0][0].html;
        expect(html).toContain('85%');
    });
});
