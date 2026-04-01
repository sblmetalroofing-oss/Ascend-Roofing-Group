import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Sanitize user input to prevent XSS in HTML emails
function sanitize(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { name, email, phone, address, roof_type, service, message } = req.body;

  // Validate required fields
  if (!name || !email || !phone || !address) {
    return res.status(400).json({ success: false, message: 'Missing required fields: name, email, phone, address.' });
  }

  // Sanitize all inputs
  const safeName = sanitize(name);
  const safeEmail = sanitize(email);
  const safePhone = sanitize(phone);
  const safeAddress = sanitize(address);
  const safeRoofType = sanitize(roof_type);
  const safeService = sanitize(service);
  const safeMessage = sanitize(message);

  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY is not set. Logging data instead.");
      console.log("Form Data:", {
        name: safeName,
        email: safeEmail,
        phone: safePhone,
        address: safeAddress,
        roof_type: safeRoofType,
        service: safeService,
        message: safeMessage,
      });
      return res
        .status(200)
        .json({
          success: true,
          message: "Form submitted successfully (Simulation)",
        });
    }

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Ascend Website <onboarding@resend.dev>",
      to: process.env.BUSINESS_EMAIL || "admin@ascendroofinggroup.com.au",
      reply_to: email,
      subject: `New Quote Request: ${safeName}`,
      html: `
        <h2>New Quote Request</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Phone:</strong> ${safePhone}</p>
        <p><strong>Property Address:</strong> ${safeAddress}</p>
        <p><strong>Current Roof Type:</strong> ${safeRoofType}</p>
        <p><strong>Service required:</strong> ${safeService}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      `,
    });

    if (error) {
      console.error("Resend Error:", error);
      return res.status(400).json({ success: false, error });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Server Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}
