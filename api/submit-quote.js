import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    // Environment Variable Fix: Ensure BUSINESS_EMAIL is set to admin@ascendroofinggroup.com.au
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { name, email, phone, service, message } = req.body;

    // Debug Logs
    console.log('--- Debugging Quote Submission ---');
    console.log('RESEND_API_KEY Present:', !!process.env.RESEND_API_KEY);
    console.log('BUSINESS_EMAIL:', process.env.BUSINESS_EMAIL || '(Not Set - using default)');
    console.log('FROM_EMAIL:', process.env.FROM_EMAIL || '(Not Set - using default)');
    console.log('----------------------------------');

    try {
        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY is not set. Logging data instead.');
            console.log('Form Data:', req.body);
            return res.status(200).json({ success: true, message: 'Form submitted successfully (Simulation)' });
        }

        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'Ascend Website <onboarding@resend.dev>',
            to: process.env.BUSINESS_EMAIL || 'delivered@resend.dev', // Default to Resend's test address
            reply_to: email,
            subject: `New Quote Request: ${name}`,
            html: `
        <h2>New Quote Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Service:</strong> ${service}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
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
