import { jest } from '@jest/globals';

// ─── Mock @anthropic-ai/sdk before importing module ──────────
const mockCreate = jest.fn();
jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
    default: jest.fn(() => ({
        messages: {
            create: mockCreate
        }
    }))
}));

function makeClaudeResponse(content) {
    return {
        content: [{
            text: content
        }]
    };
}

function jsonResponse(obj) {
    return makeClaudeResponse(JSON.stringify(obj));
}

describe('extractInsuranceData', () => {
    let extractInsuranceData;

    beforeAll(async () => {
        const mod = await import('../lib/extract-insurance-data.js');
        extractInsuranceData = mod.extractInsuranceData;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    afterEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
    });

    // ── Missing API key ───────────────────────────────────
    test('returns success:false when ANTHROPIC_API_KEY is not set', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not configured/i);
        expect(result.data).toBeNull();
    });

    // ── Bug fix verification: model name ─────────────────
    test('calls Claude with claude-sonnet-4-20250514 model', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '2026-06-30',
            policy_number: 'PL-001',
            insurer_name: 'AAMI',
            confidence: 0.9
        }));
        await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'claude-sonnet-4-20250514' })
        );
    });

    // ── Bug fix verification: image format ─────────────
    test('sends base64 image data in Claude format', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '2026-06-30',
            policy_number: null,
            insurer_name: null,
            confidence: 0.8
        }));
        await extractInsuranceData('AAABBBCCC===', 'image/jpeg', 'public_liability');
        const callArgs = mockCreate.mock.calls[0][0];
        const imageContent = callArgs.messages[0].content.find(c => c.type === 'image');
        expect(imageContent.source).toEqual({
            type: 'base64',
            media_type: 'image/jpeg',
            data: 'AAABBBCCC==='
        });
    });

    // ── Happy path ────────────────────────────────────────
    test('returns extracted data on success', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '2026-12-31',
            policy_number: 'PL-12345',
            insurer_name: 'CGU Insurance',
            confidence: 0.95
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(true);
        expect(result.data.expiry_date).toBe('2026-12-31');
        expect(result.data.policy_number).toBe('PL-12345');
        expect(result.data.insurer_name).toBe('CGU Insurance');
        expect(result.data.confidence).toBe(0.95);
    });

    // ── Date parsing: YYYY-MM-DD (already standard) ───────
    test('parses YYYY-MM-DD date format', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Workers Comp',
            expiry_date: '2027-03-15',
            policy_number: null,
            insurer_name: null,
            confidence: 0.8
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'workers_comp');
        expect(result.data.expiry_date).toBe('2027-03-15');
    });

    // ── Date parsing: DD/MM/YYYY (Australian format) ──────
    test('parses DD/MM/YYYY Australian date format', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '31/12/2026',
            policy_number: null,
            insurer_name: null,
            confidence: 0.85
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.data.expiry_date).toBe('2026-12-31');
    });

    // ── Date parsing: DD-MM-YYYY ──────────────────────────
    test('parses DD-MM-YYYY date format', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '15-06-2027',
            policy_number: null,
            insurer_name: null,
            confidence: 0.85
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.data.expiry_date).toBe('2027-06-15');
    });

    // ── Date parsing: natural language fallback ───────────
    test('parses natural language date via JS Date fallback', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: 'June 30, 2026',
            policy_number: null,
            insurer_name: null,
            confidence: 0.7
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.data.expiry_date).toBe('2026-06-30');
    });

    // ── Date parsing: null expiry ─────────────────────────
    test('handles null expiry_date without crashing', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: null,
            policy_number: 'PL-001',
            insurer_name: 'NRMA',
            confidence: 0.6
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(true);
        expect(result.data.expiry_date).toBeNull();
    });

    // ── Date parsing: invalid date ────────────────────────
    test('returns null for unparseable date string', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: 'not-a-date',
            policy_number: null,
            insurer_name: null,
            confidence: 0.3
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.data.expiry_date).toBeNull();
    });

    // ── Date parsing: leap year ───────────────────────────
    test('correctly handles leap year date 29/02/2028', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '29/02/2028',
            policy_number: null,
            insurer_name: null,
            confidence: 0.9
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.data.expiry_date).toBe('2028-02-29');
    });

    // ── Markdown-wrapped JSON response ────────────────────
    test('strips markdown code fences from JSON response', async () => {
        const rawContent = '```json\n{"document_type":"PL","expiry_date":"2026-06-30","policy_number":"P-001","insurer_name":"AAMI","confidence":0.9}\n```';
        mockCreate.mockResolvedValueOnce(makeClaudeResponse(rawContent));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(true);
        expect(result.data.expiry_date).toBe('2026-06-30');
    });

    // ── Non-JSON response from Claude ─────────────────────
    test('returns success:false when Claude returns non-JSON', async () => {
        mockCreate.mockResolvedValueOnce(makeClaudeResponse('Sorry, I cannot read this document.'));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/invalid json/i);
    });

    // ── No response content from Claude ───────────────────
    test('returns success:false when Claude returns no content', async () => {
        mockCreate.mockResolvedValueOnce({ content: [{ text: null }] });
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(false);
    });

    // ── Claude API throws ─────────────────────────────────
    test('returns success:false when Claude API throws', async () => {
        mockCreate.mockRejectedValueOnce(new Error('Network timeout'));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Network timeout');
    });

    // ── Missing optional fields default to null ───────────
    test('uses documentType parameter when document_type not returned', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: null,
            expiry_date: '2026-06-30',
            policy_number: null,
            insurer_name: null,
            confidence: 0.5
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'workers_comp');
        expect(result.data.document_type).toBe('workers_comp');
    });

    // ── Confidence defaults to 0.5 if not provided ────────
    test('defaults confidence to 0.5 when not in response', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'PL',
            expiry_date: '2026-06-30',
            policy_number: null,
            insurer_name: null
            // no confidence field
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.data.confidence).toBe(0.5);
    });

    // ── PDFs sent as a document block (not image) ─────────
    test('sends PDF as a document content block, not an image', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Workers Comp',
            expiry_date: '2026-06-30',
            policy_number: null,
            insurer_name: null,
            confidence: 0.75
        }));
        await extractInsuranceData('PDFBASE64DATA', 'application/pdf', 'workers_comp');
        const content = mockCreate.mock.calls[0][0].messages[0].content;
        const docContent = content.find(c => c.type === 'document');
        expect(docContent.source).toEqual({
            type: 'base64',
            media_type: 'application/pdf',
            data: 'PDFBASE64DATA'
        });
        expect(content.find(c => c.type === 'image')).toBeUndefined();
    });

    // ── Strips data: URL prefix before sending ────────────
    test('strips a data URL prefix so Claude receives raw base64', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '2026-06-30',
            policy_number: null,
            insurer_name: null,
            confidence: 0.8
        }));
        await extractInsuranceData('data:image/png;base64,AAABBBCCC', 'image/png', 'public_liability');
        const imageContent = mockCreate.mock.calls[0][0].messages[0].content.find(c => c.type === 'image');
        expect(imageContent.source.data).toBe('AAABBBCCC');
    });

    // ── Date parsing: rejects silent rollover ─────────────
    test.each([
        ['31/02/2025'],  // Feb 31 → would roll to March
        ['13/13/2025'],  // month 13 → would roll to next year
        ['2025-02-30'],  // ISO but not a real calendar date
    ])('returns null for impossible date %s instead of rolling over', async (badDate) => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: badDate,
            policy_number: null,
            insurer_name: null,
            confidence: 0.5
        }));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.data.expiry_date).toBeNull();
    });
});
