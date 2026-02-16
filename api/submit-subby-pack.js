import { Resend } from 'resend';
import { sql } from '@vercel/postgres';
import { extractInsuranceData } from '../lib/extract-insurance-data.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Sanitize user input to prevent XSS in HTML emails
function sanitize(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { firstName, lastName, email, phone, businessName, abn, businessAddress, bsb, accountNumber, accountName, files } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !phone || !businessName || !bsb || !accountNumber || !accountName) {
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

        for (const { key, type, label } of fileTypes) {
            if (files[key]) {
                const file = files[key];
                console.log(`Processing ${label} insurance document...`);

                const extraction = await extractInsuranceData(
                    file.data,
                    file.type,
                    type
                );

                insuranceData[key] = {
                    filename: file.name,
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
                        ${safeData.businessAddress}, ${safeData.bsb}, 
                        ${safeData.accountNumber}, ${safeData.accountName}
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

                // Insert insurance documents
                for (const { key, type } of fileTypes) {
                    if (insuranceData[key]?.extraction) {
                        const ext = insuranceData[key].extraction;
                        await sql`
                            INSERT INTO insurance_documents (
                                subcontractor_id, document_type, expiry_date, 
                                policy_number, insurer_name, extraction_confidence, extraction_error
                            )
                            VALUES (
                                ${subcontractorId}, ${type}, ${ext.expiry_date},
                                ${ext.policy_number}, ${ext.insurer_name}, 
                                ${ext.confidence}, ${insuranceData[key].error}
                            )
                        `;
                    }
                }

                console.log(`Stored subcontractor data in database (ID: ${subcontractorId})`);
            } catch (dbError) {
                console.error('Database error:', dbError);
                // Continue even if database fails - still send email
            }
        }

        // Prepare email with attachments
        const attachments = [];
        for (const { key, label } of fileTypes) {
            if (files[key]) {
                // Extract base64 content
                const base64Content = files[key].data.split(',')[1] || files[key].data;
                attachments.push({
                    filename: files[key].name,
                    content: base64Content,
                    content_type: files[key].type
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
                    const expiryDisplay = ext.expiry_date || 'Not detected';
                    const policyDisplay = ext.policy_number || 'Not detected';
                    const insurerDisplay = ext.insurer_name || 'Not detected';
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
            to: process.env.BUSINESS_EMAIL || 'delivered@resend.dev',
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
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.bsb}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Account Number</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.accountNumber}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Account Name</td>
                        <td style="padding:8px; border:1px solid #ddd;">${safeData.accountName}</td>
                    </tr>
                </table>

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
            return res.status(400).json({ success: false, error });
        }

        return res.status(200).json({ success: true, data, subcontractorId });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
    }
}
