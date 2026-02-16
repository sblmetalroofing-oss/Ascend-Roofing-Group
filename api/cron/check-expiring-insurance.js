import { Resend } from 'resend';
import { sql } from '@vercel/postgres';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Vercel Cron Job - Check for expiring insurance and send reminders
 * Runs daily at 9:00 AM AEST
 */
export default async function handler(req, res) {
    // Verify this is a cron request (Vercel sets this header)
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!process.env.POSTGRES_URL) {
        console.log('Database not configured, skipping insurance check');
        return res.status(200).json({ message: 'Database not configured' });
    }

    try {
        const today = new Date();
        const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
        const sixtyDaysFromNow = new Date(today.getTime() + (60 * 24 * 60 * 60 * 1000));
        const ninetyDaysFromNow = new Date(today.getTime() + (90 * 24 * 60 * 60 * 1000));

        // Query for insurance expiring in the next 30, 60, or 90 days (whichever hasn't been reminded yet)
        const result = await sql`
            SELECT 
                i.id as insurance_id,
                i.document_type,
                i.expiry_date,
                i.policy_number,
                i.insurer_name,
                i.extraction_confidence,
                s.id as subcontractor_id,
                s.first_name,
                s.last_name,
                s.email,
                s.phone,
                s.business_name
            FROM insurance_documents i
            JOIN subcontractors s ON i.subcontractor_id = s.id
            WHERE i.expiry_date IS NOT NULL
              AND i.expiry_date <= ${ninetyDaysFromNow.toISOString().split('T')[0]}
              AND i.expiry_date >= ${today.toISOString().split('T')[0]}
              AND i.reminded_at IS NULL
            ORDER BY i.expiry_date ASC
        `;

        const expiringInsurance = result.rows;

        if (expiringInsurance.length === 0) {
            console.log('No expiring insurance found');
            return res.status(200).json({ message: 'No expiring insurance', count: 0 });
        }

        console.log(`Found ${expiringInsurance.length} expiring insurance documents`);

        // Group by subcontractor
        const bySubcontractor = {};
        for (const record of expiringInsurance) {
            if (!bySubcontractor[record.subcontractor_id]) {
                bySubcontractor[record.subcontractor_id] = {
                    subcontractor: {
                        id: record.subcontractor_id,
                        first_name: record.first_name,
                        last_name: record.last_name,
                        email: record.email,
                        phone: record.phone,
                        business_name: record.business_name
                    },
                    insurance: []
                };
            }

            bySubcontractor[record.subcontractor_id].insurance.push({
                id: record.insurance_id,
                document_type: record.document_type,
                expiry_date: record.expiry_date,
                policy_number: record.policy_number,
                insurer_name: record.insurer_name,
                confidence: record.extraction_confidence
            });
        }

        // Send email for each subcontractor with expiring insurance
        const emailsSent = [];

        for (const [subId, data] of Object.entries(bySubcontractor)) {
            const sub = data.subcontractor;
            const insuranceDocs = data.insurance;

            // Build insurance list HTML
            let insuranceListHtml = '';
            const insuranceIds = [];

            for (const doc of insuranceDocs) {
                const expiryDate = new Date(doc.expiry_date);
                const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

                let urgency = '🟡';
                let urgencyLevel = 'Warning';
                let urgencyColor = '#f59e0b';

                if (daysUntilExpiry <= 30) {
                    urgency = '🔴';
                    urgencyLevel = 'Urgent';
                    urgencyColor = '#dc2626';
                } else if (daysUntilExpiry <= 60) {
                    urgency = '🟠';
                    urgencyLevel = 'Soon';
                    urgencyColor = '#ea580c';
                }

                const docTypeLabel = doc.document_type
                    .replace('_', ' ')
                    .replace(/\b\w/g, l => l.toUpperCase());

                insuranceListHtml += `
                    <div style="padding:16px; background:#fff; border-left:4px solid ${urgencyColor}; margin:12px 0; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                        <div style="font-size:18px; font-weight:bold; color:${urgencyColor};">
                            ${urgency} ${docTypeLabel}
                        </div>
                        <div style="margin:8px 0; color:#333;">
                            <strong>Expiry Date:</strong> ${doc.expiry_date} 
                            <span style="color:${urgencyColor}; font-weight:bold;">(${daysUntilExpiry} days)</span>
                        </div>
                        ${doc.insurer_name ? `<div style="color:#666;"><strong>Insurer:</strong> ${doc.insurer_name}</div>` : ''}
                        ${doc.policy_number ? `<div style="color:#666;"><strong>Policy:</strong> ${doc.policy_number}</div>` : ''}
                        <div style="color:#999; font-size:12px; margin-top:8px;">
                            <em>AI Confidence: ${doc.confidence ? `${(doc.confidence * 100).toFixed(0)}%` : 'N/A'}</em>
                        </div>
                    </div>
                `;

                insuranceIds.push(doc.id);
            }

            // Send reminder email
            if (!process.env.RESEND_API_KEY) {
                console.warn('RESEND_API_KEY not set. Cannot send reminder email.');
                continue;
            }

            try {
                const { data: emailData, error: emailError } = await resend.emails.send({
                    from: process.env.FROM_EMAIL || 'Ascend Roofing <onboarding@resend.dev>',
                    to: process.env.BUSINESS_EMAIL || 'delivered@resend.dev',
                    subject: `⚠️ Insurance Expiring Soon: ${sub.business_name}`,
                    html: `
                        <div style="font-family:Arial,sans-serif; max-width:700px; margin:0 auto; background:#f9fafb; padding:32px;">
                            <div style="background:#fff; padding:32px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
                                <h2 style="color:#111; margin-top:0;">⚠️ Insurance Expiring Soon</h2>
                                
                                <p style="color:#666; font-size:16px;">
                                    The following insurance documents for <strong>${sub.business_name}</strong> are expiring soon:
                                </p>

                                ${insuranceListHtml}

                                <div style="margin-top:32px; padding:24px; background:#f3f4f6; border-radius:4px;">
                                    <h3 style="margin:0 0 12px 0; color:#111;">Subcontractor Details</h3>
                                    <table style="width:100%;">
                                        <tr>
                                            <td style="padding:4px 0; color:#666;"><strong>Name:</strong></td>
                                            <td style="padding:4px 0; color:#111;">${sub.first_name} ${sub.last_name}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding:4px 0; color:#666;"><strong>Business:</strong></td>
                                            <td style="padding:4px 0; color:#111;">${sub.business_name}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding:4px 0; color:#666;"><strong>Email:</strong></td>
                                            <td style="padding:4px 0; color:#111;"><a href="mailto:${sub.email}">${sub.email}</a></td>
                                        </tr>
                                        <tr>
                                            <td style="padding:4px 0; color:#666;"><strong>Phone:</strong></td>
                                            <td style="padding:4px 0; color:#111;"><a href="tel:${sub.phone}">${sub.phone}</a></td>
                                        </tr>
                                    </table>
                                </div>

                                <p style="margin-top:24px; color:#999; font-size:14px;">
                                    <em>This is an automated reminder based on AI-extracted expiry dates. Please verify dates with the actual documents.</em>
                                </p>
                            </div>
                        </div>
                    `
                });

                if (emailError) {
                    console.error(`Failed to send email for ${sub.business_name}:`, emailError);
                    continue;
                }

                // Update reminded_at timestamp for all insurance documents
                for (const insuranceId of insuranceIds) {
                    await sql`
                        UPDATE insurance_documents
                        SET reminded_at = CURRENT_TIMESTAMP
                        WHERE id = ${insuranceId}
                    `;
                }

                emailsSent.push({
                    subcontractor: sub.business_name,
                    email: sub.email,
                    documentsCount: insuranceIds.length
                });

                console.log(`Sent reminder email for ${sub.business_name} (${insuranceIds.length} documents)`);

            } catch (emailError) {
                console.error(`Error sending email for ${sub.business_name}:`, emailError);
            }
        }

        return res.status(200).json({
            success: true,
            message: `Processed ${expiringInsurance.length} expiring insurance documents`,
            emailsSent: emailsSent.length,
            details: emailsSent
        });

    } catch (error) {
        console.error('Cron job error:', error);
        return res.status(500).json({ error: error.message });
    }
}
