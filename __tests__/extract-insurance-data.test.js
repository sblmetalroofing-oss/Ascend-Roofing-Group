import { jest } from '@jest/globals';

// ─── Mock openai before importing module ──────────────────
const mockCreate = jest.fn();
jest.unstable_mockModule('openai', () => ({
    default: jest.fn(() => ({
        chat: {
            completions: {
                create: mockCreate
            }
        }
    }))
}));

function makeOpenAIResponse(content) {
    return {
        choices: [{
            message: { content }
        }]
    };
}

function jsonResponse(obj) {
    return makeOpenAIResponse(JSON.stringify(obj));
}

describe('extractInsuranceData', () => {
    let extractInsuranceData;

    beforeAll(async () => {
        const mod = await import('../lib/extract-insurance-data.js');
        extractInsuranceData = mod.extractInsuranceData;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
    });

    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
    });

    // ── Missing API key ───────────────────────────────────
    test('returns success:false when OPENAI_API_KEY is not set', async () => {
        delete process.env.OPENAI_API_KEY;
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not configured/i);
        expect(result.data).toBeNull();
    });

    // ── Bug fix verification: model name ─────────────────
    test('calls OpenAI with gpt-4o model (not deprecated gpt-4-vision-preview)', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '2026-06-30',
            policy_number: 'PL-001',
            insurer_name: 'AAMI',
            confidence: 0.9
        }));
        await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'gpt-4o' })
        );
        expect(mockCreate).not.toHaveBeenCalledWith(
            expect.objectContaining({ model: 'gpt-4-vision-preview' })
        );
    });

    // ── Bug fix verification: data URL format ─────────────
    test('wraps base64 data in proper data URL for OpenAI image_url', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Public Liability',
            expiry_date: '2026-06-30',
            policy_number: null,
            insurer_name: null,
            confidence: 0.8
        }));
        await extractInsuranceData('AAABBBCCC===', 'image/jpeg', 'public_liability');
        const callArgs = mockCreate.mock.calls[0][0];
        const imageContent = callArgs.messages[0].content.find(c => c.type === 'image_url');
        expect(imageContent.image_url.url).toBe('data:image/jpeg;base64,AAABBBCCC===');
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
        mockCreate.mockResolvedValueOnce(makeOpenAIResponse(rawContent));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(true);
        expect(result.data.expiry_date).toBe('2026-06-30');
    });

    // ── Non-JSON response from OpenAI ─────────────────────
    test('returns success:false when OpenAI returns non-JSON', async () => {
        mockCreate.mockResolvedValueOnce(makeOpenAIResponse('Sorry, I cannot read this document.'));
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/invalid json/i);
    });

    // ── No response content from OpenAI ───────────────────
    test('returns success:false when OpenAI returns no content', async () => {
        mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: null } }] });
        const result = await extractInsuranceData('base64data', 'image/png', 'public_liability');
        expect(result.success).toBe(false);
    });

    // ── OpenAI API throws ─────────────────────────────────
    test('returns success:false when OpenAI API throws', async () => {
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

    // ── File type passed correctly in data URL ────────────
    test('uses correct MIME type in data URL for PDF', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse({
            document_type: 'Workers Comp',
            expiry_date: '2026-06-30',
            policy_number: null,
            insurer_name: null,
            confidence: 0.75
        }));
        await extractInsuranceData('PDFBASE64DATA', 'application/pdf', 'workers_comp');
        const callArgs = mockCreate.mock.calls[0][0];
        const imageContent = callArgs.messages[0].content.find(c => c.type === 'image_url');
        expect(imageContent.image_url.url).toBe('data:application/pdf;base64,PDFBASE64DATA');
    });
});
