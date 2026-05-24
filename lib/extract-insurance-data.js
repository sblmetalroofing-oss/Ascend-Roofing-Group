import Anthropic from '@anthropic-ai/sdk';

/**
 * Extract insurance information from a document using Claude Vision API
 * @param {string} base64Data - Base64 encoded image or PDF
 * @param {string} fileType - MIME type of the file
 * @param {string} documentType - Type of insurance document (public_liability, workers_comp, other)
 * @returns {Promise<Object>} Extracted insurance data
 */
export async function extractInsuranceData(base64Data, fileType, documentType) {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('ANTHROPIC_API_KEY not set. Skipping AI extraction.');
        return {
            success: false,
            error: 'AI extraction not configured',
            data: null
        };
    }

    const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Callers may pass a full data URL (data:<mime>;base64,XXXX). The Anthropic
    // API expects raw base64, so strip any prefix before sending.
    const cleanBase64 = String(base64Data || '').replace(/^data:[^;,]+;base64,/, '');

    // PDFs must be sent as a "document" content block; images as "image".
    const mediaBlock = fileType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: cleanBase64 } }
        : { type: 'image', source: { type: 'base64', media_type: fileType, data: cleanBase64 } };

    try {
        // Prepare the prompt
        const prompt = `You are analyzing an insurance certificate document. Extract the following information and return it as a JSON object:

{
  "document_type": "Type of insurance (e.g., Public Liability, Workers Compensation, Professional Indemnity)",
  "expiry_date": "Expiry/expiration date in YYYY-MM-DD format (if found)",
  "policy_number": "Policy or certificate number (if found)",
  "insurer_name": "Name of the insurance company/provider (if found)",
  "confidence": "Your confidence level in the extraction (0.0 to 1.0)"
}

Important:
- Return ONLY valid JSON, no additional text
- Use null for any field you cannot find
- For expiry_date, try variations: "Expiry Date", "Expiration Date", "Valid Until", "Period of Insurance To"
- Be careful with date formats (DD/MM/YYYY vs MM/DD/YYYY) - assume Australian format DD/MM/YYYY unless clearly stated otherwise
- Set confidence lower if uncertain about any field`;

        // Call Claude Vision API
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500,
            temperature: 0.1, // Low temperature for more consistent extraction
            messages: [
                {
                    role: "user",
                    content: [
                        mediaBlock,
                        {
                            type: "text",
                            text: prompt
                        }
                    ]
                }
            ]
        });

        const content = response.content[0]?.text;
        if (!content) {
            throw new Error('No response from Claude');
        }

        // Parse the JSON response
        let extractedData;
        try {
            // Remove any markdown code blocks if present
            const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            extractedData = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('Failed to parse Claude response:', content);
            throw new Error('Invalid JSON response from AI');
        }

        // Validate and clean the expiry date
        let parsedDate = null;
        if (extractedData.expiry_date) {
            parsedDate = parseDate(extractedData.expiry_date);
        }

        return {
            success: true,
            data: {
                document_type: extractedData.document_type || documentType,
                expiry_date: parsedDate,
                policy_number: extractedData.policy_number || null,
                insurer_name: extractedData.insurer_name || null,
                confidence: extractedData.confidence || 0.5
            },
            raw_response: content
        };

    } catch (error) {
        console.error('AI extraction error:', error);
        return {
            success: false,
            error: error.message,
            data: null
        };
    }
}

/**
 * Parse various date formats to YYYY-MM-DD
 * @param {string} dateString - Date string in various formats
 * @returns {string|null} Standardized date or null
 */
function parseDate(dateString) {
    if (!dateString) return null;

    try {
        // Already in YYYY-MM-DD format — still verify it's a real calendar date
        // (regex alone would accept e.g. 2025-02-30).
        const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            const [, year, month, day] = isoMatch;
            const date = new Date(Number(year), Number(month) - 1, Number(day));
            return matchesComponents(date, year, month, day) ? formatDate(date) : null;
        }

        // Australian format: DD/MM/YYYY or DD-MM-YYYY
        const auMatch = dateString.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
        if (auMatch) {
            const [, day, month, year] = auMatch;
            const date = new Date(Number(year), Number(month) - 1, Number(day));
            // Reject silent rollover (e.g. 31/02 → 03 Mar, month 13 → next year).
            return matchesComponents(date, year, month, day) ? formatDate(date) : null;
        }

        // Try standard JS Date parsing as fallback
        const date = new Date(dateString);
        if (isValidDate(date)) {
            return formatDate(date);
        }

        return null;
    } catch (error) {
        console.error('Date parsing error:', error);
        return null;
    }
}

/**
 * Check if a date is valid
 */
function isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Verify a constructed Date matches the parsed Y/M/D components, i.e. JS did not
 * silently roll an out-of-range value over into another month/year.
 */
function matchesComponents(date, year, month, day) {
    return (
        isValidDate(date) &&
        date.getFullYear() === Number(year) &&
        date.getMonth() === Number(month) - 1 &&
        date.getDate() === Number(day)
    );
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
