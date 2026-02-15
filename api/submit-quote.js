export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const data = req.body;

        // Log the data (Server-side log, visible in Vercel Dashboard)
        console.log('New Quote Request Received:', data);

        // TODO: Integrate email sending logic here (e.g., using Resend, Nodemailer, or SendGrid)
        // const { name, phone, email, service, message } = data;
        // await sendEmail({ ... });

        // Return success response
        return res.status(200).json({ success: true, message: 'Quote request received successfully!' });

    } catch (error) {
        console.error('Error processing quote request:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}
