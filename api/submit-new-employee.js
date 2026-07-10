import { Resend } from 'resend';
import { sql } from '@vercel/postgres';
import { verifyOrigin } from '../lib/verify-origin.js';
import { sanitize, validateUpload } from '../lib/sanitize.js';
import { rateLimit } from '../lib/rate-limit.js';
import { encryptField, maskTail } from '../lib/crypto.js';

const resend = new Resend(process.env.RESEND_API_KEY);

function yesNo(bool) {
    return bool ? 'Yes' : 'No';
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!verifyOrigin(req)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const rl = await rateLimit(req, { name: 'submit-new-employee', limit: 5, windowMs: 60 * 60 * 1000 });
    if (rl.limited) {
        res.setHeader('Retry-After', String(rl.retryAfter));
        return res.status(429).json({ success: false, message: 'Too many submissions. Please try again later.' });
    }

    try {
        const {
            firstName, lastName, dateOfBirth, email, phone,
            streetAddress, suburb, state, postcode,
            emergencyName, emergencyRelationship, emergencyPhone,
            position, employmentType, startDate,
            tfn, taxFreeThreshold, australianResident, hasHelpDebt,
            superFundName, superMemberNumber, superUsi,
            bsb, accountNumber, accountName,
            declaration, files
        } = req.body;

        const required = {
            firstName, lastName, dateOfBirth, email, phone,
            streetAddress, suburb, state, postcode,
            emergencyName, emergencyRelationship, emergencyPhone,
            position, employmentType, startDate,
            tfn, bsb, accountNumber, accountName
        };
        for (const [key, value] of Object.entries(required)) {
            if (!value || String(value).trim() === '') {
                return res.status(400).json({ success: false, message: `Missing required field: ${key}` });
            }
        }

        if (!declaration) {
            return res.status(400).json({ success: false, message: 'You must accept the declaration to submit.' });
        }

        if (!files?.photoId || !files?.whiteCard) {
            return res.status(400).json({ success: false, message: 'Photo ID and White Card are required.' });
        }

        // TFN: 8-9 digits after stripping spaces. Don't echo the TFN in error messages.
        const tfnDigits = String(tfn).replace(/\s+/g, '');
        if (!/^\d{8,9}$/.test(tfnDigits)) {
            return res.status(400).json({ success: false, message: 'TFN must be 8 or 9 digits.' });
        }

        const safe = {
            firstName: sanitize(firstName),
            lastName: sanitize(lastName),
            dateOfBirth: sanitize(dateOfBirth),
            email: sanitize(email),
            phone: sanitize(phone),
            streetAddress: sanitize(streetAddress),
            suburb: sanitize(suburb),
            state: sanitize(state),
            postcode: sanitize(postcode),
            emergencyName: sanitize(emergencyName),
            emergencyRelationship: sanitize(emergencyRelationship),
            emergencyPhone: sanitize(emergencyPhone),
            position: sanitize(position),
            employmentType: sanitize(employmentType),
            startDate: sanitize(startDate),
            tfn: tfnDigits,
            taxFreeThreshold: Boolean(taxFreeThreshold),
            australianResident: Boolean(australianResident),
            hasHelpDebt: Boolean(hasHelpDebt),
            superFundName: sanitize(superFundName) || null,
            superMemberNumber: sanitize(superMemberNumber) || null,
            superUsi: sanitize(superUsi) || null,
            bsb: sanitize(bsb),
            accountNumber: sanitize(accountNumber),
            accountName: sanitize(accountName)
        };

        const fileTypes = [
            { key: 'photoId', type: 'photo_id', label: 'Photo ID' },
            { key: 'whiteCard', type: 'white_card', label: 'White Card' },
            { key: 'otherCerts', type: 'other', label: 'Other Certifications' }
        ];

        // Server-side upload validation (type allow-list, size cap, safe
        // filenames) — the client-side checks are not trustworthy.
        const validatedFiles = {};
        for (const { key, label } of fileTypes) {
            if (!files[key]) continue;
            const check = validateUpload(files[key], { label });
            if (!check.ok) {
                return res.status(400).json({ success: false, message: check.error });
            }
            validatedFiles[key] = check;
        }

        let employeeId = null;
        if (process.env.POSTGRES_URL) {
            try {
                const result = await sql`
                    INSERT INTO employees (
                        first_name, last_name, date_of_birth, email, phone,
                        street_address, suburb, state, postcode,
                        emergency_name, emergency_relationship, emergency_phone,
                        position, employment_type, start_date,
                        tfn, tax_free_threshold, australian_resident, has_help_debt,
                        super_fund_name, super_member_number, super_usi,
                        bsb, account_number, account_name
                    )
                    VALUES (
                        ${safe.firstName}, ${safe.lastName}, ${safe.dateOfBirth}, ${safe.email}, ${safe.phone},
                        ${safe.streetAddress}, ${safe.suburb}, ${safe.state}, ${safe.postcode},
                        ${safe.emergencyName}, ${safe.emergencyRelationship}, ${safe.emergencyPhone},
                        ${safe.position}, ${safe.employmentType}, ${safe.startDate},
                        ${encryptField(safe.tfn)}, ${safe.taxFreeThreshold}, ${safe.australianResident}, ${safe.hasHelpDebt},
                        ${safe.superFundName}, ${safe.superMemberNumber}, ${safe.superUsi},
                        ${encryptField(safe.bsb)}, ${encryptField(safe.accountNumber)}, ${safe.accountName}
                    )
                    ON CONFLICT (email)
                    DO UPDATE SET
                        first_name = EXCLUDED.first_name,
                        last_name = EXCLUDED.last_name,
                        date_of_birth = EXCLUDED.date_of_birth,
                        phone = EXCLUDED.phone,
                        street_address = EXCLUDED.street_address,
                        suburb = EXCLUDED.suburb,
                        state = EXCLUDED.state,
                        postcode = EXCLUDED.postcode,
                        emergency_name = EXCLUDED.emergency_name,
                        emergency_relationship = EXCLUDED.emergency_relationship,
                        emergency_phone = EXCLUDED.emergency_phone,
                        position = EXCLUDED.position,
                        employment_type = EXCLUDED.employment_type,
                        start_date = EXCLUDED.start_date,
                        tfn = EXCLUDED.tfn,
                        tax_free_threshold = EXCLUDED.tax_free_threshold,
                        australian_resident = EXCLUDED.australian_resident,
                        has_help_debt = EXCLUDED.has_help_debt,
                        super_fund_name = EXCLUDED.super_fund_name,
                        super_member_number = EXCLUDED.super_member_number,
                        super_usi = EXCLUDED.super_usi,
                        bsb = EXCLUDED.bsb,
                        account_number = EXCLUDED.account_number,
                        account_name = EXCLUDED.account_name,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id
                `;
                employeeId = result.rows[0].id;

                for (const { key, type } of fileTypes) {
                    if (validatedFiles[key]) {
                        await sql`
                            INSERT INTO employee_documents (employee_id, document_type, filename)
                            VALUES (${employeeId}, ${type}, ${validatedFiles[key].filename})
                        `;
                    }
                }
                console.log(`Stored employee data in database (ID: ${employeeId})`);
            } catch (dbError) {
                console.error('Database error — employee data NOT saved to DB:', dbError);
                res.locals = res.locals || {};
                res.locals.dbFailed = true;
            }
        }

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

        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not set. Logging data instead.');
            console.log('New Employee:', { ...safe, tfn: '***redacted***' });
            return res.status(200).json({ success: true, message: 'Submission received (Simulation)' });
        }

        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Ascend Website <onboarding@resend.dev>',
            to: process.env.BUSINESS_EMAIL || 'admin@ascendroofinggroup.com.au',
            subject: `New Employee: ${safe.firstName} ${safe.lastName} — ${safe.position}`,
            attachments,
            html: `
                <h2>New Employee Onboarding Submission</h2>

                <h3>Personal Details</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Name</td><td style="padding:8px; border:1px solid #ddd;">${safe.firstName} ${safe.lastName}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Date of Birth</td><td style="padding:8px; border:1px solid #ddd;">${safe.dateOfBirth}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Email</td><td style="padding:8px; border:1px solid #ddd;">${safe.email}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Phone</td><td style="padding:8px; border:1px solid #ddd;">${safe.phone}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Address</td><td style="padding:8px; border:1px solid #ddd;">${safe.streetAddress}, ${safe.suburb} ${safe.state} ${safe.postcode}</td></tr>
                </table>

                <h3>Emergency Contact</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Name</td><td style="padding:8px; border:1px solid #ddd;">${safe.emergencyName}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Relationship</td><td style="padding:8px; border:1px solid #ddd;">${safe.emergencyRelationship}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Phone</td><td style="padding:8px; border:1px solid #ddd;">${safe.emergencyPhone}</td></tr>
                </table>

                <h3>Employment</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Position</td><td style="padding:8px; border:1px solid #ddd;">${safe.position}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Type</td><td style="padding:8px; border:1px solid #ddd;">${safe.employmentType}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Start Date</td><td style="padding:8px; border:1px solid #ddd;">${safe.startDate}</td></tr>
                </table>

                <h3>Tax Details</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">TFN</td><td style="padding:8px; border:1px solid #ddd;">${maskTail(safe.tfn)}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Claiming tax-free threshold</td><td style="padding:8px; border:1px solid #ddd;">${yesNo(safe.taxFreeThreshold)}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Australian resident for tax</td><td style="padding:8px; border:1px solid #ddd;">${yesNo(safe.australianResident)}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">HELP/VSL/SFSS debt</td><td style="padding:8px; border:1px solid #ddd;">${yesNo(safe.hasHelpDebt)}</td></tr>
                </table>

                <h3>Superannuation</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Fund Name</td><td style="padding:8px; border:1px solid #ddd;">${safe.superFundName || 'Not provided — assign default'}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Member Number</td><td style="padding:8px; border:1px solid #ddd;">${safe.superMemberNumber || '-'}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">USI</td><td style="padding:8px; border:1px solid #ddd;">${safe.superUsi || '-'}</td></tr>
                </table>

                <h3>Bank Account</h3>
                <table style="border-collapse:collapse; width:100%; max-width:600px; margin-bottom:24px;">
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">BSB</td><td style="padding:8px; border:1px solid #ddd;">${maskTail(safe.bsb)}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Account Number</td><td style="padding:8px; border:1px solid #ddd;">${maskTail(safe.accountNumber)}</td></tr>
                    <tr><td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Account Name</td><td style="padding:8px; border:1px solid #ddd;">${safe.accountName}</td></tr>
                </table>

                <p style="color:#666; font-size:12px; margin-top:24px;">
                    <em>Photo ID, White Card, and any additional certifications are attached to this email.
                    TFN and bank numbers are masked — the full details are stored securely in the database
                    ${employeeId ? `(employee record ID ${employeeId})` : '(⚠ database was unavailable for this submission — contact the employee to re-collect payment details)'}.</em>
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
            employeeId,
            ...(dbFailed && { warning: 'Submission received but could not be saved to database. Our team has been notified via email.' }),
        });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}
