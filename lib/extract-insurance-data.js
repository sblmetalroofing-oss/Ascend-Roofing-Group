import OpenAI from 'openai';

/**
 * Extract insurance information from a document using OpenAI Vision API
 * @param {string} base64Data - Base64 encoded image or PDF
 * @param {string} fileType - MIME type of the file
 * @param {string} documentType - Type of insurance document (public_liability, workers_comp, other)
 * @returns {Promise<Object>} Extracted insurance data
 */
export async function extractInsuranceData(base64Data, fileType, documentType) {
    if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY not set. Skipping AI extraction.');
        return {
            success: false,
            error: 'AI extraction not configured',
            data: null
        };
    }

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

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

        // Call OpenAI Vision API
        const response = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: prompt
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: base64Data
                            }
                        }
                    ]
                }
            ],
            max_tokens: 500,
            temperature: 0.1 // Low temperature for more consistent extraction
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response from OpenAI');
        }

        // Parse the JSON response
        let extractedData;
        try {
            // Remove any markdown code blocks if present
            const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            extractedData = JSON.parse(cleanContent);
        } catch (parseError) {
            console.error('Failed to parse OpenAI response:', content);
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
        // Already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return dateString;
        }

        // Australian format: DD/MM/YYYY or DD-MM-YYYY
        const auMatch = dateString.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
        if (auMatch) {
            const [, day, month, year] = auMatch;
            const date = new Date(year, month - 1, day);
            if (isValidDate(date)) {
                return formatDate(date);
            }
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
 * Format date to YYYY-MM-DD
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
