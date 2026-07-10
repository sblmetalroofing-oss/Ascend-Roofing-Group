import { Resend } from "resend";
import { verifyOrigin } from "../lib/verify-origin.js";
import { geocodeAddress, buildDisplayAddress } from "../lib/geocode-address.js";
import { sanitize, isValidEmail } from "../lib/sanitize.js";
import { rateLimit } from "../lib/rate-limit.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  if (!verifyOrigin(req)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const rl = await rateLimit(req, { name: "submit-quote", limit: 5, windowMs: 10 * 60 * 1000 });
  if (rl.limited) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ success: false, message: "Too many requests. Please wait a few minutes and try again." });
  }

  const { name, email, phone, address, roof_type, service, message } = req.body;

  // Validate required fields
  if (!name || !email || !phone || !address) {
    return res.status(400).json({ success: false, message: 'Missing required fields: name, email, phone, address.' });
  }

  // Email is used as the reply-to header — must be a plausible address
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  // Best-effort enrich the address with suburb/postcode so the lead email
  // carries the suburb even when the customer typed it without picking a
  // Google autocomplete suggestion. Never block the lead on geocode failure.
  let displayAddress = address;
  try {
    const geo = await geocodeAddress(address);
    if (!geo.error) {
      displayAddress = buildDisplayAddress(address, geo);
    }
  } catch (_) {
    /* geocoding unavailable — fall back to the raw address */
  }

  // Sanitize all inputs
  const safeName = sanitize(name);
  const safeEmail = sanitize(email);
  const safePhone = sanitize(phone);
  const safeAddress = sanitize(displayAddress);
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
      from: process.env.FROM_EMAIL || "Ascend Website <onboarding@resend.dev>",
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
      return res.status(400).json({ success: false, message: "Failed to send your request. Please try again or call us." });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Server Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
}
