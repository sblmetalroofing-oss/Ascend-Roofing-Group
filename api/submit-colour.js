import { Resend } from 'resend';

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

    const { firstName, lastName, jobAddress, roofColour, gutterColour, fasciaColour, signature } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !jobAddress) {
        return res.status(400).json({ success: false, message: 'Missing required fields: firstName, lastName, jobAddress.' });
    }

    // Sanitize all inputs
    const safeFirst = sanitize(firstName);
    const safeLast = sanitize(lastName);
    const safeAddress = sanitize(jobAddress);
    const safeRoof = sanitize(roofColour) || 'Not selected';
    const safeGutter = sanitize(gutterColour) || 'Not selected';
    const safeFascia = sanitize(fasciaColour) || 'Not selected';

    // Determine signature display
    const isTyped = typeof signature === 'string' && signature.startsWith('Typed:');
    const safeSignature = isTyped ? sanitize(signature) : '[Drawn Signature - see image below]';

    // Build signature image tag if drawn
    // Strictly validate the data URL to prevent protocol-based XSS (e.g. javascript: URLs)
    const isValidDataUrl = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(signature);
    let signatureHtml = `<p>${safeSignature}</p>`;
    if (!isTyped && signature && isValidDataUrl) {
        signatureHtml = `<img src="${signature}" alt="Customer Signature" style="max-width:400px; border:1px solid #ccc; padding:8px; background:#fff;">`;
    }

    try {
        if (!process.env.RESEND_API_KEY) {
            console.error('RESEND_API_KEY is not set. Cannot send colour confirmation email.');
            return res.status(503).json({ success: false, message: 'Email service not configured.' });
        }

        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Ascend Website <onboarding@resend.dev>',
            to: process.env.BUSINESS_EMAIL || 'admin@ascendroofinggroup.com.au',
            subject: `Colour Confirmation: ${safeFirst} ${safeLast} — ${safeAddress}`,
            html: `
        <h2>Colour Confirmation</h2>
        <table style="border-collapse:collapse; width:100%; max-width:500px;">
            <tr>
                <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Customer</td>
                <td style="padding:8px; border:1px solid #ddd;">${safeFirst} ${safeLast}</td>
            </tr>
            <tr>
                <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Job Address</td>
                <td style="padding:8px; border:1px solid #ddd;">${safeAddress}</td>
            </tr>
            <tr>
                <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Roof Colour</td>
                <td style="padding:8px; border:1px solid #ddd;">${safeRoof}</td>
            </tr>
            <tr>
                <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Gutter Colour</td>
                <td style="padding:8px; border:1px solid #ddd;">${safeGutter}</td>
            </tr>
            <tr>
                <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Fascia Colour</td>
                <td style="padding:8px; border:1px solid #ddd;">${safeFascia}</td>
            </tr>
        </table>
        <h3 style="margin-top:24px;">Customer Signature</h3>
        ${signatureHtml}
      `
        });

        if (error) {
            console.error('Resend Error:', error);
            return res.status(400).json({ success: false, error });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}
