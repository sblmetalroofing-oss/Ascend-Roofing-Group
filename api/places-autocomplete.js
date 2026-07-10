import { verifyOrigin } from "../lib/verify-origin.js";
import { rateLimit } from "../lib/rate-limit.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // Prevent abuse of the billable Google Places API from off-site callers.
  if (!verifyOrigin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Requests are debounced 250ms client-side; 20/min covers a human
  // retyping an address a few times while capping scripted billing abuse.
  const rl = await rateLimit(req, { name: "places-autocomplete", limit: 20, windowMs: 60 * 1000 });
  if (rl.limited) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ predictions: [], error: "Too many requests" });
  }

  const { input } = req.query;

  if (!input || input.trim().length < 3) {
    return res.status(400).json({ predictions: [] });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error(
      "GOOGLE_MAPS_API_KEY is not defined in Vercel Environment Variables",
    );
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    // Fetch completions from Google Places Autocomplete API
    // Restricting by country:au (Australia) to keep results relevant for QLD
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:au&key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) },
    );

    const data = await response.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Google API returned status: ${data.status}`);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Google Places Proxy Error:", error);
    return res.status(500).json({ error: "Failed to fetch predictions" });
  }
}
