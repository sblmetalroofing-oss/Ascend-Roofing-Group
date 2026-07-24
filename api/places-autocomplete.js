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
    // Places API (New). The legacy /maps/api/place/autocomplete endpoint
    // answers REQUEST_DENIED on Google Cloud projects that can't enable the
    // retired legacy Places API, which silently killed the address dropdown.
    // Region restricted to Australia to keep results relevant for QLD.
    const response = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify({
          input: input.trim(),
          includedRegionCodes: ["au"],
        }),
        signal: AbortSignal.timeout(5000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      // Surface Google's real reason (e.g. "Places API (New) has not been
      // used in project ... before or it is disabled") in Vercel logs.
      throw new Error(
        `Google API HTTP ${response.status}: ${data?.error?.status || "UNKNOWN"} — ${data?.error?.message || "no message"}`,
      );
    }

    // Map to the legacy response shape the frontend dropdown consumes.
    const predictions = (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => ({ description: p.text?.text || "", place_id: p.placeId }))
      .filter((p) => p.description);

    return res.status(200).json({ status: "OK", predictions });
  } catch (error) {
    console.error("Google Places Proxy Error:", error);
    return res.status(500).json({ error: "Failed to fetch predictions" });
  }
}
