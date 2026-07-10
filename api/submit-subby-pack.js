import { Resend } from 'resend';
import { sql } from '@vercel/postgres';
import { extractInsuranceData } from '../lib/extract-insurance-data.js';
import { verifyOrigin } from '../lib/verify-origin.js';
import { sanitize, validateUpload } from '../lib/sanitize.js';
import { rateLimit } from '../lib/rate-limit.js';
import { encryptField, maskTail } from '../lib/crypto.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!verifyOrigin(req)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Tight limit: each submission triggers up to 3 Claude vision calls.
    const rl = await rateLimit(req, { name: 'submit-subby-pack', limit: 3, windowMs: 60 * 60 * 1000 });
    if (rl.limited) {
        res.setHeader('Retry-After', String(rl.retryAfter));
        return res.status(429).json({ success: false, message: 'Too many submissions. Please try again later.' });
    }

    try {
        const { firstName, lastName, email, phone, businessName, abn, businessAddress, bsb, accountNumber, accountName, files } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !phone || !businessName || !abn || !bsb || !accountNumber || !accountName) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Validate required files
        if (!files?.publicLiability || !files?.workersComp) {
            return res.status(400).json({ success: false, message: 'Public Liability and Workers Comp insurance are required' });
        }

        // Sanitize inputs
        const safeData = {
            firstName: sanitize(firstName),
            lastName: sanitize(lastName),
            email: sanitize(email),
            phone: sanitize(phone),
            businessName: sanitize(businessName),
            abn: sanitize(abn) || null,
            businessAddress: sanitize(businessAddress) || null,
            bsb: sanitize(bsb),
            accountNumber: sanitize(accountNumber),
            accountName: sanitize(accountName)
        };

        // Process insurance documents with AI
        const insuranceData = {};
        const fileTypes = [
            { key: 'publicLiability', type: 'public_liability', label: 'Public Liability' },
            { key: 'workersComp', type: 'workers_comp', label: 'Workers Compensation' },
            { key: 'otherCerts', type: 'other', label: 'Other Certificates' }
        ];

        // Server-side upload validation before any paid AI call: type
        // allow-list, size cap, and regenerated safe filenames.
        const validatedFiles = {};
        for (const { key, label } of fileTypes) {
            if (!files[key]) continue;
            const check = validateUpload(files[key], { label });
            if (!check.ok) {
                return res.status(400).json({ success: false, message: check.error });
            }
            validatedFiles[key] = check;
        }

        for (const { key, type, label } of fileTypes) {
            if (validatedFiles[key]) {
                console.log(`Processing ${label} insurance document...`);

                const extraction = await extractInsuranceData(
                    validatedFiles[key].content,
                    validatedFiles[key].contentType,
                    type
                );

                insuranceData[key] = {
                    filename: validatedFiles[key].filename,
                    extraction: extraction.success ? extraction.data : null,
                    error: extraction.error || null
                };
            }
        }

        // Store in database if configured
        let subcontractorId = null;
        if (process.env.POSTGRES_URL) {
            try {
                // Insert or update subcontractor
                const subResult = await sql`
                    INSERT INTO subcontractors (
                        first_name, last_name, email, phone, business_name, 
                        abn, business_address, bsb, account_number, account_name
                    )
                    VALUES (
                        ${safeData.firstName}, ${safeData.lastName}, ${safeData.email},
                        ${safeData.phone}, ${safeData.businessName}, ${safeData.abn},
                        ${safeData.businessAddress}, ${encryptField(safeData.bsb)},
                        ${encryptField(safeData.accountNumber)}, ${safeData.accountName}
                    )
                    ON CONFLICT (email) 
                    DO UPDATE SET
                        first_name = EXCLUDED.first_name,
                        last_name = EXCLUDED.last_name,
                        phone = EXCLUDED.phone,
                        business_name = EXCLUDED.business_name,
                        abn = EXCLUDED.abn,
                        business_address = EXCLUDED.business_address,
                        bsb = EXCLUDED.bsb,
                        account_number = EXCLUDED.account_number,
                        account_name = EXCLUDED.account_name,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id
                `;

                subcontractorId = subResult.rows[0].id;

                // Insert insurance documents. Replace any existing rows for this
                // subcontractor + document type so re-submissions don't accumulate
                // duplicates. A row is recorded even when extraction failed so the
                // error is tracked. AI-extracted text is sanitized before storage
                // (matches the subcontractor fields) so it's safe wherever it's
                // later rendered into email HTML.
                for (const { key, type } of fileTypes) {
                    if (!insuranceData[key]) continue; // no file uploaded for this slot
                    const ext = insuranceData[key].extraction;
                    await sql`
                        DELETE FROM insurance_documents
                        WHERE subcontractor_id = ${subcontractorId} AND document_type = ${type}
                    `;
                    await sql`
                        INSERT INTO insurance_documents (
                            subcontractor_id, document_type, expiry_date,
                            policy_number, insurer_name, extraction_confidence, extraction_error
                        )
                        VALUES (
                            ${subcontractorId}, ${type}, ${ext ? ext.expiry_date : null},
                            ${ext && ext.policy_number ? sanitize(ext.policy_number) : null},
                            ${ext && ext.insurer_name ? sanitize(ext.insurer_name) : null},
                            ${ext ? ext.confidence : null}, ${insuranceData[key].error}
                        )
                    `;
                }

                console.log(`Stored subcontractor data in database (ID: ${subcontractorId})`);
            } catch (dbError) {
                console.error('Database error — subcontractor data NOT saved to DB:', dbError);
                // Flag so the response can surface this to the caller
                res.locals = res.locals || {};
                res.locals.dbFailed = true;
            }
        }

        // Prepare email with attachments (validated content + safe filenames)
        const attachments = [];
        for (const { key } of fileTypes) {
            if (validatedFiles[key]) {
                attachments.push({
                    filename: validatedFiles[key].filename,
                    content: validatedFiles[key].content,
                    content_type: validatedFiles[key].contentType
                });
            }
        }

        // Build email HTML with AI-extracted data
        let insuranceTableRows = '';
        let expiryWarnings = '';

        for (const { key, label } of fileTypes) {
            if (insuranceData[key]) {
                const ext = insuranceData[key].extraction;
                if (ext) {
                    const expiryDisplay = sanitize(ext.expiry_date) || 'Not detected';
                    const policyDisplay = sanitize(ext.policy_number) || 'Not detected';
                    const insurerDisplay = sanitize(ext.insurer_name) || 'Not detected';
                    const confidenceDisplay = ext.confidence ? `${(ext.confidence * 100).toFixed(0)}%` : 'N/A';

                    insuranceTableRows += `
                        <tr>
                            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">${label}</td>
                            <td style="padding:8px; border:1px solid #ddd;">${expiryDisplay}</td>
                            <td style="padding:8px; border:1px solid #ddd;">${policyDisplay}</td>
                            <td style="padding:8px; border:1px solid #ddd;">${insurerDisplay}</td>
                            <td style="padding:8px; border:1px solid #ddd;">${confidenceDisplay}</td>
                        </tr>
                    `;

                    // Check for expiring insurance
                    if (ext.expiry_date) {
                        const expiryDate = new Date(ext.expiry_date);
                        const today = new Date();
                        const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

                        if (daysUntilExpiry <= 60 && daysUntilExpiry >= 0) {
                            expiryWarnings += `
                                <div style="padding:12px; background:#fef2f2; border-left:4px solid #dc2626; margin:16px 0;">
                                    <strong style="color:#dc2626;">⚠️ ${label} expires in ${daysUntilExpiry} days (${ext.expiry_date})</strong>
                                </div>
                            `;
                        } else if (daysUntilExpiry < 0) {
                            expiryWarnings += `
                                <div style="padding:12px; background:#fee; border-left:4px solid #c00; margin:16px 0;">
                                    <strong style="color:#c00;">🚨 ${label} EXPIRED ${Math.abs(daysUntilExpiry)} days ago (${ext.expiry_date})</strong>
                                </div>
                            `;
                        }
                    }
                }
            }
        }

        // Send email
        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not set. Logging data instead.');
            console.log('Subcontractor Pack:', { ...safeData, insuranceData });
            return res.status(200).json({ success: true, message: 'Submission received (Simulation)' });
        }

        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Ascend Website <onboarding@resend.dev>',
            to: process.env.BUSINESS_EMAIL || 'admin@ascendroofinggroup.com.au',
            subject: `Subcontractor Pack: ${safeData.businessName} — ${safeData.firstName} ${safeData.lastName}`,
            attachments: attachments,
            html: `
                <h2>Subcontractor Pack Submission</h2>
                
                ${expiryWarnings}

                <h3>Personal Details</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Name</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.firstName} ${safeData.lastName}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Email</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.email}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Phone</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.phone}</td>
                    </tr>
                </table>

                <h3>Business Information</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Business Name</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.businessName}</td>
                    </tr>
                    ${safeData.abn ? `
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">ABN</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.abn}</td>
                    </tr>
                    ` : ''}
                    ${safeData.businessAddress ? `
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Address</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.businessAddress}</td>
                    </tr>
                    ` : ''}
                </table>

                <h3>Banking Details</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">BSB</td>
                        <td style="padding:8px; border:1px solid #ddd;">${maskTail(safeData.bsb)}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Account Number</td>
                        <td style="padding:8px; border:1px solid #ddd;">${maskTail(safeData.accountNumber)}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Account Name</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.accountName}</td>
                    </tr>
                </table>
                <p style="color:#666; font-size:12px;">
                    <em>Bank numbers are masked — the full details are stored securely in the database
                    ${subcontractorId ? `(subcontractor record ID ${subcontractorId})` : '(⚠ database was unavailable for this submission — contact the subcontractor to re-collect payment details)'}.</em>
                </p>

                <h3>🤖 AI-Extracted Insurance Information</h3>
                <table style="border-collapse:collapse; width:100%; max-width:700px; margin-bottom:24px;">
                    <tr style="background:#f5f5f5;">
                        <th style="padding:8px; border:1px solid #ddd; text-align:left;">Document Type</th>
                        <th style="padding:8px; border:1px solid #ddd; text-align:left;">Expiry Date</th>
                        <th style="padding:8px; border:1px solid #ddd; text-align:left;">Policy Number</th>
                        <th style="padding:8px; border:1px solid #ddd; text-align:left;">Insurer</th>
                        <th style="padding:8px; border:1px solid #ddd; text-align:left;">Confidence</th>
                    </tr>
                    ${insuranceTableRows}
                </table>

                <p style="color:#666; font-size:12px; margin-top:24px;">
                    <em>Insurance documents are attached to this email. AI extraction confidence indicates reliability of extracted data.</em>
                </p>
            `
        });

        if (error) {
            console.error('Resend error:', error);
            return res.status(400).json({ success: false, message: 'Failed to send submission email. Please try again or call us.' });
        }

        const dbFailed = res.locals?.dbFailed === true;
        return res.status(200).json({
            success: true,
            data,
            subcontractorId,
            ...(dbFailed && { warning: 'Submission received but could not be saved to database. Our team has been notified via email.' }),
        });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}
