import { Resend } from 'resend';
import { verifyOrigin } from '../lib/verify-origin.js';
import { sanitize } from '../lib/sanitize.js';
import { rateLimit } from '../lib/rate-limit.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Signature images are small canvas PNGs; anything past this is abuse.
const MAX_SIGNATURE_LENGTH = 300 * 1024; // ~220 KB decoded

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!verifyOrigin(req)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const rl = await rateLimit(req, { name: 'submit-colour', limit: 5, windowMs: 10 * 60 * 1000 });
    if (rl.limited) {
        res.setHeader('Retry-After', String(rl.retryAfter));
        return res.status(429).json({ success: false, message: 'Too many requests. Please wait a few minutes and try again.' });
    }

    const { firstName, lastName, jobAddress, roofColour, gutterColour, fasciaColour, signature } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !jobAddress) {
        return res.status(400).json({ success: false, message: 'Missing required fields: firstName, lastName, jobAddress.' });
    }

    if (typeof signature === 'string' && signature.length > MAX_SIGNATURE_LENGTH) {
        return res.status(400).json({ success: false, message: 'Signature image is too large. Please try signing again.' });
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

    // Build signature — data: URLs are blocked by email clients, so send as CID attachment
    const isValidDataUrl = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(signature);
    let signatureHtml = `<p>${safeSignature}</p>`;
    let attachments = [];
    if (!isTyped && signature && isValidDataUrl) {
        // Extract mime type and base64 content from data URL
        const mimeMatch = signature.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
        const mimeType = `image/${mimeMatch[1]}`;
        const base64Content = mimeMatch[2];
        attachments = [{
            filename: 'signature.png',
            content: base64Content,
            content_type: mimeType,
            content_id: 'signature',
            inline: true,
        }];
        signatureHtml = `<img src="cid:signature" alt="Customer Signature" style="max-width:400px; border:1px solid #ccc; padding:8px; background:#fff;">`;
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
            attachments,
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
            return res.status(400).json({ success: false, message: 'Failed to send the confirmation. Please try again or call us.' });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}
